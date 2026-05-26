import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRMAClipLoader } from './VRMAClipLoader';
import { SectionedPlayback } from './SectionedPlayback';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { listenAnimationCommand } from '../../services/animation';
import type { AnimationCommand, AnimationManifest, AnimationManifestEntry } from '../../types/animation';

export class AnimationController {
    private vrm: VRM;
    private mixer: THREE.AnimationMixer;
    private clipLoader: VRMAClipLoader;
    private sectionedPlayback: SectionedPlayback;

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

    constructor(vrm: VRM) {
        this.vrm = vrm;
        this.mixer = new THREE.AnimationMixer(vrm.scene);
        this.clipLoader = new VRMAClipLoader();
        this.sectionedPlayback = new SectionedPlayback(this.mixer);
    }

    public async initialize(): Promise<void> {
        console.log("AnimationController: initialize start");
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
        // Update expression (Layer 4)
        if (command.expression && this.vrm.expressionManager) {
            // Reset all expressions
            Object.keys(this.vrm.expressionManager.expressions).forEach(name => {
                this.vrm.expressionManager!.setValue(name, 0);
            });
            // Set new expression
            this.vrm.expressionManager.setValue(command.expression, 1.0);
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
            const randomIndex = Math.floor(Math.random() * entry.files.length);
            filesToLoad = [entry.files[randomIndex]];
        } else if (entry.playback_type === 'sequence' && entry.files && entry.files.length > 0) {
            filesToLoad = entry.files;
        } else {
            filesToLoad = [entry.file || (entry.files && entry.files[0]) || ''];
        }
        filesToLoad = filesToLoad.filter(f => f !== '');

        if (filesToLoad.length === 0) return;

        // Abort previous sequence if playing
        if (this.currentSequenceAborter) {
            this.currentSequenceAborter();
            this.currentSequenceAborter = null;
        }
        this.currentAnimationId = command.animation_id;

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

            newAction.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
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

            if (!shouldLoop) {
                const onFinished = (e: any) => {
                    if (e.action === newAction) {
                        this.mixer.removeEventListener('finished', onFinished);
                        if (!isAborted) {
                            currentIndex = (currentIndex + 1) % files.length;
                            this.sequenceIndices.set(entry.id, currentIndex);
                            if (currentIndex === 0 && !command.loop_anim) {
                                this.returnToBase(crossfadeSec);
                            } else {
                                playNext();
                            }
                        }
                    }
                };
                this.mixer.addEventListener('finished', onFinished);
            }
        };

        playNext();
    }

    private async playBaseAnimation(entry: AnimationManifestEntry): Promise<void> {
        let filesToLoad: string[] = [];
        if (entry.playback_type === 'random' && entry.files && entry.files.length > 0) {
            const randomIndex = Math.floor(Math.random() * entry.files.length);
            filesToLoad = [entry.files[randomIndex]];
        } else {
            filesToLoad = [entry.file || (entry.files && entry.files[0]) || ''];
        }
        
        if (filesToLoad.length === 0 || !filesToLoad[0]) return;

        const clip = await this.loadClip(filesToLoad[0]);
        if (clip) {
            if (this.baseAction) this.baseAction.stop();
            this.baseAction = this.mixer.clipAction(clip);
            this.baseAction.setLoop(THREE.LoopRepeat, Infinity);
            this.baseAction.play();
        }
    }

    private playActionAnimation(clip: THREE.AnimationClip, loop: boolean, crossfadeMs: number): void {
        const crossfadeSec = crossfadeMs / 1000;

        const newAction = this.mixer.clipAction(clip);
        newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
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

        if (!loop) {
            const onFinished = (e: any) => {
                if (e.action === newAction) {
                    this.mixer.removeEventListener('finished', onFinished);
                    this.returnToBase(crossfadeSec);
                }
            };
            this.mixer.addEventListener('finished', onFinished);
        }
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
    }

    public update(deltaTime: number): void {
        this.mixer.update(deltaTime);
        this.sectionedPlayback.update(deltaTime);
    }

    public dispose(): void {
        if (this.unlistenCommand) {
            this.unlistenCommand();
        }
        this.mixer.stopAllAction();
        this.vrm.scene.animations.forEach(anim => this.mixer.uncacheClip(anim));
    }
}
