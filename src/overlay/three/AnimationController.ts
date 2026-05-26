import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { VRMAClipLoader } from './VRMAClipLoader';
import { SectionedPlayback } from './SectionedPlayback';
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

    // Procedural Layer state
    private breathingTime: number = 0;

    private manifest: AnimationManifest | null = null;
    private unlistenCommand: (() => void) | null = null;

    constructor(vrm: VRM) {
        this.vrm = vrm;
        this.mixer = new THREE.AnimationMixer(vrm.scene);
        this.clipLoader = new VRMAClipLoader();
        this.sectionedPlayback = new SectionedPlayback(this.mixer);
    }

    public async initialize(): Promise<void> {
        // Load manifest
        try {
            const response = await fetch('/animation/manifest.json');
            this.manifest = await response.json();

            // Set initial idle animation if found
            if (this.manifest && this.manifest.animations.length > 0) {
                const idleEntry = this.manifest.animations.find(a => a.tags?.includes('idle'));
                if (idleEntry) {
                    await this.playBaseAnimation(idleEntry);
                }
            }
        } catch (error) {
            console.error('Failed to load animation manifest:', error);
        }

        // Listen for commands from backend
        this.unlistenCommand = await listenAnimationCommand((command) => {
            this.handleCommand(command);
        });
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

        const entry = this.manifest.animations.find(a => a.id === command.animation_id);
        if (!entry) return;

        const clip = await this.clipLoader.load(`/animation/${entry.file}`, this.vrm);
        if (!clip) return;

        if (command.section && entry.sections) {
            // Handle sectioned playback (e.g. for Talking, Thinking)
            this.sectionedPlayback.play(
                clip,
                0.2, // Need real ratio from entry.sections
                0.6,
                0.2,
                command.crossfade_ms,
                () => {
                    // Back to base when section completes
                    if (this.baseAction) {
                        this.baseAction.setEffectiveWeight(1.0);
                        this.baseAction.play();
                    }
                }
            );

            // Fade out base action
            if (this.baseAction) {
                this.baseAction.fadeOut(command.crossfade_ms / 1000);
            }
        } else {
            // Standard action playback
            this.playActionAnimation(clip, command.loop_anim, command.crossfade_ms);
        }
    }

    private async playBaseAnimation(entry: AnimationManifestEntry): Promise<void> {
        const clip = await this.clipLoader.load(`/animation/${entry.file}`, this.vrm);
        if (clip) {
            if (this.baseAction) this.baseAction.stop();
            this.baseAction = this.mixer.clipAction(clip);
            this.baseAction.setLoop(THREE.LoopRepeat, Infinity);
            this.baseAction.play();
        }
    }

    private playActionAnimation(clip: THREE.AnimationClip, loop: boolean, crossfadeMs: number): void {
        const crossfadeSec = crossfadeMs / 1000;

        if (this.currentAction) {
            this.currentAction.fadeOut(crossfadeSec);
        }

        const newAction = this.mixer.clipAction(clip);
        newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        newAction.clampWhenFinished = !loop;

        // Reset and fade in
        newAction.reset();
        newAction.setEffectiveWeight(1.0);

        if (this.baseAction && this.baseAction.isRunning()) {
            newAction.crossFadeFrom(this.baseAction, crossfadeSec, false);
        }

        newAction.play();
        this.currentAction = newAction;

        if (!loop) {
            this.mixer.addEventListener('finished', (e) => {
                if (e.action === newAction) {
                    if (this.baseAction) {
                        this.baseAction.reset();
                        this.baseAction.fadeIn(crossfadeSec);
                        this.baseAction.play();
                    }
                    this.currentAction = null;
                }
            });
        }
    }

    public update(deltaTime: number): void {
        this.mixer.update(deltaTime);
        this.sectionedPlayback.update(deltaTime);

        // Update Layer 3: Procedural Overlay (Breathing)
        this.updateProceduralAnimations(deltaTime);
    }

    private updateProceduralAnimations(deltaTime: number): void {
        this.breathingTime += deltaTime;

        // Simple breathing via Spine bone scale/rotation
        const spine = this.vrm.humanoid?.getRawBoneNode('spine');
        if (spine) {
            // Very subtle breathing movement
            const scaleOffset = Math.sin(this.breathingTime * 2.0) * 0.01;
            spine.scale.set(1.0 + scaleOffset, 1.0 + scaleOffset, 1.0 + scaleOffset);

            // Adjust intensity based on whether an action is playing
            const intensity = this.currentAction?.isRunning() ? 0.2 : 1.0;

            // Slight rotation
            const rotOffset = Math.sin(this.breathingTime * 1.5) * 0.01 * intensity;
            spine.rotation.x = rotOffset;
        }
    }

    public dispose(): void {
        if (this.unlistenCommand) {
            this.unlistenCommand();
        }
        this.mixer.stopAllAction();
        this.vrm.scene.animations.forEach(anim => this.mixer.uncacheClip(anim));
    }
}
