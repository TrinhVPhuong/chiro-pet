import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRMAClipLoader } from './VRMAClipLoader';
import { SectionedPlayback } from './SectionedPlayback';
import { ExpressionController } from './ExpressionController';
import { ProceduralController } from './ProceduralController';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { listenAnimationCommand } from '../../services/animation';
import { notifyAnimationFinished } from '../../services/tauriEvents';
import type { AnimationCommand, AnimationManifest, AnimationManifestEntry } from '../../types/animation';
import type { ProceduralAnimationSettings } from '../../types/procedural';

export class AnimationController {
    private vrm: VRM;
    private mixer: THREE.AnimationMixer;
    private clipLoader: VRMAClipLoader;
    private sectionedPlayback: SectionedPlayback;

    // Controllers
    private expressionController: ExpressionController;
    private proceduralController: ProceduralController;

    // Layers
    private baseAction: THREE.AnimationAction | null = null;
    private currentAction: THREE.AnimationAction | null = null;
    private currentAnimationId: string | null = null;

    // Sequencing
    private sequenceIndices: Map<string, number> = new Map();
    private currentSequenceAborter: (() => void) | null = null;

    private manifest: AnimationManifest | null = null;
    private appDataDirPath: string | null = null;
    private unlistenCommand: (() => void) | null = null;

    // Liveliness
    private lookAtTargetObj = new THREE.Object3D();
    private mouseMoveListener: ((e: MouseEvent) => void) | null = null;
    
    // Conflict Resolver state
    private targetConflictWeight: number = 1.0;
    private currentConflictWeight: number = 1.0;

    constructor(vrm: VRM) {
        this.vrm = vrm;
        this.mixer = new THREE.AnimationMixer(vrm.scene);
        this.clipLoader = new VRMAClipLoader();
        this.sectionedPlayback = new SectionedPlayback(this.mixer);
        this.expressionController = new ExpressionController(vrm);
        this.proceduralController = new ProceduralController(vrm);
    }

    public async initialize(): Promise<void> {
        console.log("AnimationController: initialize start");
        this.vrm.scene.add(this.lookAtTargetObj);
        if (this.vrm.lookAt) {
            this.vrm.lookAt.target = this.lookAtTargetObj;
        }

        this.mouseMoveListener = (e: MouseEvent) => {
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = -(e.clientY / window.innerHeight) * 2 + 1;
            // Map NDC to world target loosely in front of the character
            this.proceduralController.targetLookAt.set(x * 3.0, y * 2.0 + 1.2, 3.0);
        };
        window.addEventListener('mousemove', this.mouseMoveListener);
        
        // Fetch Procedural Settings
        try {
            const settings = await invoke<ProceduralAnimationSettings>('procedural_get_settings');
            this.proceduralController.setSettings(settings);
            console.log("AnimationController: Procedural settings loaded", settings);
        } catch (e) {
            console.warn("AnimationController: Failed to load procedural settings", e);
        }
        try {
            this.appDataDirPath = await invoke<string>('get_app_data_dir_path');
        } catch (e) {
            console.warn('Failed to get AppData dir, falling back to public assets', e);
        }
        console.log("AnimationController: appDataDirPath is", this.appDataDirPath);

        // Load manifest
        try {
            // Priority: Try AppData manifest first
            try {
                if (this.appDataDirPath) {
                    const manifestContent = await readTextFile(`${this.appDataDirPath}/animations/manifest.json`);
                    this.manifest = JSON.parse(manifestContent);
                } else {
                    throw new Error("No AppData path");
                }
            } catch (e) {
                console.warn('Failed to load external manifest via FS, falling back to public fetch', e);
                const response = await fetch('/animation/manifest.json');
                this.manifest = await response.json();
            }
            console.log("AnimationController: loaded manifest", this.manifest);

            // Set initial idle animation if found
            if (this.manifest && this.manifest.animations.length > 0) {
                const idleEntry = this.manifest.animations.find(a => a.tags?.includes('idle'));
                if (idleEntry) {
                    console.log("AnimationController: playing base animation", idleEntry);
                    await this.playBaseAnimation(idleEntry);
                    console.log("AnimationController: base animation playing");
                }
            }
        } catch (error) {
            console.error('Failed to load animation manifest:', error);
        }

        console.log("AnimationController: listening to commands");
        // Listen for commands from backend
        this.unlistenCommand = await listenAnimationCommand((command) => {
            this.handleCommand(command);
        });
        console.log("AnimationController: initialize end");
    }

    private async loadClip(filename: string): Promise<THREE.AnimationClip | null> {
        let assetUrl = `/animation/${filename}`;
        let clip: THREE.AnimationClip | null = null;
        
        if (this.appDataDirPath) {
            assetUrl = convertFileSrc(`${this.appDataDirPath}/animations/${filename}`);
            clip = await this.clipLoader.load(assetUrl, this.vrm);
        }

        if (!clip) {
            clip = await this.clipLoader.load(`/animation/${filename}`, this.vrm);
        }
        return clip;
    }

    private async handleCommand(command: AnimationCommand): Promise<void> {
        // Update expression (Layer 2)
        if (command.expression !== undefined) {
            this.expressionController.setExpression(command.expression);
        }

        if (!command.animation_id || !this.manifest) return;

        // Prevent reset if the same animation is already playing
        if (this.currentAnimationId === command.animation_id) {
            return;
        }

        const entry = this.manifest.animations.find(a => a.id === command.animation_id);
        if (!entry) return;

        // Resolve files to play based on playback_type
        let filesToLoad: string[] = [];
        if (entry.playback_type === 'random' && entry.files && entry.files.length > 0) {
            let totalWeight = 0;
            const fileEntries = entry.files.map(f => {
                if (typeof f === 'string') return { file: f, weight: 1 };
                return { file: f.file, weight: f.weight ?? 1 };
            });
            for (const f of fileEntries) totalWeight += f.weight;
            let randomVal = Math.random() * totalWeight;
            let selectedFile = fileEntries[0].file;
            for (const f of fileEntries) {
                randomVal -= f.weight;
                if (randomVal <= 0) {
                    selectedFile = f.file;
                    break;
                }
            }
            filesToLoad = [selectedFile];
        } else if (entry.playback_type === 'sequence' && entry.files && entry.files.length > 0) {
            filesToLoad = entry.files.map(f => typeof f === 'string' ? f : f.file);
        } else {
            const firstFile = entry.file || (entry.files && entry.files[0]);
            filesToLoad = [typeof firstFile === 'string' ? firstFile : firstFile?.file || ''];
        }
        filesToLoad = filesToLoad.filter(f => f !== '');

        if (filesToLoad.length === 0) return;

        // Abort previous sequence if playing
        if (this.currentSequenceAborter) {
            this.currentSequenceAborter();
            this.currentSequenceAborter = null;
        }
        this.currentAnimationId = command.animation_id;

        // Update Conflict Resolver Weight based on tags
        if (entry.tags) {
            this.updateConflictWeightFromTags(entry.tags);
        }

        if (entry.playback_type === 'sequence' && filesToLoad.length > 1) {
            this.playSequence(filesToLoad, command, entry);
        } else {
            const clip = await this.loadClip(filesToLoad[0]);
            if (clip) {
                if (command.section && entry.sections) {
                    // Handle sectioned playback
                    this.sectionedPlayback.play(
                        clip,
                        0.2,
                        0.6,
                        0.2,
                        command.crossfade_ms,
                        () => {
                            this.returnToBase(command.crossfade_ms / 1000);
                        }
                    );
                    if (this.currentAction) {
                        this.currentAction.fadeOut(command.crossfade_ms / 1000);
                    } else if (this.baseAction) {
                        this.baseAction.fadeOut(command.crossfade_ms / 1000);
                    }
                } else {
                    this.playActionAnimation(clip, command.loop_anim, command.crossfade_ms);
                }
            }
        }
    }

    private updateConflictWeightFromTags(tags: string[]) {
        // Simple heuristic: if it's a dance or action, disable procedural. If idle, full procedural.
        if (tags.some(t => t.includes('dance') || t.includes('actions') || t.includes('exercises'))) {
            this.targetConflictWeight = 0.0;
        } else if (tags.some(t => t.includes('idle') || t.includes('emotions'))) {
            // Allow full procedural during idle. For emotions, keep it partial or full based on spec. 
            // In spec: emotion reaction drops weight to 0.15 for lookAt.
            this.targetConflictWeight = 0.2; 
            if (tags.some(t => t.includes('idle'))) {
                this.targetConflictWeight = 1.0;
            }
        } else {
            this.targetConflictWeight = 1.0;
        }
    }

    private async playSequence(files: string[], command: AnimationCommand, entry: AnimationManifestEntry) {
        let isAborted = false;
        this.currentSequenceAborter = () => { isAborted = true; };

        let currentIndex = this.sequenceIndices.get(entry.id) || 0;
        
        const playNext = async () => {
            if (isAborted) return;
            const clip = await this.loadClip(files[currentIndex]);
            if (!clip) return;
            
            const crossfadeSec = command.crossfade_ms / 1000;
            const newAction = this.mixer.clipAction(clip);
            
            const isLast = currentIndex === files.length - 1;
            const shouldLoop = isLast && command.loop_anim;

            // Dual Action Self-Crossfading for sequence ending loops
            newAction.setLoop(THREE.LoopOnce, 1);
            newAction.clampWhenFinished = true;

            newAction.reset();
            newAction.setEffectiveWeight(1.0);

            if (this.currentAction) {
                newAction.crossFadeFrom(this.currentAction, crossfadeSec, false);
            } else if (this.baseAction && this.baseAction.isRunning()) {
                newAction.crossFadeFrom(this.baseAction, crossfadeSec, false);
            }

            newAction.play();
            this.currentAction = newAction;

            const onFinished = (e: any) => {
                if (e.action === newAction) {
                    this.mixer.removeEventListener('finished', onFinished);
                    if (!isAborted) {
                        currentIndex = (currentIndex + 1) % files.length;
                        this.sequenceIndices.set(entry.id, currentIndex);
                        if (currentIndex === 0 && !shouldLoop) {
                            this.returnToBase(crossfadeSec);
                        } else {
                            playNext();
                        }
                    }
                }
            };
            this.mixer.addEventListener('finished', onFinished);
        };

        playNext();
    }

    private async playBaseAnimation(entry: AnimationManifestEntry): Promise<void> {
        const playNextBase = async () => {
            let filesToLoad: string[] = [];
            if (entry.playback_type === 'random' && entry.files && entry.files.length > 0) {
                let totalWeight = 0;
                const fileEntries = entry.files.map(f => {
                    if (typeof f === 'string') return { file: f, weight: 1 };
                    return { file: f.file, weight: f.weight ?? 1 };
                });
                for (const f of fileEntries) totalWeight += f.weight;
                let randomVal = Math.random() * totalWeight;
                let selectedFile = fileEntries[0].file;
                for (const f of fileEntries) {
                    randomVal -= f.weight;
                    if (randomVal <= 0) {
                        selectedFile = f.file;
                        break;
                    }
                }
                filesToLoad = [selectedFile];
            } else {
                const firstFile = entry.file || (entry.files && entry.files[0]);
                filesToLoad = [typeof firstFile === 'string' ? firstFile : firstFile?.file || ''];
            }
            
            if (filesToLoad.length === 0 || !filesToLoad[0]) return;

            const clip = await this.loadClip(filesToLoad[0]);
            if (clip) {
                const newAction = this.mixer.clipAction(clip);
                newAction.setLoop(THREE.LoopOnce, 1);
                newAction.clampWhenFinished = true;
                newAction.reset();
                newAction.setEffectiveWeight(1.0);

                if (this.baseAction) {
                    newAction.crossFadeFrom(this.baseAction, entry.crossfade_ms / 1000, false);
                }
                newAction.play();
                this.baseAction = newAction;

                const onFinished = (e: any) => {
                    if (e.action === newAction) {
                        this.mixer.removeEventListener('finished', onFinished);
                        playNextBase();
                    }
                };
                this.mixer.addEventListener('finished', onFinished);
            }
        };

        playNextBase();
    }

    private playActionAnimation(clip: THREE.AnimationClip, loop: boolean, crossfadeMs: number): void {
        const crossfadeSec = crossfadeMs / 1000;

        // Determine if we are doing a self-crossfade loop
        let isSelfCrossfading = false;
        let newAction: THREE.AnimationAction;
        
        if (loop && this.currentAction && this.currentAction.getClip() === clip) {
            // Self-crossfade: We need to create a duplicate action for the same clip to crossfade into it
            // Three.js by default returns the same action for the same clip. We force a new one using a clone of the clip
            // or by utilizing the Root.
            
            // To be safe and simple without cloning clips which consumes memory, 
            // Three.js `AnimationMixer.clipAction` can take an optional `root` or `blendMode`.
            // Alternatively, since we use `LoopOnce`, we can just fade out the current and fade in a new Action.
            // A common trick is to clone the clip just for the overlapping period.
            const clonedClip = clip.clone();
            clonedClip.name = clip.name; // Keep name for identification
            newAction = this.mixer.clipAction(clonedClip);
            isSelfCrossfading = true;
        } else {
            newAction = this.mixer.clipAction(clip);
        }

        newAction.setLoop(THREE.LoopOnce, 1);
        newAction.clampWhenFinished = true;

        newAction.reset();
        newAction.setEffectiveWeight(1.0);

        if (this.currentAction) {
            newAction.crossFadeFrom(this.currentAction, crossfadeSec, false);
            // If it was a self-crossfade cloned clip, we should clean up the old action eventually
            if (isSelfCrossfading) {
                const oldAction = this.currentAction;
                setTimeout(() => {
                    this.mixer.uncacheAction(oldAction.getClip());
                }, crossfadeMs + 100);
            }
        } else if (this.baseAction && this.baseAction.isRunning()) {
            newAction.crossFadeFrom(this.baseAction, crossfadeSec, false);
        }

        newAction.play();
        this.currentAction = newAction;

        const onFinished = (e: any) => {
            if (e.action === newAction) {
                this.mixer.removeEventListener('finished', onFinished);
                if (loop && this.currentAnimationId) {
                    // Loop manually by re-triggering with crossfade (Dual Action Self-Crossfade)
                    this.playActionAnimation(clip, loop, crossfadeMs);
                } else {
                    this.returnToBase(crossfadeSec);
                    // Notify backend if this was a transition or one-shot
                    if (this.currentAnimationId === clip.name || !loop) {
                        notifyAnimationFinished();
                    }
                }
            }
        };
        this.mixer.addEventListener('finished', onFinished);
    }

    private returnToBase(crossfadeSec: number) {
        if (this.baseAction) {
            this.baseAction.reset();
            this.baseAction.setEffectiveWeight(1.0);
            if (this.currentAction) {
                this.baseAction.crossFadeFrom(this.currentAction, crossfadeSec, false);
            }
            this.baseAction.play();
        }
        this.currentAction = null;
        this.currentAnimationId = null;
        
        // Reset conflict weight to idle when returning to base
        this.targetConflictWeight = 1.0;
    }

    public update(deltaTime: number): void {
        // 1. Layer 0-1: Animation Mixer
        this.mixer.update(deltaTime);
        this.sectionedPlayback.update(deltaTime);

        // Update Conflict Resolver interpolation
        this.currentConflictWeight += (this.targetConflictWeight - this.currentConflictWeight) * 5.0 * deltaTime;
        this.proceduralController.conflictWeight = Math.max(0, Math.min(1, this.currentConflictWeight));

        // 2. Layer 2: Expression System
        this.expressionController.update(deltaTime);

        // 3. Layer 3: Procedural System
        this.proceduralController.update(deltaTime);

        // 4. Layer 4: VRM Physics & Updates
        this.vrm.update(deltaTime);
    }

    public dispose(): void {
        this.expressionController.dispose();
        this.proceduralController.dispose();
        if (this.mouseMoveListener) {
            window.removeEventListener('mousemove', this.mouseMoveListener);
        }
        if (this.unlistenCommand) {
            this.unlistenCommand();
        }
        this.mixer.stopAllAction();
        this.vrm.scene.animations.forEach(anim => this.mixer.uncacheClip(anim));
    }
}
