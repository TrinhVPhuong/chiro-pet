import * as THREE from 'three';

export class SectionedPlayback {
    private mixer: THREE.AnimationMixer;
    private action: THREE.AnimationAction | null = null;
    private introTime: number = 0;
    private loopTime: number = 0;
    private totalTime: number = 0;
    private currentState: 'intro' | 'loop' | 'outro' | 'stopped' = 'stopped';
    private isRequestedExit: boolean = false;
    private onComplete: (() => void) | null = null;

    constructor(mixer: THREE.AnimationMixer) {
        this.mixer = mixer;
    }

    public play(
        clip: THREE.AnimationClip,
        introRatio: number = 0.2,
        loopRatio: number = 0.6,
        _outroRatio: number = 0.2,
        _crossfadeMs: number = 300,
        onComplete?: () => void
    ): void {
        this.stop();

        this.onComplete = onComplete || null;
        this.totalTime = clip.duration;
        this.introTime = this.totalTime * introRatio;
        this.loopTime = this.totalTime * loopRatio;

        this.action = this.mixer.clipAction(clip);
        this.action.setLoop(THREE.LoopOnce, 1);
        this.action.clampWhenFinished = true;

        // Start from beginning
        this.action.reset();
        this.action.play();

        // We handle looping manually in update()
        this.currentState = 'intro';
        this.isRequestedExit = false;

        // Optionally handle crossfade if there's an existing action (managed outside typically, but can be added here)
    }

    public requestExit(): void {
        if (this.currentState === 'intro' || this.currentState === 'loop') {
            this.isRequestedExit = true;
        }
    }

    public update(_deltaTime: number): void {
        if (!this.action || this.currentState === 'stopped') return;

        const time = this.action.time;

        switch (this.currentState) {
            case 'intro':
                if (time >= this.introTime) {
                    this.currentState = 'loop';
                }
                break;
            case 'loop':
                if (this.isRequestedExit) {
                    // Transition to outro
                    this.currentState = 'outro';
                } else if (time >= this.introTime + this.loopTime) {
                    // Loop back to start of loop section
                    this.action.time = this.introTime;
                }
                break;
            case 'outro':
                if (time >= this.totalTime - 0.01) { // small threshold
                    this.currentState = 'stopped';
                    this.action.stop();
                    if (this.onComplete) {
                        this.onComplete();
                    }
                }
                break;
        }
    }

    public stop(): void {
        if (this.action) {
            this.action.stop();
        }
        this.currentState = 'stopped';
        this.isRequestedExit = false;
    }
}
