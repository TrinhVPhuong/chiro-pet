# **Chiro-Pet Shader System**

> Tài liệu thiết kế chính thức cho **Shader System** của **Chiro-Pet**.  
> Hệ thống này định nghĩa pipeline visual cho character 3D trên desktop: **NPR/cel-shading**, **MToon compatibility**, **outline**, **rim light**, **face shadow**, **eye highlight**, **hair highlight**, **material presets**, **performance fallback** và **runtime quality control**.
>
> **Nguyên tắc lõi:** Shader System là lớp **visual polish**. Nó không được phá compatibility với VRM, không được làm giảm FPS nghiêm trọng, không được hardcode theo một model cụ thể, và phải có fallback về material cơ bản nếu shader lỗi hoặc thiết bị yếu.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Vai trò trong Rendering Stack](#3-vai-trò-trong-rendering-stack)
4. [Kiến trúc tổng thể](#4-kiến-trúc-tổng-thể)
5. [Shader Modes](#5-shader-modes)
6. [Data Model](#6-data-model)
7. [Material Pipeline](#7-material-pipeline)
8. [MToon Compatibility](#8-mtoon-compatibility)
9. [NPR Cel-Shading](#9-npr-cel-shading)
10. [Outline System](#10-outline-system)
11. [Rim Light System](#11-rim-light-system)
12. [Face Shadow System](#12-face-shadow-system)
13. [Eye Shader & Highlights](#13-eye-shader--highlights)
14. [Hair Shader & Anisotropic Highlight](#14-hair-shader--anisotropic-highlight)
15. [Lighting Setup](#15-lighting-setup)
16. [Runtime Quality System](#16-runtime-quality-system)
17. [Performance Fallback](#17-performance-fallback)
18. [Settings Integration](#18-settings-integration)
19. [Asset & VRM Integration](#19-asset--vrm-integration)
20. [Frontend Implementation](#20-frontend-implementation)
21. [Backend Coordination](#21-backend-coordination)
22. [IPC Contract](#22-ipc-contract)
23. [Debug Tools](#23-debug-tools)
24. [Error Handling](#24-error-handling)
25. [Performance Considerations](#25-performance-considerations)
26. [File Structure](#26-file-structure)
27. [Implementation Checklist](#27-implementation-checklist)
28. [Glossary](#28-glossary)
29. [Phụ lục A: Flow apply shader preset](#phụ-lục-a-flow-apply-shader-preset)
30. [Phụ lục B: Flow fallback khi shader lỗi](#phụ-lục-b-flow-fallback-khi-shader-lỗi)
31. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)
32. [Tổng kết tài liệu đã tổng hợp và còn lại](#32-tổng-kết-tài-liệu-đã-tổng-hợp-và-còn-lại)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Shader System của **Chiro-Pet** phải:

- Cải thiện visual quality của VRM character trên desktop.
- Hỗ trợ phong cách:
  - **MToon original**
  - **NPR cel-shading**
  - **soft anime shading**
  - **basic fallback**
- Hỗ trợ outline đẹp, có kiểm soát.
- Hỗ trợ rim light nhẹ để tách character khỏi desktop background.
- Hỗ trợ face shadow và eye highlight nếu model/material phù hợp.
- Cho phép user chỉnh:
  - shader mode
  - outline thickness
  - rim intensity
  - shadow softness
  - color grading nhẹ
  - quality preset
- Tự giảm chất lượng khi FPS thấp.
- Fallback an toàn nếu shader compile fail.
- Tích hợp với:
  - Asset System
  - Renderer
  - Animation Runtime
  - Procedural Animation
  - Telemetry Debug
  - Error Recovery
  - Settings System

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Shader architecture.
- Material conversion pipeline.
- MToon compatibility.
- Cel-shading.
- Outline.
- Rim light.
- Face shadow.
- Eye/hair visual polish.
- Runtime quality/fallback.
- Settings, IPC, debug tools.

Tài liệu này không mô tả chi tiết:

- VRM import pipeline.
- AnimationMixer blending.
- Procedural animation logic.
- Asset registry implementation.
- Full renderer lifecycle.

Các phần đó thuộc system docs riêng.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Compatibility first** | VRM/MToon material gốc phải render được trước khi nâng cấp shader. |
| **2** | **Fallback always available** | Shader lỗi phải fallback về `MeshBasicMaterial` hoặc MToon gốc. |
| **3** | **No model-specific hardcode** | Không hardcode tên mesh/material của một model cụ thể. |
| **4** | **Performance bounded** | Shader không được làm overlay tụt FPS nghiêm trọng. |
| **5** | **Non-destructive** | Không sửa file VRM gốc, chỉ patch material runtime. |
| **6** | **Preset-based** | Visual style nên cấu hình bằng preset. |
| **7** | **Debuggable** | Có material inspector, shader status, compile error report. |
| **8** | **Graceful degradation** | FPS thấp thì giảm outline, rim, postprocess trước khi tắt render. |
| **9** | **Desktop-aware contrast** | Character phải nổi trên nền desktop sáng/tối khác nhau. |
| **10** | **User controllable** | User có thể tắt shader nâng cao nếu muốn nhẹ máy. |

### **2.2. Anti-pattern cần tránh**

- ❌ Replace toàn bộ material mà mất texture/expression/morph target.
- ❌ Dùng heavy post-processing chain cho overlay nhỏ.
- ❌ Outline bằng full-screen Sobel mặc định, tốn GPU không cần thiết.
- ❌ Rim light quá mạnh làm character bị cháy viền.
- ❌ Face shadow hardcode theo một model.
- ❌ Shader compile fail làm renderer blank.
- ❌ Không dispose material cũ khi swap.
- ❌ Không support transparent material.
- ❌ Không handle alpha cutoff.
- ❌ Không có mode fallback cho GPU yếu.

---

## **3. Vai trò trong Rendering Stack**

### **3.1. Rendering stack**

```text
Layer 0: Asset / VRM Loader
Layer 1: Material Resolver
Layer 2: Shader System
  - MToon
  - NPR Cel
  - Outline
  - Rim
  - Eye/Hair polish
Layer 3: Animation Runtime
Layer 4: Procedural Animation
Layer 5: Renderer
Layer 6: Telemetry / Debug
```

### **3.2. Shader System được phép làm gì**

Shader System được phép:

- Đọc material/texture từ VRM runtime.
- Clone hoặc patch material runtime.
- Apply shader preset.
- Set uniforms.
- Enable/disable outline pass.
- Adjust light setup.
- Track shader compile status.
- Emit debug/recovery events.

Shader System không được:

- Sửa file asset.
- Ghi character state.
- Gọi AI.
- Tự đổi animation.
- Tự thay model.
- Gửi dữ liệu ra ngoài app.

---

## **4. Kiến trúc tổng thể**

```text
┌──────────────────────────────────────────────────────────────┐
│                         VRM MODEL                             │
│  - meshes                                                     │
│  - materials                                                  │
│  - textures                                                   │
│  - MToon metadata                                             │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                      SHADER MANAGER                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Material Scanner                                       │  │
│  │ - detect material type                                 │  │
│  │ - classify face/eye/hair/body                          │  │
│  │ - collect texture refs                                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Material Adapter                                       │  │
│  │ - MToon passthrough                                    │  │
│  │ - MToon enhanced                                       │  │
│  │ - NPR cel material                                     │  │
│  │ - basic fallback                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Shader Preset Resolver                                 │  │
│  │ - quality preset                                       │  │
│  │ - visual style                                         │  │
│  │ - performance mode                                     │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Effects                                                │  │
│  │ - outline                                              │  │
│  │ - rim light                                            │  │
│  │ - face shadow                                          │  │
│  │ - eye highlight                                        │  │
│  │ - hair highlight                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Fallback Controller                                    │  │
│  │ - compile error                                        │  │
│  │ - low FPS                                              │
│  │ - WebGL limitation                                     │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                     THREE.JS RENDERER                         │
│  - WebGLRenderer                                              │
│  - scene/camera/lights                                        │
│  - optional outline mesh/pass                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## **5. Shader Modes**

### **5.1. ShaderMode**

```typescript
export type ShaderMode =
  | "vrm_original"
  | "mtoon_enhanced"
  | "npr_cel"
  | "soft_anime"
  | "basic_fallback";
```

### **5.2. Mode behavior**

| **Mode** | **Mô tả** | **Dùng khi** |
|---|---|---|
| **vrm_original** | Giữ material gốc từ VRM loader | Compatibility tối đa |
| **mtoon_enhanced** | Giữ MToon, thêm rim/outline nhẹ | Default khuyến nghị |
| **npr_cel** | Cel-shading rõ band màu | Visual anime rõ |
| **soft_anime** | Cel nhẹ, shadow mềm | Desktop companion thân thiện |
| **basic_fallback** | Basic/standard material đơn giản | GPU yếu hoặc shader lỗi |

### **5.3. QualityPreset**

```typescript
export type ShaderQualityPreset =
  | "low"
  | "medium"
  | "high"
  | "ultra";
```

### **5.4. Quality matrix**

| **Quality** | **Outline** | **Rim** | **Face shadow** | **Eye/Hair polish** |
|---|---|---|---|---|
| **low** | Off | Low | Off | Off |
| **medium** | Simple | Low | Simple | Eye only |
| **high** | On | Medium | On | Eye + hair |
| **ultra** | On | High | On | Full |

---

## **6. Data Model**

### **6.1. ShaderSettings**

```typescript
export interface ShaderSettings {
  enabled: boolean;

  mode: ShaderMode;
  quality: ShaderQualityPreset;

  outline: OutlineSettings;
  rim: RimLightSettings;
  cel: CelShadingSettings;
  face_shadow: FaceShadowSettings;
  eye: EyeShaderSettings;
  hair: HairShaderSettings;

  auto_quality_enabled: boolean;
  fallback_on_error: boolean;
}
```

### **6.2. OutlineSettings**

```typescript
export interface OutlineSettings {
  enabled: boolean;
  method: "inverted_hull" | "postprocess" | "none";
  thickness: number;          // default 0.008
  color: string;              // "#1a1a1a"
  opacity: number;            // 0..1
  depth_offset: number;       // default 0.001
  scale_with_distance: boolean;
}
```

### **6.3. RimLightSettings**

```typescript
export interface RimLightSettings {
  enabled: boolean;
  color: string;              // "#ffffff"
  intensity: number;          // 0..2
  power: number;              // default 2.0
  width: number;              // 0..1
  use_light_direction: boolean;
}
```

### **6.4. CelShadingSettings**

```typescript
export interface CelShadingSettings {
  enabled: boolean;
  shade_steps: number;        // 2..5
  shadow_strength: number;    // 0..1
  shadow_softness: number;    // 0..1
  highlight_strength: number; // 0..1
  ambient_lift: number;       // 0..1
}
```

### **6.5. FaceShadowSettings**

```typescript
export interface FaceShadowSettings {
  enabled: boolean;
  mode: "none" | "simple_gradient" | "sdf_texture";
  strength: number;           // 0..1
  softness: number;           // 0..1
  face_material_hint: string[]; // ["face", "skin", "head"]
}
```

### **6.6. EyeShaderSettings**

```typescript
export interface EyeShaderSettings {
  enabled: boolean;
  highlight_enabled: boolean;
  highlight_intensity: number;
  highlight_size: number;
  wetness: number;
  eye_material_hint: string[]; // ["eye", "iris"]
}
```

### **6.7. HairShaderSettings**

```typescript
export interface HairShaderSettings {
  enabled: boolean;
  anisotropic_highlight: boolean;
  highlight_intensity: number;
  highlight_width: number;
  hair_material_hint: string[]; // ["hair"]
}
```

### **6.8. ShaderRuntimeStatus**

```typescript
export interface ShaderRuntimeStatus {
  enabled: boolean;
  mode: ShaderMode;
  quality: ShaderQualityPreset;
  active_effects: string[];
  fallback_active: boolean;
  last_error?: string | null;
  material_count: number;
  enhanced_material_count: number;
  compile_errors: ShaderCompileError[];
  updated_at: string;
}
```

### **6.9. ShaderCompileError**

```typescript
export interface ShaderCompileError {
  material_name?: string | null;
  shader_stage: "vertex" | "fragment" | "program" | "unknown";
  message: string;
  occurred_at: string;
}
```

---

## **7. Material Pipeline**

### **7.1. Material pipeline flow**

```text
VRM loaded
  ↓
Traverse scene meshes
  ↓
Collect materials
  ↓
Classify material role:
  - skin
  - face
  - eye
  - hair
  - body
  - accessory
  - transparent
  ↓
For each material:
  - preserve texture maps
  - preserve alpha/cutoff
  - preserve morph/skinning flags
  - choose adapter
  ↓
Apply shader mode
  ↓
Attach debug metadata
  ↓
Render
```

### **7.2. MaterialRole**

```typescript
export type MaterialRole =
  | "skin"
  | "face"
  | "eye"
  | "hair"
  | "body"
  | "accessory"
  | "transparent"
  | "unknown";
```

### **7.3. MaterialInfo**

```typescript
export interface MaterialInfo {
  id: string;
  name: string;
  role: MaterialRole;
  originalType: string;
  transparent: boolean;
  alphaTest: number;
  hasMap: boolean;
  hasNormalMap: boolean;
  hasEmissiveMap: boolean;
  meshName: string;
}
```

### **7.4. Material classifier**

```typescript
export function classifyMaterial(
  material: THREE.Material,
  meshName: string,
): MaterialRole {
  const name = `${material.name} ${meshName}`.toLowerCase();

  if (name.includes("eye") || name.includes("iris")) return "eye";
  if (name.includes("hair")) return "hair";
  if (name.includes("face") || name.includes("head")) return "face";
  if (name.includes("skin") || name.includes("body")) return "skin";
  if (material.transparent) return "transparent";
  if (name.includes("cloth") || name.includes("dress") || name.includes("shirt")) return "body";

  return "unknown";
}
```

### **7.5. Preserve required flags**

Khi replace material, phải giữ:

```typescript
function copyMaterialRuntimeFlags(
  from: THREE.Material,
  to: THREE.Material,
) {
  to.transparent = from.transparent;
  to.opacity = from.opacity;
  to.alphaTest = from.alphaTest;
  to.depthWrite = from.depthWrite;
  to.depthTest = from.depthTest;
  to.side = from.side;
  to.skinning = (from as any).skinning ?? true;
  to.morphTargets = (from as any).morphTargets ?? true;
  to.morphNormals = (from as any).morphNormals ?? true;
}
```

---

## **8. MToon Compatibility**

### **8.1. MToon policy**

VRM thường dùng MToon. MVP nên ưu tiên:

```text
Default mode = mtoon_enhanced
```

Lý do:

- Ít phá material gốc.
- Giữ expression/morph compatibility.
- Giữ texture và toon ramp tốt.
- Phù hợp VRM 0.x/1.0 hơn custom shader toàn phần.

### **8.2. MToon enhanced behavior**

```text
- Preserve original MToon material.
- Add or tune:
  - rim lighting if supported
  - outline if supported or external outline
  - shade color boost
  - emissive slight lift
- Do not replace if material has custom extension unsupported.
```

### **8.3. Adapter interface**

```typescript
export interface MaterialAdapter {
  canApply(info: MaterialInfo): boolean;

  apply(
    material: THREE.Material,
    info: MaterialInfo,
    settings: ShaderSettings,
  ): THREE.Material;

  dispose(): void;
}
```

### **8.4. MToonAdapter sketch**

```typescript
export class MToonEnhancedAdapter implements MaterialAdapter {
  canApply(info: MaterialInfo): boolean {
    return info.originalType.toLowerCase().includes("mtoon");
  }

  apply(
    material: THREE.Material,
    info: MaterialInfo,
    settings: ShaderSettings,
  ): THREE.Material {
    const m = material.clone();

    // Pseudo, actual fields depend on three-vrm material implementation.
    const anyMat = m as any;

    if (settings.rim.enabled && anyMat.uniforms?.rimLightingMixFactor) {
      anyMat.uniforms.rimLightingMixFactor.value = settings.rim.intensity;
    }

    if (anyMat.uniforms?.shadeMultiplyTexture) {
      // Preserve existing shade texture.
    }

    m.needsUpdate = true;
    return m;
  }

  dispose() {}
}
```

### **8.5. Fallback when MToon unsupported**

```text
If MToon internals not accessible:
  - keep original material
  - use external outline
  - use scene lighting/rim approximation
```

---

## **9. NPR Cel-Shading**

### **9.1. Cel shading goal**

Tạo phong cách anime/toon:

- Shadow band rõ.
- Ambient lift để không quá tối.
- Highlight nhẹ.
- Giữ texture base color.
- Không quá nặng GPU.

### **9.2. ToonMaterial uniforms**

```typescript
export interface ToonShaderUniforms {
  map: THREE.Texture | null;
  baseColor: THREE.Color;

  lightDirection: THREE.Vector3;
  lightColor: THREE.Color;
  ambientColor: THREE.Color;

  shadeSteps: number;
  shadowStrength: number;
  shadowSoftness: number;
  highlightStrength: number;
  ambientLift: number;

  rimColor: THREE.Color;
  rimIntensity: number;
  rimPower: number;
}
```

### **9.3. Fragment logic concept**

```glsl
vec3 normal = normalize(vNormal);
vec3 lightDir = normalize(uLightDirection);
float ndl = max(dot(normal, lightDir), 0.0);

float stepped = floor(ndl * uShadeSteps) / max(uShadeSteps - 1.0, 1.0);
float shade = mix(1.0 - uShadowStrength, 1.0, stepped);

vec3 base = texture2D(uMap, vUv).rgb * uBaseColor;
vec3 color = base * shade;
color += base * uAmbientLift;

float rim = pow(1.0 - max(dot(normal, normalize(vViewDir)), 0.0), uRimPower);
color += uRimColor * rim * uRimIntensity;

gl_FragColor = vec4(color, alpha);
```

### **9.4. ShaderMaterial creation**

```typescript
export function createNprCelMaterial(
  source: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
  settings: ShaderSettings,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: (source as any).map ?? null },
      uBaseColor: { value: (source as any).color?.clone?.() ?? new THREE.Color(1, 1, 1) },
      uLightDirection: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      uShadeSteps: { value: settings.cel.shade_steps },
      uShadowStrength: { value: settings.cel.shadow_strength },
      uShadowSoftness: { value: settings.cel.shadow_softness },
      uAmbientLift: { value: settings.cel.ambient_lift },
      uRimColor: { value: new THREE.Color(settings.rim.color) },
      uRimIntensity: { value: settings.rim.enabled ? settings.rim.intensity : 0 },
      uRimPower: { value: settings.rim.power },
    },
    vertexShader: NPR_CEL_VERTEX_SHADER,
    fragmentShader: NPR_CEL_FRAGMENT_SHADER,
    transparent: source.transparent,
    alphaTest: source.alphaTest,
    side: source.side,
    skinning: true,
    morphTargets: true,
    morphNormals: true,
  });

  return material;
}
```

### **9.5. Limitations**

```text
NPR custom material can break:
- MToon-specific shade textures
- advanced transparency
- special emission behavior
- some VRM expression material binds

Therefore:
- Use npr_cel as optional.
- Default to mtoon_enhanced.
```

---

## **10. Outline System**

### **10.1. Outline methods**

| **Method** | **Mô tả** | **Ưu điểm** | **Nhược điểm** |
|---|---|---|---|
| **inverted_hull** | Clone mesh, flip normals, render back side | Anime style tốt, không fullscreen pass | Thêm draw calls |
| **postprocess** | Detect edge từ depth/normal | Áp dụng toàn scene | Nặng hơn, phức tạp transparent |
| **none** | Không outline | Nhẹ nhất | Ít nổi trên nền |

MVP nên dùng:

```text
inverted_hull
```

### **10.2. Outline mesh strategy**

```text
For each visible skinned mesh:
  - clone reference
  - create outline material
  - render backside
  - scale along normal in vertex shader
  - attach as sibling/child
```

### **10.3. Outline material**

```typescript
export function createOutlineMaterial(settings: OutlineSettings) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uThickness: { value: settings.thickness },
      uColor: { value: new THREE.Color(settings.color) },
      uOpacity: { value: settings.opacity },
    },
    vertexShader: OUTLINE_VERTEX_SHADER,
    fragmentShader: OUTLINE_FRAGMENT_SHADER,
    side: THREE.BackSide,
    transparent: settings.opacity < 1,
    depthWrite: false,
    skinning: true,
    morphTargets: true,
  });
}
```

### **10.4. Outline vertex concept**

```glsl
vec3 transformed = position + normal * uThickness;
gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
```

### **10.5. Outline manager**

```typescript
export class OutlineManager {
  private outlineObjects: THREE.Object3D[] = [];

  apply(vrmRoot: THREE.Object3D, settings: OutlineSettings) {
    this.clear();

    if (!settings.enabled || settings.method === "none") return;

    vrmRoot.traverse((obj: any) => {
      if (!obj.isSkinnedMesh && !obj.isMesh) return;
      if (!obj) return;

      const outline = obj.clone();
      outline.material = createOutlineMaterial(settings);
      outline.renderOrder = (obj.renderOrder ?? 0) - 1;

      obj.parent?.add(outline);
      this.outlineObjects.push(outline);
    });
  }

  clear() {
    for (const obj of this.outlineObjects) {
      obj.parent?.remove(obj);
      disposeMaterial(obj.material);
    }

    this.outlineObjects = [];
  }
}
```

### **10.6. Outline performance rule**

```text
If draw_calls > threshold or FPS < 45:
  - reduce outline thickness
  - disable outline for small accessories
  - fallback outline off if FPS < 30
```

---

## **11. Rim Light System**

### **11.1. Rim light goal**

Rim light giúp character nổi khỏi desktop background, nhất là khi nền tối hoặc nhiều chi tiết.

### **11.2. Rim formula**

```glsl
float rim = 1.0 - max(dot(normal, viewDir), 0.0);
rim = pow(rim, uRimPower);
rim = smoothstep(1.0 - uRimWidth, 1.0, rim);
vec3 rimColor = uRimColor * rim * uRimIntensity;
```

### **11.3. Rim settings by mode**

| **Mode** | **Intensity** |
|---|---|
| Normal | 0.35 |
| Focus | 0.25 |
| Gaming | 0.15 |
| Meeting | 0.10 |
| Streamer | 0.20 |
| Low quality | 0.0-0.15 |

### **11.4. Runtime update**

```typescript
export function updateRimUniforms(
  material: THREE.Material,
  settings: RimLightSettings,
  mode: EffectiveBehaviorMode,
) {
  const uniforms = (material as any).uniforms;
  if (!uniforms?.uRimIntensity) return;

  let intensity = settings.enabled ? settings.intensity : 0;

  if (mode === "focus") intensity *= 0.7;
  if (mode === "meeting" || mode === "gaming") intensity *= 0.4;

  uniforms.uRimIntensity.value = intensity;
}
```

---

## **12. Face Shadow System**

### **12.1. Face shadow goal**

Face shadow giúp mặt anime có chiều sâu nhưng không bị bẩn hoặc quá tối.

### **12.2. Face shadow modes**

| **Mode** | **Mô tả** |
|---|---|
| **none** | Không apply |
| **simple_gradient** | Gradient mềm theo normal/light |
| **sdf_texture** | Dùng SDF face shadow texture nếu asset có |

MVP:

```text
simple_gradient only
```

### **12.3. Face material detection**

```typescript
function isFaceMaterial(info: MaterialInfo, settings: FaceShadowSettings): boolean {
  const name = `${info.name} ${info.meshName}`.toLowerCase();

  return settings.face_material_hint.some((hint) =>
    name.includes(hint.toLowerCase()),
  );
}
```

### **12.4. Simple face shadow**

```glsl
float faceShade = dot(normalize(vNormal), normalize(uLightDirection));
float shadow = smoothstep(
  uFaceShadowSoftness,
  1.0,
  faceShade
);

vec3 finalColor = mix(
  baseColor * (1.0 - uFaceShadowStrength),
  baseColor,
  shadow
);
```

### **12.5. Safety rule**

```text
Face shadow phải tắt nếu:
- material transparent
- role != face/skin
- shader mode = vrm_original
- low quality mode
```

---

## **13. Eye Shader & Highlights**

### **13.1. Eye polish goal**

Mắt là điểm visual quan trọng nhất. Eye shader nên:

- Giữ texture mắt gốc.
- Thêm highlight nhỏ nếu không có.
- Tăng contrast nhẹ.
- Không phá blink/expression.

### **13.2. Eye material detection**

```typescript
function isEyeMaterial(info: MaterialInfo, settings: EyeShaderSettings): boolean {
  const name = `${info.name} ${info.meshName}`.toLowerCase();

  return settings.eye_material_hint.some((hint) =>
    name.includes(hint.toLowerCase()),
  );
}
```

### **13.3. Eye highlight approximation**

MVP không cần shader phức tạp. Có thể dùng:

```text
Option A:
- Shader uniform thêm highlight dựa trên UV.

Option B:
- Add small transparent highlight mesh/sprite on eye if model supports helper anchor.

MVP chọn Option A.
```

### **13.4. Fragment concept**

```glsl
vec2 highlightCenter = vec2(0.35, 0.65);
float d = distance(vUv, highlightCenter);
float highlight = smoothstep(uHighlightSize, 0.0, d);
color += vec3(1.0) * highlight * uHighlightIntensity;
```

### **13.5. Eye safety**

```text
- Apply only if material role = eye.
- Keep alpha and texture.
- Do not apply to eyelash transparent material unless detected separately.
```

---

## **14. Hair Shader & Anisotropic Highlight**

### **14.1. Hair polish goal**

Hair shader tạo highlight dọc sợi tóc nhẹ, giúp tóc có chiều sâu anime.

### **14.2. Hair detection**

```typescript
function isHairMaterial(info: MaterialInfo, settings: HairShaderSettings): boolean {
  const name = `${info.name} ${info.meshName}`.toLowerCase();

  return settings.hair_material_hint.some((hint) =>
    name.includes(hint.toLowerCase()),
  );
}
```

### **14.3. Anisotropic approximation**

Không cần physical accurate. Dùng view/light/normal và UV direction:

```glsl
float strand = abs(fract(vUv.y * 8.0) - 0.5);
float band = smoothstep(uHairHighlightWidth, 0.0, strand);

float ndl = max(dot(normal, lightDir), 0.0);
float highlight = band * pow(ndl, 2.0) * uHairHighlightIntensity;

color += vec3(1.0) * highlight;
```

### **14.4. Hair safety**

```text
- Disable in low quality.
- Avoid on transparent hair accessories.
- Clamp intensity <= 0.5 by default.
```

---

## **15. Lighting Setup**

### **15.1. Default lighting**

For desktop companion:

```typescript
const ambient = new THREE.AmbientLight(0xffffff, 1.2);

const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(0.4, 1.0, 0.8);

const fill = new THREE.DirectionalLight(0xbfd7ff, 0.25);
fill.position.set(-0.8, 0.4, 0.4);

const rim = new THREE.DirectionalLight(0xffffff, 0.35);
rim.position.set(-0.5, 0.8, -1.0);
```

### **15.2. Lighting policy**

```text
- Avoid strong real-time shadows in overlay MVP.
- Prefer baked/texture toon shading.
- Use ambient lift to avoid black shadows on desktop.
- Keep lights stable, no flicker.
```

### **15.3. Desktop contrast**

Optional future:

```text
- Sample desktop/background brightness? 
- Not MVP because screenshot/background sampling has privacy implications.
```

MVP rule:

```text
Use user-selectable contrast preset:
- normal
- dark_background
- light_background
```

---

## **16. Runtime Quality System**

### **16.1. ShaderQualityState**

```typescript
export interface ShaderQualityState {
  requested_quality: ShaderQualityPreset;
  effective_quality: ShaderQualityPreset;
  auto_degraded: boolean;
  reason?: string | null;
  fps_average: number;
  updated_at: string;
}
```

### **16.2. Auto quality policy**

```text
If FPS < 45 for 10s:
  ultra → high
  high → medium

If FPS < 30 for 10s:
  medium → low

If FPS recovers > 55 for 30s:
  can restore one level if auto_quality_enabled
```

### **16.3. Quality degradation ladder**

```text
1. Reduce outline thickness.
2. Disable hair highlight.
3. Disable face shadow.
4. Disable outline.
5. Reduce rim intensity.
6. Switch to mtoon_original or basic_fallback.
```

### **16.4. Quality controller sketch**

```typescript
export class ShaderQualityController {
  private lowFpsSeconds = 0;
  private recoverSeconds = 0;

  update(fps: number, settings: ShaderSettings): ShaderQualityPreset {
    if (!settings.auto_quality_enabled) {
      return settings.quality;
    }

    if (fps < 45) {
      this.lowFpsSeconds += 1;
      this.recoverSeconds = 0;
    } else if (fps > 55) {
      this.recoverSeconds += 1;
      this.lowFpsSeconds = 0;
    }

    if (this.lowFpsSeconds >= 10) {
      return degradeQuality(settings.quality);
    }

    return settings.quality;
  }
}
```

---

## **17. Performance Fallback**

### **17.1. Fallback hierarchy**

```text
Shader error or low performance
  ↓
Disable optional effects:
  - hair highlight
  - face shadow
  - outline
  ↓
Switch material mode:
  npr_cel → mtoon_enhanced
  mtoon_enhanced → vrm_original
  vrm_original → basic_fallback
```

### **17.2. Basic fallback material**

```typescript
export function createBasicFallbackMaterial(source: THREE.Material): THREE.Material {
  const src = source as any;

  const fallback = new THREE.MeshBasicMaterial({
    map: src.map ?? null,
    color: src.color?.clone?.() ?? new THREE.Color(1, 1, 1),
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
  });

  copyMaterialRuntimeFlags(source, fallback);

  return fallback;
}
```

### **17.3. Fallback trigger**

| **Trigger** | **Action** |
|---|---|
| Shader compile fail | fallback material for affected mesh |
| WebGL context lost | restore resources, then fallback if repeated |
| FPS critical | disable expensive effects |
| Material unsupported | keep original material |
| Texture missing | use color-only material |

---

## **18. Settings Integration**

### **18.1. Animation/visual settings extension**

Shader settings nên nằm trong section riêng hoặc `animation.visual`.

Khuyến nghị:

```text
settings.visual.shader
```

Nếu chưa có `visual` section, có thể thêm vào `animation.shader` tạm thời.

### **18.2. VisualSettings**

```typescript
export interface VisualSettings {
  shader: ShaderSettings;
  lighting: LightingSettings;
  contrast_preset: "normal" | "dark_background" | "light_background";
}
```

### **18.3. LightingSettings**

```typescript
export interface LightingSettings {
  ambient_intensity: number;
  key_intensity: number;
  fill_intensity: number;
  rim_light_intensity: number;
}
```

### **18.4. Settings update flow**

```text
settings_updated(visual/animation)
  ↓
ShaderManager reads new settings
  ↓
Recompute preset
  ↓
Apply to current VRM materials
  ↓
Rebuild outline if needed
  ↓
Emit shader_status_updated
```

---

## **19. Asset & VRM Integration**

### **19.1. On VRM loaded**

```text
VRM loaded
  ↓
ShaderManager.bind(vrm)
  ↓
Scan materials
  ↓
Store original material refs
  ↓
Apply current shader preset
  ↓
Build outline if enabled
  ↓
Emit status
```

### **19.2. On model hot-swap**

```text
Character model swapped
  ↓
ShaderManager.unbind old:
  - clear outline
  - dispose enhanced materials
  - release refs
  ↓
ShaderManager.bind new
  ↓
Apply shader settings
```

### **19.3. Original material preservation**

```typescript
export interface OriginalMaterialRecord {
  meshUuid: string;
  materialIndex: number;
  original: THREE.Material;
  current?: THREE.Material;
}
```

### **19.4. Unbind cleanup**

```typescript
unbind() {
  this.outlineManager.clear();

  for (const record of this.materialRecords) {
    if (record.current && record.current !== record.original) {
      disposeMaterial(record.current);
    }
  }

  this.materialRecords = [];
  this.vrm = null;
}
```

---

## **20. Frontend Implementation**

### **20.1. Runtime location**

Shader System chủ yếu nằm frontend:

```text
src/renderer/shader/
```

Lý do:

- Cần access Three.js material/renderer.
- Shader compile/runtime xảy ra trong WebGL.
- Per-frame uniform update không nên qua IPC.

### **20.2. ShaderManager**

```typescript
export class ShaderManager {
  private vrm: VRM | null = null;
  private materialRecords: OriginalMaterialRecord[] = [];
  private outlineManager = new OutlineManager();
  private status: ShaderRuntimeStatus;

  bind(vrm: VRM, settings: ShaderSettings) {
    this.vrm = vrm;
    this.scanMaterials(vrm);
    this.applySettings(settings);
  }

  applySettings(settings: ShaderSettings) {
    if (!this.vrm || !settings.enabled) {
      this.restoreOriginalMaterials();
      return;
    }

    try {
      this.applyMaterialMode(settings);
      this.outlineManager.apply(this.vrm.scene, settings.outline);
      this.updateStatus();
    } catch (err) {
      this.handleShaderError(err, settings);
    }
  }

  updatePerFrame(ctx: ShaderFrameContext) {
    // Update uniforms only, no material rebuild.
    for (const record of this.materialRecords) {
      updateRuntimeUniforms(record.current, ctx);
    }
  }

  unbind() {
    this.outlineManager.clear();
    this.restoreOriginalMaterials();
    this.disposeEnhancedMaterials();
    this.vrm = null;
  }
}
```

### **20.3. Per-frame updates**

Per-frame chỉ nên update:

```text
- light direction uniform
- rim intensity by mode
- time uniform if needed
```

Không nên:

```text
- recreate material
- rebuild outline
- traverse entire scene
```

### **20.4. React hook**

```typescript
export function useShaderRuntime(vrm: VRM | null) {
  const settings = useSettingsStore((s) => s.settings?.visual?.shader);
  const managerRef = useRef<shadermanager |="" null="">(null);

  useEffect(() => {
    if (!vrm || !settings) return;

    const manager = new ShaderManager();
    manager.bind(vrm, settings);
    managerRef.current = manager;

    return () => {
      manager.unbind();
      managerRef.current = null;
    };
  }, [vrm]);

  useEffect(() => {
    if (settings && managerRef.current) {
      managerRef.current.applySettings(settings);
    }
  }, [settings]);

  return managerRef;
}
```

---

## **21. Backend Coordination**

### **21.1. Backend responsibilities**

Backend chỉ quản lý:

- Persist shader/visual settings.
- IPC commands.
- Debug status reports.
- Telemetry/recovery record.
- No per-frame shader logic.

### **21.2. ShaderManager backend status**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShaderStatusReport {
    pub enabled: bool,
    pub mode: String,
    pub quality: String,
    pub fallback_active: bool,
    pub material_count: u32,
    pub enhanced_material_count: u32,
    pub active_effects: Vec<string>,
    pub last_error: Option<string>,
    pub updated_at: DateTime<utc>,
}
```

### **21.3. Renderer reports**

Frontend reports:

```text
- shader status
- compile errors
- fallback activated
- quality degraded
```

---

## **22. IPC Contract**

### **22.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `shader_get_settings` | `{}` | `ShaderSettings` |
| `shader_update_settings` | `Partial<shadersettings>` | `ShaderSettings` |
| `shader_get_status` | `{}` | `ShaderRuntimeStatus` |
| `shader_report_status` | `ShaderRuntimeStatus` | `void` |
| `shader_report_compile_error` | `ShaderCompileError` | `void` |
| `shader_set_mode` | `{ mode: ShaderMode }` | `ShaderSettings` |
| `shader_set_quality` | `{ quality: ShaderQualityPreset }` | `ShaderSettings` |
| `shader_reset_defaults` | `{}` | `ShaderSettings` |
| `shader_request_reapply` | `{}` | `void` |

### **22.2. Rust → Frontend events**

| **Event** | **Payload** |
|---|---|
| `shader_settings_updated` | `ShaderSettings` |
| `shader_status_updated` | `ShaderRuntimeStatus` |
| `shader_compile_error` | `ShaderCompileError` |
| `shader_fallback_activated` | `{ reason: string }` |
| `shader_quality_changed` | `ShaderQualityState` |
| `shader_reapply_requested` | `{}` |

### **22.3. IPC rules**

```text
- Không IPC per-frame.
- `shader_report_status` chỉ gửi khi status thay đổi hoặc debug panel mở.
- Compile error phải sanitize message trước khi log.
```

---

## **23. Debug Tools**

### **23.1. Shader debug panel**

Hiển thị:

```text
Shader mode: mtoon_enhanced
Quality: high
Materials: 12
Enhanced: 8
Outline: enabled
Rim: enabled
Face shadow: enabled
Fallback: false
Compile errors: 0
Draw calls: 42
```

### **23.2. Material inspector**

```text
Material: Face_Mat
Role: face
Original: MToonMaterial
Current: MToonEnhanced
Transparent: false
Map: yes
Normal map: no
Effects:
  - rim
  - face_shadow
```

### **23.3. Debug actions**

| **Action** | **Mục đích** |
|---|---|
| Reapply shader | Apply lại preset |
| Restore original | Trở về VRM original |
| Toggle outline | Test outline |
| Toggle rim | Test rim |
| Force fallback | Test basic fallback |
| Dump material list | Debug material classification |
| Show outline only | Debug hull outline |
| Export shader status | Attach diagnostic |

### **23.4. Telemetry metrics**

```text
shader.material_count
shader.enhanced_material_count
shader.compile_error_count
shader.fallback_count
shader.quality_level
shader.outline_draw_calls
```

---

## **24. Error Handling**

### **24.1. Error cases**

| **Error** | **Recovery** |
|---|---|
| Shader compile fail | Fallback affected material |
| Material unsupported | Keep original material |
| Outline clone fail | Disable outline |
| WebGL context lost | Wait restore, reapply shader |
| FPS low | Auto degrade quality |
| Missing texture | Use color-only material |
| NaN uniform | Reset uniform default |
| Material dispose error | Log warning, continue |

### **24.2. Safe wrapper**

```typescript
function safeApplyShader(
  material: THREE.Material,
  apply: () => THREE.Material,
): THREE.Material {
  try {
    return apply();
  } catch (err) {
    reportShaderError(err);
    return createBasicFallbackMaterial(material);
  }
}
```

### **24.3. Compile error report**

```typescript
renderer.debug.checkShaderErrors?.();

shaderIpc.reportCompileError({
  material_name: material.name,
  shader_stage: "program",
  message: sanitizeShaderError(errorMessage),
  occurred_at: new Date().toISOString(),
});
```

---

## **25. Performance Considerations**

### **25.1. Performance targets**

| **Operation** | **Target** |
|---|---|
| Apply shader preset | < 100ms for typical VRM |
| Rebuild outline | < 100ms |
| Per-frame uniform update | < 0.1ms |
| Material scan | < 20ms |
| Shader status snapshot | < 5ms |

### **25.2. GPU budget**

```text
Desktop overlay target:
- 60 FPS on normal laptop GPU.
- 30 FPS acceptable on low-power mode.
- Avoid postprocess by default.
```

### **25.3. Cost by feature**

| **Feature** | **Cost** | **Note** |
|---|---|---|
| Rim uniform | Low | Cheap in shader |
| Cel shading | Medium | Custom material |
| Inverted hull outline | Medium/High | More draw calls |
| Postprocess outline | High | Avoid MVP default |
| Hair highlight | Medium | Only high quality |
| Face shadow | Low/Medium | Simple gradient cheap |

### **25.4. Optimization rules**

```text
- Rebuild material only when settings/model changes.
- Update uniforms per frame only if needed.
- Disable outline for tiny accessory meshes.
- Avoid full-screen postprocessing.
- Dispose unused materials.
- Share outline material when possible.
- Use quality degradation on FPS drop.
```

---

## **26. File Structure**

```text
chiro-pet/
├── src/
│   ├── renderer/
│   │   └── shader/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── ShaderManager.ts
│   │       ├── ShaderQualityController.ts
│   │       ├── MaterialScanner.ts
│   │       ├── MaterialClassifier.ts
│   │       ├── MaterialAdapter.ts
│   │       ├── adapters/
│   │       │   ├── MToonEnhancedAdapter.ts
│   │       │   ├── NprCelAdapter.ts
│   │       │   ├── SoftAnimeAdapter.ts
│   │       │   └── BasicFallbackAdapter.ts
│   │       ├── effects/
│   │       │   ├── OutlineManager.ts
│   │       │   ├── RimLightUniforms.ts
│   │       │   ├── FaceShadow.ts
│   │       │   ├── EyeHighlight.ts
│   │       │   └── HairHighlight.ts
│   │       ├── glsl/
│   │       │   ├── nprCel.vert
│   │       │   ├── nprCel.frag
│   │       │   ├── outline.vert
│   │       │   └── outline.frag
│   │       ├── debug/
│   │       │   ├── ShaderDebugPanel.tsx
│   │       │   ├── MaterialInspector.tsx
│   │       │   └── shaderDebugStore.ts
│   │       └── utils/
│   │           ├── disposeMaterial.ts
│   │           ├── copyMaterialFlags.ts
│   │           └── sanitizeShaderError.ts
│   │
│   └── shared/
│       └── types/
│           └── shader.ts
│
├── src-tauri/
│   └── src/
│       ├── core/
│       │   └── shader/
│       │       ├── mod.rs
│       │       ├── types.rs
│       │       ├── manager.rs
│       │       ├── settings.rs
│       │       ├── events.rs
│       │       └── errors.rs
│       │
│       └── ipc/
│           └── shader_commands.rs
│
└── docs/
    └── shader-system.md
```

---

## **27. Implementation Checklist**

### **27.1. P0 Core**

- [ ] Define `ShaderSettings`.
- [ ] Define `ShaderRuntimeStatus`.
- [ ] Implement `ShaderManager`.
- [ ] Implement material scanner.
- [ ] Implement material classifier.
- [ ] Preserve original material refs.
- [ ] Restore original materials on disable.
- [ ] Dispose enhanced materials on unbind.

### **27.2. P0 MToon / Fallback**

- [ ] Keep `vrm_original` mode.
- [ ] Implement `mtoon_enhanced` adapter.
- [ ] Implement `basic_fallback` adapter.
- [ ] Fallback per material on error.
- [ ] Report compile/runtime errors.

### **27.3. P0 Outline & Rim**

- [ ] Implement inverted hull outline.
- [ ] Implement outline settings.
- [ ] Implement rim uniforms where supported.
- [ ] Disable outline in low quality.
- [ ] Debug outline on/off.

### **27.4. P1 NPR Cel**

- [ ] Implement `npr_cel` shader material.
- [ ] Preserve texture map.
- [ ] Preserve alpha/morph/skinning flags.
- [ ] Implement cel shade uniforms.
- [ ] Implement soft anime preset.

### **27.5. P1 Eye/Hair/Face**

- [ ] Detect eye materials.
- [ ] Add eye highlight option.
- [ ] Detect hair materials.
- [ ] Add simple hair highlight.
- [ ] Detect face material.
- [ ] Add simple face shadow.

### **27.6. P1 Settings & IPC**

- [ ] Add visual/shader settings.
- [ ] `shader_get_settings`.
- [ ] `shader_update_settings`.
- [ ] `shader_get_status`.
- [ ] `shader_report_compile_error`.
- [ ] Events `shader_status_updated`, `shader_fallback_activated`.

### **27.7. P1 Debug**

- [ ] Shader debug panel.
- [ ] Material inspector.
- [ ] Dump material list.
- [ ] Force fallback test.
- [ ] Telemetry shader metrics.

### **27.8. P2 Polish**

- [ ] SDF face shadow support.
- [ ] Better anime hair anisotropic shader.
- [ ] Postprocess outline option.
- [ ] Per-character shader preset.
- [ ] Background contrast auto-adjust.
- [ ] Custom LUT/color grading.
- [ ] Shader preset import/export.

---

## **28. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Shader** | Chương trình GPU quyết định cách render material. |
| **MToon** | Toon shader phổ biến trong VRM. |
| **NPR** | Non-photorealistic rendering, render không theo hướng chân thực. |
| **Cel-shading** | Kỹ thuật tạo band sáng/tối kiểu anime/cartoon. |
| **Outline** | Viền đen/màu quanh character để nổi bật. |
| **Inverted Hull** | Kỹ thuật clone mesh, render mặt sau phóng ra để tạo outline. |
| **Rim Light** | Ánh sáng viền theo góc nhìn. |
| **Face Shadow** | Shadow riêng cho mặt anime. |
| **SDF** | Signed distance field, thường dùng cho face shadow anime nâng cao. |
| **Anisotropic Highlight** | Highlight có hướng, phù hợp tóc/sợi. |
| **Fallback Material** | Material đơn giản dùng khi shader nâng cao lỗi. |
| **Quality Preset** | Mức chất lượng shader: low, medium, high, ultra. |

---

# **Phụ lục A: Flow apply shader preset**

```text
User changes shader mode to "mtoon_enhanced"
  ↓
Settings updated
  ↓
ShaderManager.applySettings
  ↓
Scan current VRM materials
  ↓
For each material:
  - classify role
  - choose adapter
  - clone or keep original
  - preserve maps/alpha/skinning/morph
  - apply rim/cel/face/eye/hair settings
  ↓
Rebuild outline if enabled
  ↓
Update runtime status
  ↓
Emit shader_status_updated
  ↓
Telemetry records shader settings changed
```

---

# **Phụ lục B: Flow fallback khi shader lỗi**

```text
ShaderManager applies NPR cel material
  ↓
Shader compile fails for material "Face_Mat"
  ↓
Catch error
  ↓
Report shader_compile_error
  ↓
If fallback_on_error = true:
    create basic fallback material
    preserve texture/alpha/skinning
    assign fallback to mesh
  ↓
Mark fallback_active = true
  ↓
Emit shader_fallback_activated
  ↓
Renderer continues, no blank screen
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. ShaderSettings mẫu**

```json
{
  "enabled": true,
  "mode": "mtoon_enhanced",
  "quality": "high",
  "outline": {
    "enabled": true,
    "method": "inverted_hull",
    "thickness": 0.008,
    "color": "#1a1a1a",
    "opacity": 0.85,
    "depth_offset": 0.001,
    "scale_with_distance": true
  },
  "rim": {
    "enabled": true,
    "color": "#ffffff",
    "intensity": 0.35,
    "power": 2.0,
    "width": 0.45,
    "use_light_direction": false
  },
  "cel": {
    "enabled": true,
    "shade_steps": 3,
    "shadow_strength": 0.45,
    "shadow_softness": 0.2,
    "highlight_strength": 0.15,
    "ambient_lift": 0.25
  },
  "face_shadow": {
    "enabled": true,
    "mode": "simple_gradient",
    "strength": 0.25,
    "softness": 0.4,
    "face_material_hint": ["face", "skin", "head"]
  },
  "eye": {
    "enabled": true,
    "highlight_enabled": true,
    "highlight_intensity": 0.25,
    "highlight_size": 0.08,
    "wetness": 0.15,
    "eye_material_hint": ["eye", "iris"]
  },
  "hair": {
    "enabled": true,
    "anisotropic_highlight": true,
    "highlight_intensity": 0.25,
    "highlight_width": 0.18,
    "hair_material_hint": ["hair"]
  },
  "auto_quality_enabled": true,
  "fallback_on_error": true
}
```

## **C.2. ShaderRuntimeStatus mẫu**

```json
{
  "enabled": true,
  "mode": "mtoon_enhanced",
  "quality": "high",
  "active_effects": ["outline", "rim", "face_shadow", "eye_highlight"],
  "fallback_active": false,
  "last_error": null,
  "material_count": 12,
  "enhanced_material_count": 8,
  "compile_errors": [],
  "updated_at": "2026-05-27T04:00:00Z"
}
```

## **C.3. ShaderCompileError mẫu**

```json
{
  "material_name": "Face_Mat",
  "shader_stage": "program",
  "message": "Fragment shader compile failed: [REDACTED]",
  "occurred_at": "2026-05-27T04:00:00Z"
}
```

## **C.4. ShaderQualityState mẫu**

```json
{
  "requested_quality": "high",
  "effective_quality": "medium",
  "auto_degraded": true,
  "reason": "fps_below_45_for_10s",
  "fps_average": 39.2,
  "updated_at": "2026-05-27T04:00:00Z"
}
```

## **C.5. MaterialInfo mẫu**

```json
{
  "id": "mat_001",
  "name": "Face_Mat",
  "role": "face",
  "originalType": "MToonMaterial",
  "transparent": false,
  "alphaTest": 0.0,
  "hasMap": true,
  "hasNormalMap": false,
  "hasEmissiveMap": false,
  "meshName": "Face"
}
```

---
