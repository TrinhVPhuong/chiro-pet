import type { VRM } from '@pixiv/three-vrm';

export class ExpressionController {
    private vrm: VRM;
    private currentExpression: string | null = null;
    private targetWeight: number = 0;
    private currentWeight: number = 0;
    
    // Lerp speed
    private readonly smoothing = 10.0;

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    public setExpression(expression: string | null, weight: number = 1.0) {
        if (this.currentExpression && this.currentExpression !== expression) {
            // Immediately zero out the old expression to avoid weird combinations
            if (this.vrm.expressionManager) {
                this.vrm.expressionManager.setValue(this.currentExpression, 0);
            }
        }
        
        this.currentExpression = expression;
        this.targetWeight = expression ? weight : 0.0;
        
        // If we switched to a new expression, reset current weight to lerp up
        if (expression && this.currentWeight === 0) {
            this.currentWeight = 0;
        }
    }

    public update(deltaTime: number) {
        if (!this.vrm.expressionManager) return;

        // Smoothly interpolate the weight
        this.currentWeight += (this.targetWeight - this.currentWeight) * this.smoothing * deltaTime;
        
        // Clamp to prevent floating point overshoot
        this.currentWeight = Math.max(0, Math.min(1, this.currentWeight));

        if (this.currentExpression) {
            this.vrm.expressionManager.setValue(this.currentExpression, this.currentWeight);
        }
    }

    public dispose() {
        if (this.vrm.expressionManager && this.currentExpression) {
            this.vrm.expressionManager.setValue(this.currentExpression, 0);
        }
        this.currentExpression = null;
        this.currentWeight = 0;
        this.targetWeight = 0;
    }
}
