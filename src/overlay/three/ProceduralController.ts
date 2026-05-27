import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { ProceduralAnimationSettings } from '../../types/procedural';

export class ProceduralController {
    private vrm: VRM;
    private settings: ProceduralAnimationSettings | null = null;
    
    // External states
    public conflictWeight: number = 1.0;
    public targetLookAt: THREE.Vector3 = new THREE.Vector3(0, 1.2, 3.0);
    private currentLookAt: THREE.Vector3 = new THREE.Vector3(0, 1.2, 3.0);
    
    // Timers & States
    private proceduralTime: number = 0;
    
    // Blink state
    private blinkTimer: number = 0;
    private nextBlinkIn: number = 3.0;
    private blinkPhase: 'waiting' | 'closing' | 'holding' | 'opening' = 'waiting';
    private currentBlinkWeight: number = 0;
    private pendingDoubleBlink: boolean = false;

    // Bone Refs
    private spine: THREE.Object3D | null = null;
    private chest: THREE.Object3D | null = null;
    private neck: THREE.Object3D | null = null;
    private head: THREE.Object3D | null = null;

    constructor(vrm: VRM) {
        this.vrm = vrm;
        this.spine = this.vrm.humanoid?.getRawBoneNode('spine') ?? null;
        this.chest = this.vrm.humanoid?.getRawBoneNode('chest') ?? this.vrm.humanoid?.getRawBoneNode('upperChest') ?? null;
        this.neck = this.vrm.humanoid?.getRawBoneNode('neck') ?? null;
        this.head = this.vrm.humanoid?.getRawBoneNode('head') ?? null;
    }

    public setSettings(settings: ProceduralAnimationSettings) {
        this.settings = settings;
    }

    public update(deltaTime: number) {
        if (!this.settings || !this.settings.enabled) return;

        this.proceduralTime += deltaTime;
        
        // Calculate effective intensity (global * conflict resolver)
        const intensity = this.settings.global_intensity * this.conflictWeight * (this.settings.reduce_motion ? 0.35 : 1.0);

        this.updateBlink(deltaTime);
        
        // Only update bone-based procedurals if intensity is > 0
        if (intensity > 0.001) {
            this.updateBreathing(intensity);
            this.updateMicroMotion(intensity);
        }

        this.updateLookAt(deltaTime, intensity);
    }

    private updateBlink(deltaTime: number) {
        if (!this.settings?.blink_enabled || !this.vrm.expressionManager) return;
        
        const s = this.settings.blink;
        this.blinkTimer += deltaTime;

        switch (this.blinkPhase) {
            case 'waiting':
                if (this.blinkTimer >= this.nextBlinkIn) {
                    this.blinkPhase = 'closing';
                    this.blinkTimer = 0;
                }
                break;
            case 'closing': {
                const t = Math.min(this.blinkTimer / s.close_duration_seconds, 1.0);
                this.currentBlinkWeight = t * t * (3.0 - 2.0 * t); // smoothstep
                if (t >= 1.0) {
                    this.blinkPhase = 'holding';
                    this.blinkTimer = 0;
                }
                break;
            }
            case 'holding':
                this.currentBlinkWeight = 1.0;
                if (this.blinkTimer >= s.hold_duration_seconds) {
                    this.blinkPhase = 'opening';
                    this.blinkTimer = 0;
                }
                break;
            case 'opening': {
                const t = Math.min(this.blinkTimer / s.open_duration_seconds, 1.0);
                this.currentBlinkWeight = 1.0 - (t * t * (3.0 - 2.0 * t)); // smoothstep inverse
                if (t >= 1.0) {
                    this.currentBlinkWeight = 0;
                    this.blinkPhase = 'waiting';
                    this.blinkTimer = 0;

                    if (this.pendingDoubleBlink) {
                        this.nextBlinkIn = 0.15;
                        this.pendingDoubleBlink = false;
                    } else {
                        this.pendingDoubleBlink = Math.random() < s.double_blink_chance;
                        this.nextBlinkIn = s.min_interval_seconds + Math.random() * (s.max_interval_seconds - s.min_interval_seconds);
                    }
                }
                break;
            }
        }

        // Apply blink
        // Use 'blink' expression if available, fallback to blinkLeft/Right if needed
        const blinkName = 'blink';
        if (this.vrm.expressionManager.getExpression(blinkName)) {
            // Use Math.max in case ExpressionController also tries to close eyes
            const existing = this.vrm.expressionManager.getValue(blinkName) || 0;
            this.vrm.expressionManager.setValue(blinkName, Math.max(existing, this.currentBlinkWeight));
        }
    }

    private updateBreathing(intensity: number) {
        if (!this.settings?.breathing_enabled) return;
        const s = this.settings.breathing;
        
        const freq = s.frequency_per_minute / 60.0;
        const wave = Math.sin(this.proceduralTime * Math.PI * 2 * freq);
        
        if (this.chest) {
            const rotX = wave * s.amplitude_chest * intensity;
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0));
            this.chest.quaternion.multiply(q);
        }

        if (this.spine) {
            const rotX = wave * s.amplitude_spine * intensity;
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, 0, 0));
            this.spine.quaternion.multiply(q);
        }
    }

    private updateMicroMotion(intensity: number) {
        if (!this.settings?.micro_motion_enabled) return;
        const s = this.settings.micro_motion;

        // Simple layered noise
        const t = this.proceduralTime * s.noise_speed;
        const noiseYaw = (Math.sin(t) * 0.6 + Math.sin(t * 1.73 + 1.2) * 0.3) * (s.head_noise_amplitude_deg * Math.PI / 180.0) * intensity;
        const noisePitch = (Math.sin(t * 0.8 + 10.0) * 0.6 + Math.sin(t * 1.5 + 2.4) * 0.3) * (s.head_noise_amplitude_deg * 0.5 * Math.PI / 180.0) * intensity;

        if (this.head) {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(noisePitch, noiseYaw, 0));
            this.head.quaternion.multiply(q);
        }
        
        if (this.neck) {
            const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(noisePitch * 0.5, noiseYaw * 0.5, 0));
            this.neck.quaternion.multiply(q);
        }
    }

    private updateLookAt(deltaTime: number, intensity: number) {
        if (!this.settings?.look_at_cursor_enabled || !this.vrm.lookAt) return;
        
        // Lerp the internal target position based on conflict weight
        // If conflictWeight is 0 (e.g. dancing), we want to look straight ahead (0, 1.2, 3.0)
        // If 1, we look at the actual mouse target
        
        const straightAhead = new THREE.Vector3(0, 1.2, 3.0);
        
        // Blend between straight ahead and mouse target based on intensity
        const actualTarget = new THREE.Vector3().copy(straightAhead).lerp(this.targetLookAt, intensity);
        
        this.currentLookAt.lerp(actualTarget, deltaTime * 5.0);
        
        if (this.vrm.lookAt.target) {
            this.vrm.lookAt.target.position.copy(this.currentLookAt);
        }
    }

    public dispose() {
        if (this.vrm.expressionManager) {
            this.vrm.expressionManager.setValue('blink', 0);
        }
    }
}
