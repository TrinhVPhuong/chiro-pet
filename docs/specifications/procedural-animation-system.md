# **Chiro-Pet Procedural Animation System**

> Tài liệu thiết kế chính thức cho **Procedural Animation System** của **Chiro-Pet**.  
> Hệ thống này tạo các chuyển động sống động theo thời gian thực như **blink**, **breathing**, **look-at cursor**, **idle sway**, **micro motion**, **expression modulation**, **spring bone tuning** và các lớp animation phụ không cần clip keyframe.
>
> **Nguyên tắc lõi:** Procedural Animation là lớp **secondary motion** bổ trợ cho animation clip, không thay thế Animation Runtime. Nó phải chạy nhẹ, có thể tắt riêng từng module, tôn trọng state/mode/privacy/settings, và không được phá pose chính từ `AnimationMixer`.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Vai trò trong Animation Stack](#3-vai-trò-trong-animation-stack)
4. [Kiến trúc tổng thể](#4-kiến-trúc-tổng-thể)
5. [Procedural Modules](#5-procedural-modules)
6. [Data Model](#6-data-model)
7. [Runtime Update Loop](#7-runtime-update-loop)
8. [Blink System](#8-blink-system)
9. [Breathing System](#9-breathing-system)
10. [Look-at Cursor System](#10-look-at-cursor-system)
11. [Idle Sway System](#11-idle-sway-system)
12. [Micro Motion System](#12-micro-motion-system)
13. [Expression Modulation](#13-expression-modulation)
14. [Spring Bone Tuning](#14-spring-bone-tuning)
15. [Mode & State Modulation](#15-mode--state-modulation)
16. [Priority & Conflict Rules](#16-priority--conflict-rules)
17. [Settings Integration](#17-settings-integration)
18. [Asset & VRM Integration](#18-asset--vrm-integration)
19. [Frontend Implementation](#19-frontend-implementation)
20. [Backend Coordination](#20-backend-coordination)
21. [IPC Contract](#21-ipc-contract)
22. [Debug Tools](#22-debug-tools)
23. [Performance Considerations](#23-performance-considerations)
24. [Error Handling](#24-error-handling)
25. [File Structure](#25-file-structure)
26. [Implementation Checklist](#26-implementation-checklist)
27. [Glossary](#27-glossary)
28. [Phụ lục A: Flow update procedural mỗi frame](#phụ-lục-a-flow-update-procedural-mỗi-frame)
29. [Phụ lục B: Flow look-at cursor](#phụ-lục-b-flow-look-at-cursor)
30. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)
31. [Tổng kết tài liệu đã tổng hợp và còn lại](#31-tổng-kết-tài-liệu-đã-tổng-hợp-và-còn-lại)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Procedural Animation System của **Chiro-Pet** phải:

- Làm character có cảm giác **sống**, kể cả khi đang idle.
- Tạo chuyển động phụ theo thời gian thực:
  - **auto blink**
  - **breathing**
  - **look-at cursor**
  - **idle sway**
  - **head/shoulder micro motion**
  - **expression modulation**
  - **spring bone parameter tuning**
- Tích hợp với:
  - **Animation Runtime**
  - **State System**
  - **Behavior Orchestrator**
  - **Desktop Awareness**
  - **Privacy/Settings**
  - **Telemetry Debug**
- Không phá keyframe animation chính.
- Có thể bật/tắt từng module qua settings.
- Tự giảm cường độ trong mode cần yên tĩnh:
  - Focus
  - Gaming
  - Meeting
  - Watching
  - Private
  - Streamer
- Chạy nhẹ, target overhead rất thấp.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Procedural animation architecture.
- Blink, breathing, look-at, idle sway, micro motion.
- Expression modulation.
- Spring bone runtime tuning.
- State/mode-based intensity.
- Runtime update loop.
- Debug tools.
- IPC/settings contract.

Tài liệu này không mô tả chi tiết:

- AnimationMixer clip blending.
- VRMA/glTF/BVH import.
- Shader/NPR rendering.
- Full character/state schema.
- AI response schema.

Các phần đó thuộc system docs riêng.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Additive by default** | Procedural chỉ cộng chuyển động nhỏ lên pose chính. |
| **2** | **Do not fight clips** | Nếu clip đang control bone/expression mạnh, procedural phải giảm hoặc tắt. |
| **3** | **State-aware** | Mood, energy, mode ảnh hưởng cường độ và nhịp. |
| **4** | **Configurable** | Mỗi module có setting riêng. |
| **5** | **Low overhead** | Không tạo object mỗi frame, không chạy logic nặng. |
| **6** | **Deterministic enough** | Dùng seeded random nhẹ để behavior ổn định, không giật. |
| **7** | **VRM-safe** | Chỉ modify bone/expression có tồn tại. |
| **8** | **Resettable** | Khi tắt module phải restore hoặc fade về neutral. |
| **9** | **Debuggable** | Có snapshot: enabled, weight, target, current values. |
| **10** | **Fail soft** | Nếu thiếu bone/expression, skip module, không crash. |

### **2.2. Anti-pattern cần tránh**

- ❌ Ghi đè trực tiếp pose từ AnimationMixer.
- ❌ Blink đè expression `happy/sad` gây mắt lỗi.
- ❌ Look-at xoay cổ quá mức.
- ❌ Breathing làm model phồng méo rõ ràng.
- ❌ Idle sway quá mạnh khiến character như say rượu.
- ❌ Update spring bone config mỗi frame không cần thiết.
- ❌ Dùng random không smoothing gây jitter.
- ❌ Chạy procedural khi tab/window hidden.
- ❌ Tạo Vector3/Quaternion mới liên tục mỗi frame.
- ❌ Không clamp rotation.

---

## **3. Vai trò trong Animation Stack**

### **3.1. Animation stack đề xuất**

```text
Layer 0: Base Pose / VRM Rest Pose
Layer 1: Clip Animation
  - idle
  - talking
  - reaction
  - thinking
  - drag
Layer 2: Expression System
  - AI/behavior expression
  - emotion preset
Layer 3: Procedural Animation
  - blink
  - breathing
  - look-at
  - idle sway
  - micro motion
Layer 4: Physics / Spring Bone
  - hair
  - cloth
  - accessories
Layer 5: Renderer / Shader
```

### **3.2. Procedural layer responsibility**

Procedural layer được phép:

- Add nhỏ vào bone rotation:
  - head
  - neck
  - chest
  - spine
  - shoulders
- Set expression weights có kiểm soát:
  - blink
  - blinkLeft
  - blinkRight
  - lookUp/lookDown/lookLeft/lookRight nếu có
- Modulate spring bone intensity nếu runtime hỗ trợ.
- Đọc current state/mode.
- Tự tắt khi animation command yêu cầu.

Procedural layer không được:

- Đổi animation clip.
- Đổi active character.
- Ghi state.
- Tự show bubble.
- Tự gọi AI.
- Sửa asset/VRM file.

### **3.3. Conflict example**

| **Tình huống** | **Procedural behavior** |
|---|---|
| Talking clip đang animate head | Look-at giảm weight còn 30% |
| Reaction clip đang bow/head movement | Head micro motion tắt |
| Dragging character | Breathing giữ, look-at tắt |
| Sleeping mode | Blink tắt hoặc rất chậm, breathing chậm |
| Meeting/Streamer | Motion intensity giảm mạnh |

---

## **4. Kiến trúc tổng thể**

```text
┌──────────────────────────────────────────────────────────────┐
│                    Animation Runtime                          │
│  - AnimationMixer                                             │
│  - current animation state                                    │
│  - active clip/layers                                         │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│              PROCEDURAL ANIMATION CONTROLLER                  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Runtime Context                                        │  │
│  │ - delta time                                           │  │
│  │ - current state/mode                                   │  │
│  │ - active animation                                     │  │
│  │ - VRM refs                                             │  │
│  │ - cursor position                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Module Registry                                        │  │
│  │ - BlinkModule                                          │  │
│  │ - BreathingModule                                      │  │
│  │ - LookAtModule                                         │  │
│  │ - IdleSwayModule                                       │  │
│  │ - MicroMotionModule                                    │  │
│  │ - ExpressionModulator                                  │  │
│  │ - SpringBoneTuner                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Weight Resolver                                        │  │
│  │ - mode intensity                                       │  │
│  │ - state intensity                                      │  │
│  │ - animation conflict                                   │  │
│  │ - reduce motion                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Apply Stage                                            │  │
│  │ - additive bone rotation                               │
│  │ - expression weights                                   │
│  │ - spring tuning                                        │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                        VRM MODEL                              │
│  - humanoid bones                                             │
│  - expression manager                                         │
│  - lookAt / spring bones                                      │
└──────────────────────────────────────────────────────────────┘
```

---

## **5. Procedural Modules**

### **5.1. Module list**

| **Module** | **Mục đích** | **Default** |
|---|---|---|
| **BlinkModule** | Tự chớp mắt tự nhiên | On |
| **BreathingModule** | Nhịp thở nhẹ ở chest/spine | On |
| **LookAtModule** | Mắt/đầu nhìn theo cursor | On |
| **IdleSwayModule** | Lắc nhẹ toàn thân khi idle | On |
| **MicroMotionModule** | Chuyển động nhỏ head/shoulder | On |
| **ExpressionModulator** | Điều chỉnh expression theo mood/energy | On |
| **SpringBoneTuner** | Tuning tóc/vải theo mode/intensity | On nếu VRM hỗ trợ |

### **5.2. Module interface**

```typescript
export interface ProceduralModule {
  id: string;
  enabled: boolean;

  bind(ctx: ProceduralBindContext): void;
  unbind(): void;

  update(ctx: ProceduralFrameContext): void;
  reset(fadeMs?: number): void;

  getDebugSnapshot(): ProceduralModuleDebugSnapshot;
}
```

### **5.3. Bind context**

```typescript
export interface ProceduralBindContext {
  vrm: VRM;
  scene: THREE.Scene;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  boneRefs: ProceduralBoneRefs;
  expressionRefs: ProceduralExpressionRefs;
}
```

### **5.4. Frame context**

```typescript
export interface ProceduralFrameContext {
  deltaSeconds: number;
  elapsedSeconds: number;

  animationState: AnimationRuntimeState;
  characterState: CharacterState | null;
  behaviorMode: EffectiveBehaviorMode;
  settings: ProceduralAnimationSettings;

  cursor: CursorState;
  visibility: RuntimeVisibilityState;

  globalWeight: number;
}
```

---

## **6. Data Model**

### **6.1. ProceduralAnimationSettings**

```typescript
export interface ProceduralAnimationSettings {
  enabled: boolean;

  blink_enabled: boolean;
  breathing_enabled: boolean;
  look_at_cursor_enabled: boolean;
  idle_sway_enabled: boolean;
  micro_motion_enabled: boolean;
  expression_modulation_enabled: boolean;
  spring_bone_tuning_enabled: boolean;

  global_intensity: number;      // 0.0..1.5
  reduce_motion: boolean;

  blink: BlinkSettings;
  breathing: BreathingSettings;
  look_at: LookAtSettings;
  idle_sway: IdleSwaySettings;
  micro_motion: MicroMotionSettings;
  expression: ExpressionModulationSettings;
  spring_bone: SpringBoneTuningSettings;
}
```

### **6.2. Bone refs**

```typescript
export interface ProceduralBoneRefs {
  hips?: THREE.Object3D;
  spine?: THREE.Object3D;
  chest?: THREE.Object3D;
  upperChest?: THREE.Object3D;
  neck?: THREE.Object3D;
  head?: THREE.Object3D;

  leftShoulder?: THREE.Object3D;
  rightShoulder?: THREE.Object3D;
  leftUpperArm?: THREE.Object3D;
  rightUpperArm?: THREE.Object3D;
}
```

### **6.3. Expression refs**

```typescript
export interface ProceduralExpressionRefs {
  available: Set<string>;

  blink?: string;
  blinkLeft?: string;
  blinkRight?: string;

  happy?: string;
  sad?: string;
  relaxed?: string;
  surprised?: string;
  angry?: string;
}
```

### **6.4. CursorState**

```typescript
export interface CursorState {
  available: boolean;
  screenX: number;
  screenY: number;
  canvasX: number;
  canvasY: number;
  normalizedX: number; // -1..1
  normalizedY: number; // -1..1
  lastMovedAt: number;
}
```

### **6.5. RuntimeVisibilityState**

```typescript
export interface RuntimeVisibilityState {
  overlayVisible: boolean;
  windowFocused: boolean;
  documentVisible: boolean;
  isDragging: boolean;
  isHiddenByFullscreen: boolean;
}
```

### **6.6. Debug snapshot**

```typescript
export interface ProceduralModuleDebugSnapshot {
  id: string;
  enabled: boolean;
  active: boolean;
  weight: number;
  values: Record<string, number="" |="" string="" boolean="">;
  warnings: string[];
}
```

---

## **7. Runtime Update Loop**

### **7.1. Update order**

Procedural modules update sau AnimationMixer:

```typescript
function renderLoop(now: number) {
  const delta = clock.getDelta();

  animationMixer.update(delta);

  expressionController.update(delta);

  proceduralController.update({
    deltaSeconds: delta,
    elapsedSeconds: clock.elapsedTime,
    animationState,
    characterState,
    behaviorMode,
    settings,
    cursor,
    visibility,
    globalWeight,
  });

  vrm.update(delta);

  renderer.render(scene, camera);
}
```

### **7.2. Why after mixer**

AnimationMixer ghi pose từ clip mỗi frame. Nếu procedural chạy trước mixer, mixer sẽ overwrite procedural. Vì vậy:

```text
AnimationMixer.update()
  ↓
ProceduralController.update()
  ↓
VRM.update()
  ↓
Render
```

### **7.3. Global weight**

```typescript
function computeGlobalProceduralWeight(
  settings: ProceduralAnimationSettings,
  mode: EffectiveBehaviorMode,
  visibility: RuntimeVisibilityState,
): number {
  if (!settings.enabled) return 0;
  if (!visibility.overlayVisible) return 0;
  if (!visibility.documentVisible) return 0;

  let w = settings.global_intensity;

  if (settings.reduce_motion) w *= 0.35;

  switch (mode) {
    case "meeting":
    case "gaming":
      w *= 0.2;
      break;
    case "watching":
      w *= 0.35;
      break;
    case "focus":
      w *= 0.6;
      break;
    case "private":
    case "streamer":
      w *= 0.5;
      break;
    case "idle":
      w *= 0.45;
      break;
    default:
      break;
  }

  return THREE.MathUtils.clamp(w, 0, 1.5);
}
```

### **7.4. Controller**

```typescript
export class ProceduralAnimationController {
  private modules: ProceduralModule[] = [];
  private bound = false;

  bind(ctx: ProceduralBindContext) {
    this.modules = [
      new BlinkModule(),
      new BreathingModule(),
      new LookAtModule(),
      new IdleSwayModule(),
      new MicroMotionModule(),
      new ExpressionModulator(),
      new SpringBoneTuner(),
    ];

    for (const module of this.modules) {
      module.bind(ctx);
    }

    this.bound = true;
  }

  update(ctx: ProceduralFrameContext) {
    if (!this.bound) return;
    if (ctx.globalWeight <= 0) return;

    for (const module of this.modules) {
      if (!module.enabled) continue;
      module.update(ctx);
    }
  }

  resetAll(fadeMs = 200) {
    for (const module of this.modules) {
      module.reset(fadeMs);
    }
  }

  getDebugSnapshot() {
    return this.modules.map((m) => m.getDebugSnapshot());
  }
}
```

---

## **8. Blink System**

### **8.1. Mục tiêu**

Blink system tạo chớp mắt tự nhiên:

- Random interval.
- Duration ngắn.
- Có blink đơn và đôi.
- Mood/energy ảnh hưởng tần suất.
- Không đè expression mạnh khi cần.

### **8.2. BlinkSettings**

```typescript
export interface BlinkSettings {
  min_interval_seconds: number; // default 2.5
  max_interval_seconds: number; // default 6.5
  close_duration_seconds: number; // default 0.055
  hold_duration_seconds: number; // default 0.035
  open_duration_seconds: number; // default 0.09
  double_blink_chance: number; // default 0.12
  sleepy_multiplier: number; // default 1.6
}
```

### **8.3. Blink phases**

```typescript
type BlinkPhase =
  | "waiting"
  | "closing"
  | "holding"
  | "opening";
```

### **8.4. Blink implementation sketch**

```typescript
export class BlinkModule implements ProceduralModule {
  id = "blink";
  enabled = true;

  private expressionManager?: VRMExpressionManager;
  private blinkName?: string;

  private phase: BlinkPhase = "waiting";
  private timer = 0;
  private nextBlinkIn = 3;
  private currentWeight = 0;
  private pendingDoubleBlink = false;

  bind(ctx: ProceduralBindContext) {
    this.expressionManager = ctx.vrm.expressionManager;
    this.blinkName =
      ctx.expressionRefs.blink ??
      ctx.expressionRefs.blinkLeft ??
      ctx.expressionRefs.blinkRight;
  }

  update(ctx: ProceduralFrameContext) {
    if (!ctx.settings.blink_enabled || !this.blinkName || !this.expressionManager) {
      return;
    }

    const settings = ctx.settings.blink;
    const dt = ctx.deltaSeconds;

    const state = ctx.characterState;
    const energy = state?.emotional.energy ?? 0;

    const sleepyFactor = energy < 0 ? settings.sleepy_multiplier : 1.0;

    this.timer += dt;

    switch (this.phase) {
      case "waiting": {
        if (this.timer >= this.nextBlinkIn * sleepyFactor) {
          this.phase = "closing";
          this.timer = 0;
        }
        break;
      }

      case "closing": {
        const t = THREE.MathUtils.clamp(
          this.timer / settings.close_duration_seconds,
          0,
          1,
        );
        this.currentWeight = smoothstep(t);
        if (t >= 1) {
          this.phase = "holding";
          this.timer = 0;
        }
        break;
      }

      case "holding": {
        this.currentWeight = 1;
        if (this.timer >= settings.hold_duration_seconds) {
          this.phase = "opening";
          this.timer = 0;
        }
        break;
      }

      case "opening": {
        const t = THREE.MathUtils.clamp(
          this.timer / settings.open_duration_seconds,
          0,
          1,
        );
        this.currentWeight = 1 - smoothstep(t);
        if (t >= 1) {
          this.currentWeight = 0;
          this.phase = "waiting";
          this.timer = 0;

          if (this.pendingDoubleBlink) {
            this.nextBlinkIn = 0.15;
            this.pendingDoubleBlink = false;
          } else {
            this.pendingDoubleBlink = Math.random() < settings.double_blink_chance;
            this.nextBlinkIn = randomRange(
              settings.min_interval_seconds,
              settings.max_interval_seconds,
            );
          }
        }
        break;
      }
    }

    const finalWeight = this.currentWeight * ctx.globalWeight;
    this.expressionManager.setValue(this.blinkName, finalWeight);
  }

  reset() {
    if (this.expressionManager && this.blinkName) {
      this.expressionManager.setValue(this.blinkName, 0);
    }
    this.phase = "waiting";
    this.currentWeight = 0;
  }

  unbind() {
    this.reset();
    this.expressionManager = undefined;
  }

  getDebugSnapshot(): ProceduralModuleDebugSnapshot {
    return {
      id: this.id,
      enabled: this.enabled,
      active: this.phase !== "waiting",
      weight: this.currentWeight,
      values: {
        phase: this.phase,
        next_blink_in: this.nextBlinkIn,
      },
      warnings: this.blinkName ? [] : ["missing_blink_expression"],
    };
  }
}
```

### **8.5. Blink conflict rules**

| **Condition** | **Behavior** |
|---|---|
| Expression `blink` missing | Disable blink |
| Eye closed animation active | Disable blink |
| Sleeping animation active | Slow blink or closed eyes |
| Surprised expression active | Reduce blink chance |
| Look-at expression active | Blink still allowed |

---

## **9. Breathing System**

### **9.1. Mục tiêu**

Breathing tạo nhịp thở nhẹ bằng spine/chest scale/rotation rất nhỏ.

Ưu tiên:

```text
- rotate chest/spine nhẹ
- không scale mesh trực tiếp nếu dễ méo
- không ảnh hưởng khi reaction mạnh
```

### **9.2. BreathingSettings**

```typescript
export interface BreathingSettings {
  frequency_per_minute: number; // default 14
  amplitude_chest: number; // default 0.015 rad
  amplitude_spine: number; // default 0.008 rad
  energy_multiplier: number; // default 0.2
  smoothing: number; // default 0.12
}
```

### **9.3. Breathing implementation**

```typescript
export class BreathingModule implements ProceduralModule {
  id = "breathing";
  enabled = true;

  private chest?: THREE.Object3D;
  private spine?: THREE.Object3D;

  private baseChestQ = new THREE.Quaternion();
  private baseSpineQ = new THREE.Quaternion();

  private current = 0;

  bind(ctx: ProceduralBindContext) {
    this.chest = ctx.boneRefs.chest ?? ctx.boneRefs.upperChest;
    this.spine = ctx.boneRefs.spine;

    if (this.chest) this.baseChestQ.copy(this.chest.quaternion);
    if (this.spine) this.baseSpineQ.copy(this.spine.quaternion);
  }

  update(ctx: ProceduralFrameContext) {
    if (!ctx.settings.breathing_enabled) return;

    const s = ctx.settings.breathing;
    const energy = ctx.characterState?.emotional.energy ?? 0;

    const freq = s.frequency_per_minute / 60;
    const energyFactor = 1 + energy * s.energy_multiplier;

    const breath = Math.sin(ctx.elapsedSeconds * Math.PI * 2 * freq * energyFactor);
    const target = breath * ctx.globalWeight;

    this.current = THREE.MathUtils.lerp(this.current, target, s.smoothing);

    if (this.chest) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.current * s.amplitude_chest, 0, 0),
      );
      this.chest.quaternion.multiply(q);
    }

    if (this.spine) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(this.current * s.amplitude_spine, 0, 0),
      );
      this.spine.quaternion.multiply(q);
    }
  }

  reset() {
    this.current = 0;
  }

  unbind() {
    this.chest = undefined;
    this.spine = undefined;
  }

  getDebugSnapshot(): ProceduralModuleDebugSnapshot {
    return {
      id: this.id,
      enabled: this.enabled,
      active: true,
      weight: Math.abs(this.current),
      values: {
        current: this.current,
      },
      warnings: !this.chest && !this.spine ? ["missing_chest_spine"] : [],
    };
  }
}
```

### **9.4. Breathing modulation**

| **State/Mode** | **Effect** |
|---|---|
| Energy high | Breathing slightly faster |
| Energy low | Slower, softer |
| Sleeping | Slower, deeper |
| Focus | Softer |
| Reaction animation | Reduce amplitude |
| Dragging | Keep minimal |

---

## **10. Look-at Cursor System**

### **10.1. Mục tiêu**

Look-at làm character nhìn theo cursor một cách tự nhiên:

- Eyes rotate first.
- Head follows softly.
- Neck follows very slightly.
- Clamp rotation.
- Smooth target.
- Disable/reduce in modes cần yên tĩnh.

### **10.2. LookAtSettings**

```typescript
export interface LookAtSettings {
  head_weight: number; // default 0.35
  neck_weight: number; // default 0.15
  eye_weight: number; // default 0.8

  max_head_yaw_deg: number; // default 18
  max_head_pitch_deg: number; // default 10
  max_neck_yaw_deg: number; // default 8
  max_neck_pitch_deg: number; // default 5

  smoothing: number; // default 0.12
  return_to_center_seconds: number; // default 1.2

  cursor_idle_timeout_seconds: number; // default 4
}
```

### **10.3. Look target calculation**

```typescript
function cursorToLookAngles(
  cursor: CursorState,
  settings: LookAtSettings,
) {
  const yaw = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(
      cursor.normalizedX * settings.max_head_yaw_deg,
      -settings.max_head_yaw_deg,
      settings.max_head_yaw_deg,
    ),
  );

  const pitch = THREE.MathUtils.degToRad(
    THREE.MathUtils.clamp(
      -cursor.normalizedY * settings.max_head_pitch_deg,
      -settings.max_head_pitch_deg,
      settings.max_head_pitch_deg,
    ),
  );

  return { yaw, pitch };
}
```

### **10.4. LookAtModule sketch**

```typescript
export class LookAtModule implements ProceduralModule {
  id = "look_at";
  enabled = true;

  private head?: THREE.Object3D;
  private neck?: THREE.Object3D;

  private currentYaw = 0;
  private currentPitch = 0;

  bind(ctx: ProceduralBindContext) {
    this.head = ctx.boneRefs.head;
    this.neck = ctx.boneRefs.neck;
  }

  update(ctx: ProceduralFrameContext) {
    if (!ctx.settings.look_at_cursor_enabled) return;
    if (ctx.visibility.isDragging) return;

    const s = ctx.settings.look_at;
    const nowMs = performance.now();

    const cursorFresh =
      ctx.cursor.available &&
      nowMs - ctx.cursor.lastMovedAt <= s.cursor_idle_timeout_seconds * 1000;

    let targetYaw = 0;
    let targetPitch = 0;

    if (cursorFresh) {
      const angles = cursorToLookAngles(ctx.cursor, s);
      targetYaw = angles.yaw;
      targetPitch = angles.pitch;
    }

    const conflictWeight = computeLookAtConflictWeight(ctx.animationState);
    const weight = ctx.globalWeight * conflictWeight;

    this.currentYaw = damp(this.currentYaw, targetYaw, s.smoothing, ctx.deltaSeconds);
    this.currentPitch = damp(this.currentPitch, targetPitch, s.smoothing, ctx.deltaSeconds);

    if (this.head) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          this.currentPitch * s.head_weight * weight,
          this.currentYaw * s.head_weight * weight,
          0,
        ),
      );
      this.head.quaternion.multiply(q);
    }

    if (this.neck) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          this.currentPitch * s.neck_weight * weight,
          this.currentYaw * s.neck_weight * weight,
          0,
        ),
      );
      this.neck.quaternion.multiply(q);
    }
  }

  reset() {
    this.currentYaw = 0;
    this.currentPitch = 0;
  }

  unbind() {
    this.head = undefined;
    this.neck = undefined;
  }

  getDebugSnapshot(): ProceduralModuleDebugSnapshot {
    return {
      id: this.id,
      enabled: this.enabled,
      active: Math.abs(this.currentYaw) > 0.001 || Math.abs(this.currentPitch) > 0.001,
      weight: 1,
      values: {
        yaw: this.currentYaw,
        pitch: this.currentPitch,
      },
      warnings: !this.head ? ["missing_head_bone"] : [],
    };
  }
}
```

### **10.5. Conflict weight**

```typescript
function computeLookAtConflictWeight(state: AnimationRuntimeState): number {
  switch (state.state) {
    case "talking":
      return 0.5;
    case "reaction":
      return 0.15;
    case "dragging":
      return 0.0;
    case "sleeping":
      return 0.0;
    default:
      return 1.0;
  }
}
```

---

## **11. Idle Sway System**

### **11.1. Mục tiêu**

Idle sway tạo chuyển động nhẹ của body khi không có animation mạnh:

- Sway trái/phải rất nhỏ.
- Phase khác nhau giữa hips/chest/head.
- Intensity giảm trong Focus/Meeting.
- Không dùng nếu idle clip đã có motion rõ.

### **11.2. IdleSwaySettings**

```typescript
export interface IdleSwaySettings {
  frequency: number; // default 0.18 Hz
  hips_yaw_amplitude_deg: number; // default 1.0
  chest_roll_amplitude_deg: number; // default 0.8
  head_yaw_amplitude_deg: number; // default 0.6
  phase_offset: number; // default 0.7
}
```

### **11.3. Idle sway logic**

```typescript
export class IdleSwayModule implements ProceduralModule {
  id = "idle_sway";
  enabled = true;

  private hips?: THREE.Object3D;
  private chest?: THREE.Object3D;
  private head?: THREE.Object3D;

  bind(ctx: ProceduralBindContext) {
    this.hips = ctx.boneRefs.hips;
    this.chest = ctx.boneRefs.chest ?? ctx.boneRefs.upperChest;
    this.head = ctx.boneRefs.head;
  }

  update(ctx: ProceduralFrameContext) {
    if (!ctx.settings.idle_sway_enabled) return;
    if (!isIdleLikeState(ctx.animationState.state)) return;

    const s = ctx.settings.idle_sway;
    const t = ctx.elapsedSeconds;

    const modeWeight = ctx.globalWeight;
    const wave = Math.sin(t * Math.PI * 2 * s.frequency);
    const wave2 = Math.sin(t * Math.PI * 2 * s.frequency + s.phase_offset);

    if (this.hips) {
      const yaw = THREE.MathUtils.degToRad(s.hips_yaw_amplitude_deg) * wave * modeWeight;
      this.hips.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      );
    }

    if (this.chest) {
      const roll = THREE.MathUtils.degToRad(s.chest_roll_amplitude_deg) * wave2 * modeWeight;
      this.chest.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, roll)),
      );
    }

    if (this.head) {
      const yaw = THREE.MathUtils.degToRad(s.head_yaw_amplitude_deg) * -wave * modeWeight;
      this.head.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      );
    }
  }

  reset() {}

  unbind() {
    this.hips = undefined;
    this.chest = undefined;
    this.head = undefined;
  }

  getDebugSnapshot(): ProceduralModuleDebugSnapshot {
    return {
      id: this.id,
      enabled: this.enabled,
      active: true,
      weight: 1,
      values: {},
      warnings: [],
    };
  }
}
```

### **11.4. Idle-like states**

```typescript
function isIdleLikeState(state: string): boolean {
  return [
    "idle",
    "focused_idle",
    "sleepy_idle",
    "waiting",
  ].includes(state);
}
```

---

## **12. Micro Motion System**

### **12.1. Mục tiêu**

Micro motion tạo nhiễu chuyển động rất nhẹ, chậm, giúp model không đứng cứng.

Áp dụng cho:

- head tiny pitch/yaw
- shoulders small asymmetry
- upper body tiny delay

### **12.2. MicroMotionSettings**

```typescript
export interface MicroMotionSettings {
  head_noise_amplitude_deg: number; // default 0.35
  shoulder_amplitude_deg: number; // default 0.25
  frequency: number; // default 0.07
  noise_speed: number; // default 0.35
}
```

### **12.3. Smooth noise**

Không dùng `Math.random()` mỗi frame. Dùng noise/sine chậm:

```typescript
function layeredSine(t: number, speed: number): number {
  return (
    Math.sin(t * speed) * 0.6 +
    Math.sin(t * speed * 1.73 + 1.2) * 0.3 +
    Math.sin(t * speed * 2.31 + 2.4) * 0.1
  );
}
```

### **12.4. MicroMotionModule**

```typescript
export class MicroMotionModule implements ProceduralModule {
  id = "micro_motion";
  enabled = true;

  private head?: THREE.Object3D;
  private leftShoulder?: THREE.Object3D;
  private rightShoulder?: THREE.Object3D;

  bind(ctx: ProceduralBindContext) {
    this.head = ctx.boneRefs.head;
    this.leftShoulder = ctx.boneRefs.leftShoulder;
    this.rightShoulder = ctx.boneRefs.rightShoulder;
  }

  update(ctx: ProceduralFrameContext) {
    if (!ctx.settings.micro_motion_enabled) return;
    if (!isIdleLikeState(ctx.animationState.state)) return;

    const s = ctx.settings.micro_motion;
    const t = ctx.elapsedSeconds;

    const w = ctx.globalWeight * 0.7;

    if (this.head) {
      const yaw = THREE.MathUtils.degToRad(s.head_noise_amplitude_deg)
        * layeredSine(t, s.noise_speed)
        * w;

      const pitch = THREE.MathUtils.degToRad(s.head_noise_amplitude_deg * 0.5)
        * layeredSine(t + 10, s.noise_speed * 0.8)
        * w;

      this.head.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0)),
      );
    }

    const shoulder = THREE.MathUtils.degToRad(s.shoulder_amplitude_deg)
      * Math.sin(t * s.frequency * Math.PI * 2)
      * w;

    if (this.leftShoulder) {
      this.leftShoulder.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, shoulder)),
      );
    }

    if (this.rightShoulder) {
      this.rightShoulder.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -shoulder)),
      );
    }
  }

  reset() {}

  unbind() {}

  getDebugSnapshot(): ProceduralModuleDebugSnapshot {
    return {
      id: this.id,
      enabled: this.enabled,
      active: true,
      weight: 1,
      values: {},
      warnings: [],
    };
  }
}
```

---

## **13. Expression Modulation**

### **13.1. Mục tiêu**

Expression Modulation điều chỉnh nhẹ expression theo:

- mood
- energy
- AI emotion
- behavior mode
- talking state

Không thay thế ExpressionController chính. Chỉ modulate nhẹ.

### **13.2. ExpressionModulationSettings**

```typescript
export interface ExpressionModulationSettings {
  mood_to_expression_enabled: boolean;
  max_additive_weight: number; // default 0.25
  smoothing: number; // default 0.15
  sleepy_relaxed_weight: number; // default 0.15
}
```

### **13.3. Mood mapping**

| **State** | **Expression** | **Weight** |
|---|---|---|
| mood > 1 | happy/relaxed | 0.1-0.25 |
| mood < -1 | sad | 0.1-0.2 |
| energy < -1 | relaxed/sleepy | 0.1-0.2 |
| surprised emotion active | surprised | controlled by ExpressionController |
| talking | slight mouth/expression handled elsewhere |

### **13.4. Implementation sketch**

```typescript
export class ExpressionModulator implements ProceduralModule {
  id = "expression_modulation";
  enabled = true;

  private expressionManager?: VRMExpressionManager;
  private values = new Map<string, number="">();

  bind(ctx: ProceduralBindContext) {
    this.expressionManager = ctx.vrm.expressionManager;
  }

  update(ctx: ProceduralFrameContext) {
    if (!ctx.settings.expression_modulation_enabled || !this.expressionManager) return;

    const s = ctx.settings.expression;
    const state = ctx.characterState;
    if (!state) return;

    const targets = new Map<string, number="">();

    if (s.mood_to_expression_enabled) {
      if (state.emotional.mood > 1) {
        targets.set("happy", s.max_additive_weight * 0.7);
      }

      if (state.emotional.mood < -1) {
        targets.set("sad", s.max_additive_weight * 0.6);
      }

      if (state.emotional.energy < -1) {
        targets.set("relaxed", s.sleepy_relaxed_weight);
      }
    }

    for (const [name, target] of targets) {
      const current = this.values.get(name) ?? 0;
      const next = THREE.MathUtils.lerp(
        current,
        target * ctx.globalWeight,
        s.smoothing,
      );

      this.values.set(name, next);

      if (this.expressionManager.getExpression(name)) {
        const existing = this.expressionManager.getValue(name) ?? 0;
        this.expressionManager.setValue(name, Math.max(existing, next));
      }
    }
  }

  reset() {
    if (!this.expressionManager) return;

    for (const [name] of this.values) {
      this.expressionManager.setValue(name, 0);
    }

    this.values.clear();
  }

  unbind() {
    this.reset();
    this.expressionManager = undefined;
  }

  getDebugSnapshot(): ProceduralModuleDebugSnapshot {
    return {
      id: this.id,
      enabled: this.enabled,
      active: this.values.size > 0,
      weight: 1,
      values: Object.fromEntries(this.values),
      warnings: [],
    };
  }
}
```

### **13.5. Expression conflict rules**

| **Condition** | **Behavior** |
|---|---|
| AI expression active | AI expression wins |
| Blink active | Blink can override eye close |
| Streamer mode | Keep safe neutral/relaxed only |
| Emotion reaction | Modulation weight giảm |
| Expression missing | Skip |

---

## **14. Spring Bone Tuning**

### **14.1. Mục tiêu**

SpringBoneTuner điều chỉnh cảm giác tóc/vải theo mode:

- Normal: full spring.
- Focus/Meeting: giảm bounce.
- Low performance: giảm update hoặc disable.
- Dragging: có thể tăng nhẹ nếu đẹp, nhưng không quá mạnh.

### **14.2. SpringBoneTuningSettings**

```typescript
export interface SpringBoneTuningSettings {
  enabled: boolean;
  normal_intensity: number; // default 1.0
  focus_intensity: number; // default 0.65
  meeting_intensity: number; // default 0.4
  low_fps_intensity: number; // default 0.3
  disable_below_fps: number; // default 25
}
```

### **14.3. Practical note**

`three-vrm` spring bone internals có thể không expose đầy đủ runtime tuning cho mọi version. Vì vậy policy:

```text
MVP:
- Toggle spring bones enabled/disabled nếu API cho phép.
- Apply global intensity nếu runtime wrapper hỗ trợ.
- Nếu không hỗ trợ, chỉ expose debug warning.
```

### **14.4. SpringBoneTuner sketch**

```typescript
export class SpringBoneTuner implements ProceduralModule {
  id = "spring_bone_tuner";
  enabled = true;

  private vrm?: VRM;
  private currentIntensity = 1;

  bind(ctx: ProceduralBindContext) {
    this.vrm = ctx.vrm;
  }

  update(ctx: ProceduralFrameContext) {
    if (!ctx.settings.spring_bone_tuning_enabled) return;
    if (!this.vrm) return;

    const s = ctx.settings.spring_bone;

    let target = s.normal_intensity;

    switch (ctx.behaviorMode) {
      case "focus":
        target = s.focus_intensity;
        break;
      case "meeting":
      case "streamer":
        target = s.meeting_intensity;
        break;
      default:
        break;
    }

    this.currentIntensity = THREE.MathUtils.lerp(
      this.currentIntensity,
      target,
      0.05,
    );

    applySpringIntensityIfSupported(this.vrm, this.currentIntensity);
  }

  reset() {
    if (this.vrm) {
      applySpringIntensityIfSupported(this.vrm, 1.0);
    }
  }

  unbind() {
    this.reset();
    this.vrm = undefined;
  }

  getDebugSnapshot(): ProceduralModuleDebugSnapshot {
    return {
      id: this.id,
      enabled: this.enabled,
      active: true,
      weight: this.currentIntensity,
      values: {
        intensity: this.currentIntensity,
      },
      warnings: [],
    };
  }
}
```

---

## **15. Mode & State Modulation**

### **15.1. Mode intensity table**

| **Mode** | **Global procedural intensity** |
|---|---|
| Normal | 1.0 |
| Focus | 0.6 |
| Gaming | 0.2 |
| Meeting | 0.2 |
| Watching | 0.35 |
| Idle | 0.45 |
| Quiet | 0.5 |
| Private | 0.5 |
| Streamer | 0.45 |
| Restricted | 0.25 |

### **15.2. State modulation**

| **State** | **Effect** |
|---|---|
| energy high | Slightly faster micro motion and breathing |
| energy low | Slower blink, relaxed expression |
| mood high | Slight happy expression modulation |
| mood low | Softer motion, sad/concern expression |
| affinity high | Look-at can be slightly more responsive |
| patience low | Reduce playful sway |

### **15.3. Animation state modulation**

| **Animation State** | **Procedural behavior** |
|---|---|
| idle | Full procedural |
| talking | Blink + breathing + reduced look-at |
| thinking | Blink + subtle head micro |
| reaction | Breathing only, maybe blink |
| dragging | Breathing only |
| sleeping | Slow breathing, no look-at |
| error | Minimal procedural |

---

## **16. Priority & Conflict Rules**

### **16.1. Priority order**

```text
1. Hard safety constraints
2. Current animation clip
3. Explicit expression command
4. Procedural modules
5. Debug override
```

### **16.2. Bone ownership**

| **Bone** | **Primary owner** | **Procedural allowed?** |
|---|---|---|
| hips | Animation clip | idle only |
| spine | Animation clip | small additive |
| chest | Animation clip | breathing/sway |
| neck | Animation clip | look-at reduced |
| head | Animation clip | look-at/micro reduced |
| arms | Animation clip | micro only when idle |
| fingers | Animation clip | no MVP procedural |

### **16.3. Expression ownership**

| **Expression** | **Primary owner** | **Procedural allowed?** |
|---|---|---|
| blink | BlinkModule | yes |
| happy/sad | ExpressionController | additive only |
| surprised | ExpressionController | procedural avoid |
| angry | ExpressionController | procedural avoid |
| relaxed | ExpressionModulator | yes, low weight |

### **16.4. Conflict resolver**

```typescript
export function proceduralWeightForAnimationState(
  moduleId: string,
  animationState: string,
): number {
  const table: Record<string, record<string,="" number="">> = {
    look_at: {
      idle: 1,
      talking: 0.5,
      reaction: 0.15,
      dragging: 0,
      sleeping: 0,
    },
    idle_sway: {
      idle: 1,
      talking: 0,
      reaction: 0,
      dragging: 0,
      sleeping: 0.2,
    },
    micro_motion: {
      idle: 1,
      talking: 0.25,
      reaction: 0,
      dragging: 0,
      sleeping: 0,
    },
  };

  return table[moduleId]?.[animationState] ?? 1;
}
```

---

## **17. Settings Integration**

### **17.1. Animation settings extension**

Procedural settings nên nằm dưới `animation.procedural`.

```typescript
export interface AnimationSettings {
  target_fps: number;
  reduce_motion: boolean;

  idle_animation_id?: string | null;
  default_talking_animation_id?: string | null;

  expression_intensity: number;
  blink_enabled: boolean;
  look_at_cursor_enabled: boolean;
  breathing_enabled: boolean;
  spring_bones_enabled: boolean;

  crossfade_ms: number;

  procedural: ProceduralAnimationSettings;
}
```

### **17.2. Runtime settings update**

```text
settings_updated(animation)
  ↓
AnimationRuntime reloads settings
  ↓
ProceduralController updates module config
  ↓
Disabled modules fade reset
```

### **17.3. Reduce motion**

Nếu `reduce_motion = true`:

```text
- global procedural weight *= 0.35
- idle_sway disabled or very low
- micro_motion very low
- look-at slower
- blink stays normal
- breathing subtle
```

---

## **18. Asset & VRM Integration**

### **18.1. Binding on model load**

Khi VRM load hoặc swap:

```text
Renderer loads VRM
  ↓
Extract humanoid bone refs
  ↓
Extract expression refs
  ↓
ProceduralController.unbind old model
  ↓
ProceduralController.bind new model
  ↓
Reset module internal state
```

### **18.2. Missing bone policy**

| **Missing** | **Behavior** |
|---|---|
| head | Disable look-at/micro head |
| neck | Use head only |
| chest | Use spine for breathing |
| spine | Disable breathing body |
| blink expression | Disable blink |
| spring manager | Disable SpringBoneTuner |

### **18.3. VRM expression names**

VRM models may use:

```text
blink
blinkLeft
blinkRight
happy
angry
sad
relaxed
surprised
```

Resolver should map common aliases.

```typescript
function resolveExpressionName(
  available: Set<string>,
  candidates: string[],
): string | undefined {
  return candidates.find((name) => available.has(name));
}
```

---

## **19. Frontend Implementation**

### **19.1. Runtime location**

Procedural animation belongs in frontend renderer:

```text
src/renderer/procedural/
```

Reason:

```text
- Needs direct access to Three.js objects.
- Needs per-frame update.
- Needs VRM expression manager.
- Avoid IPC per frame.
```

### **19.2. Backend role**

Backend only provides:

```text
- settings
- mode/state snapshots
- debug commands
- telemetry recording
```

Backend must not calculate per-frame procedural transforms.

### **19.3. Store inputs**

Frontend procedural runtime subscribes to:

```text
- animationStore.runtimeState
- stateStore.characterState
- awarenessStore.currentMode
- privacyStore.mode
- settingsStore.animation
- overlayStore.visibility
```

### **19.4. Hook sketch**

```typescript
export function useProceduralAnimationRuntime(
  vrm: VRM | null,
  canvas: HTMLCanvasElement | null,
) {
  const controllerRef = useRef<proceduralanimationcontroller |="" null="">(null);

  useEffect(() => {
    if (!vrm || !canvas) return;

    const ctx = buildProceduralBindContext(vrm, canvas);
    const controller = new ProceduralAnimationController();
    controller.bind(ctx);
    controllerRef.current = controller;

    return () => {
      controller.resetAll(0);
      controllerRef.current = null;
    };
  }, [vrm, canvas]);

  return controllerRef;
}
```

---

## **20. Backend Coordination**

### **20.1. Backend responsibilities**

Backend coordinates:

- Settings persistence.
- IPC debug snapshots.
- Telemetry.
- Recovery signal if renderer reports procedural error.
- Optional command to set module enabled.

### **20.2. Procedural status**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProceduralRuntimeStatus {
    pub enabled: bool,
    pub active_modules: Vec<string>,
    pub disabled_modules: Vec<string>,
    pub warnings: Vec<string>,
    pub last_error: Option<string>,
    pub updated_at: DateTime<utc>,
}
```

### **20.3. Renderer reports**

Frontend can report:

```text
- module error
- missing bone/expression warning
- performance degradation
- debug snapshot
```

---

## **21. IPC Contract**

### **21.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `procedural_get_settings` | `{}` | `ProceduralAnimationSettings` |
| `procedural_update_settings` | `Partial<proceduralanimationsettings>` | `ProceduralAnimationSettings` |
| `procedural_get_status` | `{}` | `ProceduralRuntimeStatus` |
| `procedural_report_status` | `ProceduralRuntimeStatus` | `void` |
| `procedural_report_error` | `{ module_id: string, error: string }` | `void` |
| `procedural_get_debug_snapshot` | `{}` | `ProceduralDebugSnapshot` |
| `procedural_set_module_enabled` | `{ module_id: string, enabled: boolean }` | `void` |
| `procedural_reset_all` | `{ fade_ms?: number }` | `void` |

### **21.2. Rust → Frontend events**

| **Event** | **Payload** |
|---|---|
| `procedural_settings_updated` | `ProceduralAnimationSettings` |
| `procedural_status_updated` | `ProceduralRuntimeStatus` |
| `procedural_module_error` | `{ module_id: string, error: string }` |
| `procedural_reset_requested` | `{ fade_ms: number }` |
| `procedural_debug_snapshot_updated` | `ProceduralDebugSnapshot` |

### **21.3. TypeScript types**

```typescript
export interface ProceduralDebugSnapshot {
  enabled: boolean;
  global_weight: number;
  modules: ProceduralModuleDebugSnapshot[];
  sampled_at: string;
}
```

### **21.4. IPC rule**

Không gọi IPC mỗi frame. Snapshot/debug chỉ gửi khi:

```text
- user mở debug panel
- interval debug thấp, ví dụ 500ms hoặc 1000ms
- error/warning xảy ra
```

---

## **22. Debug Tools**

### **22.1. Debug overlay fields**

```text
Procedural:
  global weight: 0.60
  blink: waiting
  breathing: 0.12
  lookAt yaw/pitch: 0.10 / -0.04
  idle sway: active
  spring intensity: 0.65
```

### **22.2. Debug panel actions**

| **Action** | **Mục đích** |
|---|---|
| Toggle blink | Test blink |
| Force blink now | Test expression |
| Toggle look-at | Test head tracking |
| Reset procedural | Clear stuck transform |
| Show look target | Debug cursor mapping |
| Show bone axes | Debug bone rotation |
| Export snapshot | Debug bug report |

### **22.3. Telemetry events**

Procedural system should emit:

```text
procedural.module_missing_dependency
procedural.module_error
procedural.weight_changed
procedural.reset
procedural.performance_degraded
```

---

## **23. Performance Considerations**

### **23.1. Performance targets**

| **Operation** | **Target** |
|---|---|
| Procedural update total | < 0.3ms/frame |
| Blink update | < 0.02ms |
| Breathing update | < 0.05ms |
| Look-at update | < 0.08ms |
| Idle sway + micro | < 0.1ms |
| Debug snapshot | < 1ms at 1Hz |

### **23.2. Optimization rules**

```text
- Reuse Vector3, Euler, Quaternion objects.
- Avoid allocation inside update.
- Skip disabled modules early.
- Skip update if globalWeight = 0.
- Do not read DOM layout every frame.
- Cursor normalized position should be updated by event listener, not queried every frame.
- No IPC per frame.
```

### **23.3. Low FPS behavior**

If FPS below threshold:

```text
fps < 45:
  reduce micro motion
  reduce spring intensity

fps < 30:
  disable idle sway
  disable micro motion

fps < 25:
  disable spring bones if possible
  keep blink and subtle breathing only
```

---

## **24. Error Handling**

### **24.1. Error cases**

| **Error** | **Recovery** |
|---|---|
| Missing blink expression | Disable BlinkModule |
| Missing head bone | Disable LookAtModule |
| Missing spine/chest | Disable BreathingModule |
| Spring API unavailable | Disable SpringBoneTuner |
| Runtime exception in module | Disable module, report error |
| NaN transform | Reset affected module |
| Low FPS | Reduce procedural quality |

### **24.2. Module safety wrapper**

```typescript
for (const module of this.modules) {
  try {
    if (module.enabled) {
      module.update(ctx);
    }
  } catch (err) {
    module.enabled = false;
    reportProceduralError(module.id, err);
  }
}
```

### **24.3. NaN guard**

```typescript
function assertFiniteQuaternion(q: THREE.Quaternion): boolean {
  return Number.isFinite(q.x)
    && Number.isFinite(q.y)
    && Number.isFinite(q.z)
    && Number.isFinite(q.w);
}
```

---

## **25. File Structure**

```text
chiro-pet/
├── src/
│   ├── renderer/
│   │   └── procedural/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── ProceduralAnimationController.ts
│   │       ├── ProceduralWeightResolver.ts
│   │       ├── ProceduralBindContext.ts
│   │       ├── modules/
│   │       │   ├── BlinkModule.ts
│   │       │   ├── BreathingModule.ts
│   │       │   ├── LookAtModule.ts
│   │       │   ├── IdleSwayModule.ts
│   │       │   ├── MicroMotionModule.ts
│   │       │   ├── ExpressionModulator.ts
│   │       │   └── SpringBoneTuner.ts
│   │       ├── utils/
│   │       │   ├── smoothing.ts
│   │       │   ├── noise.ts
│   │       │   ├── boneRefs.ts
│   │       │   ├── expressionRefs.ts
│   │       │   └── cursorMapping.ts
│   │       └── debug/
│   │           ├── ProceduralDebugPanel.tsx
│   │           └── proceduralDebugStore.ts
│   │
│   └── shared/
│       └── types/
│           └── procedural.ts
│
├── src-tauri/
│   └── src/
│       ├── core/
│       │   └── procedural/
│       │       ├── mod.rs
│       │       ├── types.rs
│       │       ├── manager.rs
│       │       ├── settings.rs
│       │       ├── events.rs
│       │       └── errors.rs
│       │
│       └── ipc/
│           └── procedural_commands.rs
│
└── docs/
    └── procedural-animation-system.md
```

---

## **26. Implementation Checklist**

### **26.1. P0 Core**

- [ ] Define `ProceduralAnimationSettings`.
- [ ] Define `ProceduralModule` interface.
- [ ] Implement `ProceduralAnimationController`.
- [ ] Build bone refs from VRM humanoid.
- [ ] Build expression refs from VRM expression manager.
- [ ] Integrate update loop after `AnimationMixer.update`.
- [ ] Implement global weight resolver.

### **26.2. P0 Modules**

- [ ] Implement BlinkModule.
- [ ] Implement BreathingModule.
- [ ] Implement LookAtModule.
- [ ] Implement IdleSwayModule.
- [ ] Implement MicroMotionModule.
- [ ] Implement ExpressionModulator.
- [ ] Implement safe wrapper per module.

### **26.3. P0 Settings**

- [ ] Add procedural settings to animation settings.
- [ ] Toggle each module from settings.
- [ ] Implement reduce motion behavior.
- [ ] Reload settings at runtime.

### **26.4. P0 Integration**

- [ ] Bind procedural controller when model loads.
- [ ] Rebind on model hot-swap.
- [ ] Read state/mode/visibility per frame from stores.
- [ ] Disable modules when overlay hidden.
- [ ] Report module errors to telemetry/recovery.

### **26.5. P1 Debug**

- [ ] Procedural debug snapshot.
- [ ] Debug panel for modules.
- [ ] Force blink action.
- [ ] Reset procedural action.
- [ ] Show look target overlay.
- [ ] Telemetry integration.

### **26.6. P1 Performance**

- [ ] Reuse temp objects.
- [ ] No IPC per frame.
- [ ] FPS-based degradation.
- [ ] Benchmark update cost.

### **26.7. P2 Polish**

- [ ] Eye-only look-at if VRM supports it.
- [ ] Hand/finger idle micro motion.
- [ ] Emotion-specific idle variants.
- [ ] Cursor attention decay model.
- [ ] Personalized procedural profiles per character.
- [ ] Advanced spring tuning UI.

---

## **27. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Procedural Animation** | Animation sinh bằng code theo thời gian thực, không cần clip keyframe. |
| **Secondary Motion** | Chuyển động phụ như thở, lắc nhẹ, tóc/vải. |
| **Blink** | Chớp mắt tự động. |
| **Look-at** | Cơ chế mắt/đầu nhìn theo mục tiêu. |
| **Idle Sway** | Chuyển động nhẹ khi đứng yên. |
| **Micro Motion** | Chuyển động cực nhỏ để model không cứng. |
| **Expression Modulation** | Điều chỉnh expression nhẹ theo state/mood. |
| **Spring Bone** | Physics cho tóc/vải/phụ kiện trong VRM. |
| **Global Weight** | Cường độ tổng của procedural theo mode/settings. |
| **Reduce Motion** | Setting giảm chuyển động cho user nhạy cảm hoặc tiết kiệm hiệu năng. |

---

# **Phụ lục A: Flow update procedural mỗi frame**

```text
Render loop tick
  ↓
Compute deltaSeconds
  ↓
AnimationMixer.update(delta)
  ↓
ExpressionController.update(delta)
  ↓
Read runtime context:
  - animation state
  - character state
  - behavior mode
  - settings
  - cursor
  - visibility
  ↓
Compute global procedural weight
  ↓
If globalWeight <= 0:
  skip procedural
  ↓
For each module:
  - check enabled
  - compute module-specific weight
  - apply additive transform/expression
  - catch errors
  ↓
vrm.update(delta)
  ↓
renderer.render(scene, camera)
```

---

# **Phụ lục B: Flow look-at cursor**

```text
Pointer move over desktop/overlay
  ↓
Frontend updates CursorState:
  - screenX/screenY
  - canvasX/canvasY
  - normalizedX/normalizedY
  - lastMovedAt
  ↓
Render frame
  ↓
LookAtModule checks:
  - enabled?
  - cursor fresh?
  - not dragging?
  - animation conflict weight?
  ↓
Map normalized cursor to yaw/pitch
  ↓
Clamp yaw/pitch
  ↓
Damp current angle toward target
  ↓
Apply additive rotation:
  - head = larger weight
  - neck = smaller weight
  ↓
If cursor inactive timeout:
  damp back to center
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. ProceduralAnimationSettings mẫu**

```json
{
  "enabled": true,
  "blink_enabled": true,
  "breathing_enabled": true,
  "look_at_cursor_enabled": true,
  "idle_sway_enabled": true,
  "micro_motion_enabled": true,
  "expression_modulation_enabled": true,
  "spring_bone_tuning_enabled": true,
  "global_intensity": 1.0,
  "reduce_motion": false,
  "blink": {
    "min_interval_seconds": 2.5,
    "max_interval_seconds": 6.5,
    "close_duration_seconds": 0.055,
    "hold_duration_seconds": 0.035,
    "open_duration_seconds": 0.09,
    "double_blink_chance": 0.12,
    "sleepy_multiplier": 1.6
  },
  "breathing": {
    "frequency_per_minute": 14,
    "amplitude_chest": 0.015,
    "amplitude_spine": 0.008,
    "energy_multiplier": 0.2,
    "smoothing": 0.12
  },
  "look_at": {
    "head_weight": 0.35,
    "neck_weight": 0.15,
    "eye_weight": 0.8,
    "max_head_yaw_deg": 18,
    "max_head_pitch_deg": 10,
    "max_neck_yaw_deg": 8,
    "max_neck_pitch_deg": 5,
    "smoothing": 0.12,
    "return_to_center_seconds": 1.2,
    "cursor_idle_timeout_seconds": 4
  },
  "idle_sway": {
    "frequency": 0.18,
    "hips_yaw_amplitude_deg": 1.0,
    "chest_roll_amplitude_deg": 0.8,
    "head_yaw_amplitude_deg": 0.6,
    "phase_offset": 0.7
  },
  "micro_motion": {
    "head_noise_amplitude_deg": 0.35,
    "shoulder_amplitude_deg": 0.25,
    "frequency": 0.07,
    "noise_speed": 0.35
  },
  "expression": {
    "mood_to_expression_enabled": true,
    "max_additive_weight": 0.25,
    "smoothing": 0.15,
    "sleepy_relaxed_weight": 0.15
  },
  "spring_bone": {
    "enabled": true,
    "normal_intensity": 1.0,
    "focus_intensity": 0.65,
    "meeting_intensity": 0.4,
    "low_fps_intensity": 0.3,
    "disable_below_fps": 25
  }
}
```

## **C.2. ProceduralRuntimeStatus mẫu**

```json
{
  "enabled": true,
  "active_modules": [
    "blink",
    "breathing",
    "look_at",
    "idle_sway",
    "micro_motion",
    "expression_modulation"
  ],
  "disabled_modules": [],
  "warnings": [],
  "last_error": null,
  "updated_at": "2026-05-27T03:30:00Z"
}
```

## **C.3. ProceduralDebugSnapshot mẫu**

```json
{
  "enabled": true,
  "global_weight": 0.6,
  "modules": [
    {
      "id": "blink",
      "enabled": true,
      "active": false,
      "weight": 0,
      "values": {
        "phase": "waiting",
        "next_blink_in": 3.4
      },
      "warnings": []
    },
    {
      "id": "look_at",
      "enabled": true,
      "active": true,
      "weight": 0.6,
      "values": {
        "yaw": 0.08,
        "pitch": -0.03
      },
      "warnings": []
    }
  ],
  "sampled_at": "2026-05-27T03:30:00Z"
}
```

## **C.4. Procedural module error event mẫu**

```json
{
  "module_id": "look_at",
  "error": "missing_head_bone"
}
```

---