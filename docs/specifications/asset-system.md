# **Chiro-Pet Asset System**

> Tài liệu thiết kế chính thức cho **Asset System** của **Chiro-Pet**.  
> Hệ thống này quản lý toàn bộ tài sản runtime của app: **VRM models**, **animations**, **expressions**, **thumbnails**, **bundled assets**, **user-imported assets**, **validation**, **hot-reload** và **cleanup**.
>
> **Nguyên tắc lõi:** Asset System là **single source of truth** cho mọi model, animation và manifest. Không subsystem nào được tự đọc file asset tùy ý. Mọi asset phải đi qua **import pipeline**, **validator**, **registry**, **storage manager** và **versioning policy** trước khi được dùng bởi Character System hoặc Animation Runtime.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Asset Types](#3-asset-types)
4. [Asset Architecture](#4-asset-architecture)
5. [Storage Layout](#5-storage-layout)
6. [Data Model](#6-data-model)
7. [Asset Registry](#7-asset-registry)
8. [VRM Model Import Flow](#8-vrm-model-import-flow)
9. [Animation Import Flow](#9-animation-import-flow)
10. [Asset Validation](#10-asset-validation)
11. [VRM Validation](#11-vrm-validation)
12. [Animation Validation](#12-animation-validation)
13. [Thumbnail Generation](#13-thumbnail-generation)
14. [Hot-Reload & Runtime Swap](#14-hot-reload--runtime-swap)
15. [Asset Versioning](#15-asset-versioning)
16. [Bundled Assets](#16-bundled-assets)
17. [User Imported Assets](#17-user-imported-assets)
18. [Asset Dependency Graph](#18-asset-dependency-graph)
19. [Cleanup & Garbage Collection](#19-cleanup--garbage-collection)
20. [Security & Safety](#20-security--safety)
21. [Backend: AssetManager](#21-backend-assetmanager)
22. [Frontend Asset UI](#22-frontend-asset-ui)
23. [IPC Contract](#23-ipc-contract)
24. [Integration Matrix](#24-integration-matrix)
25. [Logging & Audit](#25-logging--audit)
26. [Error Handling](#26-error-handling)
27. [Performance Considerations](#27-performance-considerations)
28. [File Structure](#28-file-structure)
29. [Implementation Checklist](#29-implementation-checklist)
30. [Glossary](#30-glossary)
31. [Phụ lục A: Flow import VRM](#phụ-lục-a-flow-import-vrm)
32. [Phụ lục B: Flow hot-swap character model](#phụ-lục-b-flow-hot-swap-character-model)
33. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Asset System của **Chiro-Pet** phải:

- Quản lý **VRM models** cho character.
- Quản lý **animation assets** gồm:
  - `.vrma`
  - `.glb`
  - `.gltf`
  - `.bvh` nếu có retarget profile
- Quản lý **thumbnail** cho model và animation.
- Cung cấp **asset registry** làm source of truth.
- Hỗ trợ **import asset từ file local**.
- Validate asset trước khi copy vào app storage.
- Hỗ trợ **hot-reload** model và animation không cần restart app.
- Hỗ trợ **asset versioning** và rollback.
- Hỗ trợ **default bundled assets** để app chạy ngay sau install.
- Cleanup asset không dùng.
- Không để file asset lỗi làm crash renderer hoặc app.
- Tích hợp với:
  - Character System
  - Animation Runtime
  - Overlay Renderer
  - Settings UI
  - Privacy System

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Asset schema.
- Storage layout trên disk.
- Import pipeline.
- Validation pipeline.
- Registry.
- Thumbnail generation.
- Runtime loading.
- Hot-reload.
- Versioning.
- Cleanup.
- IPC contract.
- UI integration.

Tài liệu này **không** mô tả chi tiết:

- Cách render VRM trong Three.js.
- Cách retarget BVH sang VRM.
- Cách AnimationMixer blend animation.
- Cách character personality/state hoạt động.

Các phần đó thuộc subsystem riêng. Asset System chỉ quản lý **file, metadata, validation và registry**.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Registry-first** | Mọi asset phải có record trong registry trước khi subsystem dùng. |
| **2** | **No raw file loading** | Renderer không load file path do user đưa trực tiếp. Phải qua AssetManager. |
| **3** | **Validate before store** | File import phải validate trước khi copy vào storage chính. |
| **4** | **Stable asset ID** | Mỗi asset có ID ổn định, không phụ thuộc filename gốc. |
| **5** | **Content-address optional** | Có thể dùng hash để detect duplicate. |
| **6** | **Hot-swap safe** | Swap model/animation không được làm crash renderer. |
| **7** | **Bundled assets immutable** | Asset đi kèm app không bị sửa trực tiếp. |
| **8** | **User assets isolated** | Asset user import nằm riêng trong user data folder. |
| **9** | **Dependency-aware cleanup** | Không xóa asset đang được character/profile dùng. |
| **10** | **Fail gracefully** | Asset lỗi fallback về default model/animation. |

### **2.2. Anti-pattern cần tránh**

- ❌ Cho Character System lưu raw file path tự do.
- ❌ Load model trực tiếp từ Downloads/Desktop.
- ❌ Không validate file size.
- ❌ Không detect duplicate asset.
- ❌ Xóa asset không kiểm tra dependency.
- ❌ Cho animation không tương thích skeleton chạy trực tiếp.
- ❌ Dùng filename làm asset ID.
- ❌ Ghi đè asset bundled.
- ❌ Không có fallback model.
- ❌ Không version schema registry.

---

## **3. Asset Types**

### **3.1. Danh sách asset type**

| **Asset Type** | **Extension** | **Mục đích** |
|---|---|---|
| **VRM Model** | `.vrm` | Model nhân vật chính |
| **VRM Animation** | `.vrma` | Animation native cho VRM |
| **glTF Animation** | `.glb`, `.gltf` | Animation hoặc model phụ |
| **BVH Motion** | `.bvh` | Motion capture, cần retarget |
| **Texture** | `.png`, `.jpg`, `.webp` | Texture phụ nếu cần |
| **Thumbnail** | `.png`, `.webp` | Preview asset |
| **Manifest** | `.json` | Metadata asset |
| **Retarget Profile** | `.json` | Mapping BVH/glTF sang VRM |

### **3.2. Asset category**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AssetCategory {
    Model,
    Animation,
    Texture,
    Thumbnail,
    Manifest,
    RetargetProfile,
}
```

### **3.3. Asset source**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssetSource {
    Bundled,
    UserImported,
    Generated,
    Cache,
}
```

### **3.4. Supported model policy**

Ưu tiên:

```text
1. VRM 1.0
2. VRM 0.x nếu loader hỗ trợ
3. glTF humanoid model chỉ dùng nếu có adapter riêng
```

MVP nên **chỉ support VRM** cho character model để giảm độ phức tạp.

---

## **4. Asset Architecture**

### **4.1. Kiến trúc tổng thể**

```text
┌──────────────────────────────────────────────────────────────┐
│                       User File Picker                        │
│        .vrm / .vrma / .glb / .gltf / .bvh / .json             │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│                       Import Pipeline                         │
│  - copy to temp                                               │
│  - detect type                                                │
│  - compute hash                                               │
│  - validate file                                              │
│  - extract metadata                                           │
│  - generate thumbnail                                         │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│                       Asset Storage                           │
│  - user assets folder                                         │
│  - immutable copied file                                      │
│  - thumbnail folder                                           │
│  - manifest record                                            │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│                       Asset Registry                          │
│  - SQLite asset records                                       │
│  - asset_id lookup                                            │
│  - dependency graph                                           │
│  - version records                                            │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│                    Runtime Asset Resolver                     │
│  - resolve asset_id → safe local path                         │
│  - fallback if missing                                        │
│  - cache runtime metadata                                     │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────┐
│               Character / Animation / Renderer                │
│  - load VRM                                                   │
│  - load animation clip                                        │
│  - swap safely                                                │
└──────────────────────────────────────────────────────────────┘
```

### **4.2. Module boundaries**

| **Module** | **Trách nhiệm** |
|---|---|
| **AssetManager** | Public API, orchestration |
| **AssetImporter** | Import file vào storage |
| **AssetValidator** | Validate type, size, metadata |
| **AssetRegistry** | SQLite registry |
| **AssetStorage** | File copy, path resolve |
| **ThumbnailGenerator** | Tạo preview |
| **AssetResolver** | Resolve asset_id thành path an toàn |
| **AssetWatcher** | Hot-reload khi asset thay đổi |
| **AssetGC** | Cleanup unused assets |

---

## **5. Storage Layout**

### **5.1. User data layout**

```text
user_data/
├── assets/
│   ├── models/
│   │   ├── vrm/
│   │   │   └── model_<asset_id>/
│   │   │       ├── source.vrm
│   │   │       ├── manifest.json
│   │   │       ├── thumbnail.webp
│   │   │       └── versions/
│   │   │           ├── v1.vrm
│   │   │           └── v2.vrm
│   │
│   ├── animations/
│   │   ├── vrma/
│   │   │   └── anim_<asset_id>/
│   │   │       ├── source.vrma
│   │   │       ├── manifest.json
│   │   │       └── thumbnail.webp
│   │   ├── gltf/
│   │   └── bvh/
│   │
│   ├── textures/
│   ├── thumbnails/
│   ├── retarget_profiles/
│   └── cache/
│       ├── extracted_metadata/
│       └── render_previews/
│
├── db/
│   └── chiro_pet.sqlite
│
└── logs/
```

### **5.2. Bundled assets layout**

```text
app_resources/
├── bundled_assets/
│   ├── models/
│   │   └── default_mira.vrm
│   ├── animations/
│   │   ├── idle.vrma
│   │   ├── talking_gentle.vrma
│   │   ├── wave.vrma
│   │   ├── happy.vrma
│   │   ├── shy.vrma
│   │   └── thinking.vrma
│   ├── thumbnails/
│   └── bundled_manifest.json
```

### **5.3. Path rule**

```text
- User-imported asset path phải nằm dưới user_data/assets.
- Bundled asset path phải nằm dưới app_resources/bundled_assets.
- Không cho resolver trả path ngoài 2 root này.
- Không lưu path user gốc sau import, chỉ lưu original_filename.
```

### **5.4. Safe path resolver**

```rust
pub fn ensure_path_inside_root(path: &Path, root: &Path) -> Result<()> {
    let canonical_path = path.canonicalize()?;
    let canonical_root = root.canonicalize()?;

    if !canonical_path.starts_with(canonical_root) {
        return Err(anyhow!("asset path escapes root"));
    }

    Ok(())
}
```

---

## **6. Data Model**

### **6.1. AssetId**

```rust
pub type AssetId = String;
```

ID format:

```text
model_<uuid>
anim_<uuid>
thumb_<uuid>
retarget_<uuid>
```

Ví dụ:

```text
model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234
anim_018fb7f6_2df8_7f36_b1a2_94b05fdc5678
```

### **6.2. AssetRecord**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetRecord {
    pub asset_id: AssetId,
    pub schema_version: u32,

    pub name: String,
    pub category: AssetCategory,
    pub kind: AssetKind,
    pub source: AssetSource,

    pub file_path: String,
    pub thumbnail_path: Option<string>,
    pub manifest_path: Option<string>,

    pub original_filename: Option<string>,
    pub content_hash_sha256: String,
    pub file_size_bytes: u64,

    pub metadata: AssetMetadata,
    pub validation: AssetValidationStatus,

    pub created_at: DateTime<utc>,
    pub updated_at: DateTime<utc>,
    pub last_used_at: Option<datetime<utc>>,
    pub is_deleted: bool,
}
```

### **6.3. AssetKind**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    VrmModel,
    VrmaAnimation,
    GltfAnimation,
    BvhMotion,
    Texture,
    Thumbnail,
    RetargetProfile,
}
```

### **6.4. AssetMetadata**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AssetMetadata {
    VrmModel(VrmModelMetadata),
    Animation(AnimationMetadata),
    Texture(TextureMetadata),
    RetargetProfile(RetargetProfileMetadata),
    Generic(GenericAssetMetadata),
}
```

### **6.5. VRM metadata**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VrmModelMetadata {
    pub vrm_version: Option<string>,      // "1.0", "0.x", unknown
    pub humanoid_bones_detected: Vec<string>,
    pub expression_names: Vec<string>,
    pub material_count: u32,
    pub mesh_count: u32,
    pub texture_count: u32,
    pub triangle_count_estimate: Option<u32>,
    pub has_spring_bones: bool,
    pub has_look_at: bool,
    pub license_name: Option<string>,
    pub author: Option<string>,
}
```

### **6.6. Animation metadata**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationMetadata {
    pub format: AnimationFormat,
    pub duration_seconds: f32,
    pub track_count: u32,
    pub target_bones: Vec<string>,
    pub root_motion: bool,
    pub loop_recommended: bool,
    pub compatibility: AnimationCompatibility,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnimationFormat {
    Vrma,
    Gltf,
    Glb,
    Bvh,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationCompatibility {
    pub compatible_with_vrm: bool,
    pub requires_retargeting: bool,
    pub retarget_profile_id: Option<string>,
    pub warnings: Vec<string>,
}
```

### **6.7. Validation status**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetValidationStatus {
    pub status: ValidationStatus,
    pub validated_at: DateTime<utc>,
    pub errors: Vec<assetvalidationissue>,
    pub warnings: Vec<assetvalidationissue>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ValidationStatus {
    Pending,
    Valid,
    ValidWithWarnings,
    Invalid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetValidationIssue {
    pub code: String,
    pub message: String,
    pub severity: IssueSeverity,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueSeverity {
    Info,
    Warning,
    Error,
}
```

---

## **7. Asset Registry**

### **7.1. Registry responsibility**

Asset Registry lưu:

```text
- asset metadata
- safe storage path
- validation status
- usage references
- version history
- deletion state
```

### **7.2. SQLite schema**

```sql
CREATE TABLE asset (
    asset_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL DEFAULT 1,

    name TEXT NOT NULL,
    category TEXT NOT NULL,
    kind TEXT NOT NULL,
    source TEXT NOT NULL,

    file_path TEXT NOT NULL,
    thumbnail_path TEXT,
    manifest_path TEXT,

    original_filename TEXT,
    content_hash_sha256 TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,

    metadata_json TEXT NOT NULL,
    validation_json TEXT NOT NULL,

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    last_used_at DATETIME,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_asset_category ON asset(category);
CREATE INDEX idx_asset_kind ON asset(kind);
CREATE INDEX idx_asset_hash ON asset(content_hash_sha256);
CREATE INDEX idx_asset_deleted ON asset(is_deleted);
```

### **7.3. Asset dependency table**

```sql
CREATE TABLE asset_dependency (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL, -- character|animation_set|profile|system
    owner_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    dependency_type TEXT NOT NULL, -- model|animation|thumbnail|retarget_profile
    created_at DATETIME NOT NULL,

    FOREIGN KEY (asset_id) REFERENCES asset(asset_id)
);

CREATE INDEX idx_asset_dependency_asset ON asset_dependency(asset_id);
CREATE INDEX idx_asset_dependency_owner ON asset_dependency(owner_type, owner_id);
```

### **7.4. Asset version table**

```sql
CREATE TABLE asset_version (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    content_hash_sha256 TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    note TEXT,

    FOREIGN KEY (asset_id) REFERENCES asset(asset_id)
);

CREATE INDEX idx_asset_version_asset ON asset_version(asset_id);
```

### **7.5. Registry API**

```rust
pub struct AssetRegistry {
    db: Arc<sqlitepool>,
}

impl AssetRegistry {
    pub async fn insert(&self, record: AssetRecord) -> Result<()>;
    pub async fn update(&self, record: AssetRecord) -> Result<()>;
    pub async fn get(&self, asset_id: &str) -> Result<option<assetrecord>>;
    pub async fn list_by_category(&self, category: AssetCategory) -> Result<vec<assetrecord>>;
    pub async fn find_by_hash(&self, hash: &str) -> Result<option<assetrecord>>;
    pub async fn mark_deleted(&self, asset_id: &str) -> Result<()>;
    pub async fn touch_last_used(&self, asset_id: &str) -> Result<()>;

    pub async fn add_dependency(
        &self,
        owner_type: &str,
        owner_id: &str,
        asset_id: &str,
        dependency_type: &str,
    ) -> Result<()>;

    pub async fn list_dependencies(&self, asset_id: &str) -> Result<vec<assetdependency>>;
    pub async fn has_dependencies(&self, asset_id: &str) -> Result<bool>;
}
```

---

## **8. VRM Model Import Flow**

### **8.1. Flow tổng thể**

```text
User selects .vrm file
       ↓
AssetManager.import_model(path)
       ↓
Copy to temp import folder
       ↓
Compute SHA-256
       ↓
Duplicate check by hash
       ↓
Detect file type
       ↓
Validate size + extension + parse metadata
       ↓
Extract VRM metadata
       ↓
Generate thumbnail
       ↓
Create asset_id
       ↓
Copy into user_data/assets/models/vrm/model_<asset_id>/
       ↓
Write manifest.json
       ↓
Insert AssetRecord into registry
       ↓
Return ImportResult
```

### **8.2. Import request**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportAssetRequest {
    pub source_path: String,
    pub display_name: Option<string>,
    pub category_hint: Option<assetcategory>,
    pub replace_asset_id: Option<string>,
}
```

### **8.3. Import result**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportAssetResult {
    pub asset_id: String,
    pub status: ImportStatus,
    pub record: AssetRecord,
    pub duplicate_of: Option<string>,
    pub warnings: Vec<assetvalidationissue>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportStatus {
    Imported,
    AlreadyExists,
    Replaced,
    ImportedWithWarnings,
}
```

### **8.4. Import pseudocode**

```rust
pub async fn import_vrm_model(
    &self,
    req: ImportAssetRequest,
) -> Result<importassetresult> {
    let source = PathBuf::from(&req.source_path);

    // 1. Basic file checks
    self.validator.validate_path_readable(&source)?;
    self.validator.validate_extension(&source, &["vrm"])?;
    self.validator.validate_file_size(&source, MAX_VRM_SIZE_BYTES)?;

    // 2. Copy to temp
    let temp_path = self.storage.copy_to_import_temp(&source).await?;

    // 3. Hash
    let hash = compute_sha256(&temp_path).await?;

    // 4. Duplicate check
    if let Some(existing) = self.registry.find_by_hash(&hash).await? {
        return Ok(ImportAssetResult {
            asset_id: existing.asset_id.clone(),
            status: ImportStatus::AlreadyExists,
            record: existing,
            duplicate_of: None,
            warnings: vec![],
        });
    }

    // 5. Extract metadata
    let metadata = self.metadata_extractor.extract_vrm(&temp_path).await?;

    // 6. Validate VRM
    let validation = self.validator.validate_vrm(&temp_path, &metadata).await?;

    if validation.status == ValidationStatus::Invalid {
        return Err(AssetError::ValidationFailed(validation.errors));
    }

    // 7. Create asset id and folder
    let asset_id = new_asset_id("model");
    let asset_dir = self.storage.create_model_dir(&asset_id).await?;
    let final_path = asset_dir.join("source.vrm");

    // 8. Copy final
    self.storage.copy_file(&temp_path, &final_path).await?;

    // 9. Generate thumbnail
    let thumbnail_path = self.thumbnail.generate_for_vrm(&asset_id, &final_path).await.ok();

    // 10. Manifest
    let manifest_path = asset_dir.join("manifest.json");

    // 11. Build record
    let record = AssetRecord {
        asset_id: asset_id.clone(),
        schema_version: 1,
        name: req.display_name.unwrap_or_else(|| fallback_name_from_path(&source)),
        category: AssetCategory::Model,
        kind: AssetKind::VrmModel,
        source: AssetSource::UserImported,
        file_path: final_path.to_string_lossy().to_string(),
        thumbnail_path: thumbnail_path.map(|p| p.to_string_lossy().to_string()),
        manifest_path: Some(manifest_path.to_string_lossy().to_string()),
        original_filename: source.file_name().map(|s| s.to_string_lossy().to_string()),
        content_hash_sha256: hash,
        file_size_bytes: file_size(&final_path).await?,
        metadata: AssetMetadata::VrmModel(metadata),
        validation,
        created_at: Utc::now(),
        updated_at: Utc::now(),
        last_used_at: None,
        is_deleted: false,
    };

    // 12. Write manifest + registry
    self.storage.write_manifest(&manifest_path, &record).await?;
    self.registry.insert(record.clone()).await?;

    Ok(ImportAssetResult {
        asset_id,
        status: if record.validation.status == ValidationStatus::ValidWithWarnings {
            ImportStatus::ImportedWithWarnings
        } else {
            ImportStatus::Imported
        },
        record,
        duplicate_of: None,
        warnings: vec![],
    })
}
```

---

## **9. Animation Import Flow**

### **9.1. Supported animation import**

| **Format** | **MVP support** | **Ghi chú** |
|---|---|---|
| **VRMA** | Có | Ưu tiên |
| **GLB/GLTF** | Có điều kiện | Cần humanoid-compatible track |
| **BVH** | P1/P2 | Cần retarget profile |
| **FBX** | Không MVP | Tránh parser phức tạp |

### **9.2. Flow tổng thể**

```text
User selects animation file
       ↓
Detect format
       ↓
Validate extension and size
       ↓
Extract duration, tracks, bones
       ↓
Compatibility check
       ↓
If BVH:
  - require retarget profile
  - mark requires_retargeting = true
       ↓
Copy into animation storage
       ↓
Generate thumbnail/preview icon
       ↓
Insert registry record
       ↓
Return ImportAssetResult
```

### **9.3. Animation import request**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportAnimationRequest {
    pub source_path: String,
    pub display_name: Option<string>,
    pub animation_role: Option<animationrole>,
    pub loop_recommended: Option<bool>,
    pub retarget_profile_id: Option<string>,
}
```

### **9.4. AnimationRole**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AnimationRole {
    Idle,
    Talking,
    Greeting,
    Reaction,
    Thinking,
    Sleeping,
    Dragging,
    Custom,
}
```

### **9.5. Animation manifest**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationAssetManifest {
    pub asset_id: String,
    pub name: String,
    pub role: AnimationRole,
    pub format: AnimationFormat,
    pub duration_seconds: f32,
    pub loop_recommended: bool,
    pub priority_hint: u8,
    pub compatible_model_kind: CompatibleModelKind,
    pub tags: Vec<string>,
}
```

### **9.6. CompatibleModelKind**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CompatibleModelKind {
    AnyVrm,
    Vrm10Only,
    Vrm0xOnly,
    SpecificSkeleton,
}
```

---

## **10. Asset Validation**

### **10.1. Validation stages**

```text
Stage 1: Path validation
  - file exists
  - readable
  - not directory
  - safe extension

Stage 2: Size validation
  - max model size
  - max animation size
  - max texture size

Stage 3: Format validation
  - magic/header where possible
  - parser can load metadata
  - JSON chunk valid for glTF/VRM

Stage 4: Semantic validation
  - humanoid bones for VRM
  - animation tracks valid
  - duration sane
  - material/texture count sane

Stage 5: Security validation
  - no path traversal in embedded references
  - external URI blocked or copied safely
  - no remote URL dependencies
```

### **10.2. Default size limits**

```rust
pub const MAX_VRM_SIZE_BYTES: u64 = 150 * 1024 * 1024;       // 150MB
pub const MAX_ANIMATION_SIZE_BYTES: u64 = 50 * 1024 * 1024;  // 50MB
pub const MAX_TEXTURE_SIZE_BYTES: u64 = 32 * 1024 * 1024;    // 32MB
pub const MAX_MANIFEST_SIZE_BYTES: u64 = 2 * 1024 * 1024;    // 2MB
```

### **10.3. Validation result policy**

| **Validation status** | **Cho import?** | **Hành vi** |
|---|---|---|
| **Valid** | Có | Import bình thường |
| **ValidWithWarnings** | Có | Import nhưng show warning |
| **Invalid** | Không | Reject |
| **Pending** | Không runtime | Chỉ tồn tại trong import temp |

### **10.4. Validator trait**

```rust
#[async_trait::async_trait]
pub trait AssetValidator: Send + Sync {
    async fn validate_import(
        &self,
        path: &Path,
        expected_kind: Option<assetkind>,
    ) -> Result<assetvalidationstatus>;

    async fn validate_vrm(
        &self,
        path: &Path,
        metadata: &VrmModelMetadata,
    ) -> Result<assetvalidationstatus>;

    async fn validate_animation(
        &self,
        path: &Path,
        metadata: &AnimationMetadata,
    ) -> Result<assetvalidationstatus>;
}
```

---

## **11. VRM Validation**

### **11.1. Required checks**

| **Check** | **Severity** | **Rule** |
|---|---|---|
| Extension `.vrm` | Error | Required |
| File size <= 150MB | Error | Required |
| Can parse as GLB | Error | Required |
| VRM extension exists | Error | Required |
| Humanoid bones exist | Error | Required |
| At least head + hips | Error | Required |
| Expression list extractable | Warning | Recommended |
| Spring bones valid | Warning | Optional |
| Texture count sane | Warning | > 50 warn |
| Triangle count sane | Warning | > 200k warn |
| External URI | Error | Not allowed |

### **11.2. Required humanoid bones**

MVP minimum:

```text
- hips
- spine
- chest or upperChest
- neck
- head
- leftUpperArm
- leftLowerArm
- leftHand
- rightUpperArm
- rightLowerArm
- rightHand
- leftUpperLeg
- leftLowerLeg
- leftFoot
- rightUpperLeg
- rightLowerLeg
- rightFoot
```

### **11.3. VRM validation pseudocode**

```rust
pub async fn validate_vrm(
    &self,
    path: &Path,
    metadata: &VrmModelMetadata,
) -> Result<assetvalidationstatus> {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    if path.extension().and_then(|e| e.to_str()) != Some("vrm") {
        errors.push(issue("invalid_extension", "File must be .vrm"));
    }

    let size = tokio::fs::metadata(path).await?.len();
    if size > MAX_VRM_SIZE_BYTES {
        errors.push(issue("file_too_large", "VRM file exceeds 150MB"));
    }

    if metadata.vrm_version.is_none() {
        errors.push(issue("missing_vrm_extension", "VRM extension not found"));
    }

    let required = required_humanoid_bones();
    for bone in required {
        if !metadata.humanoid_bones_detected.contains(&bone.to_string()) {
            errors.push(issue(
                "missing_humanoid_bone",
                &format!("Missing required humanoid bone: {}", bone),
            ));
        }
    }

    if metadata.texture_count > 50 {
        warnings.push(issue("many_textures", "Model has many textures"));
    }

    if metadata.triangle_count_estimate.unwrap_or(0) > 200_000 {
        warnings.push(issue("high_polycount", "Model may be heavy for overlay runtime"));
    }

    let status = if !errors.is_empty() {
        ValidationStatus::Invalid
    } else if !warnings.is_empty() {
        ValidationStatus::ValidWithWarnings
    } else {
        ValidationStatus::Valid
    };

    Ok(AssetValidationStatus {
        status,
        validated_at: Utc::now(),
        errors,
        warnings,
    })
}
```

---

## **12. Animation Validation**

### **12.1. VRMA validation**

| **Check** | **Severity** |
|---|---|
| Extension `.vrma` | Error |
| Can parse as animation asset | Error |
| Duration > 0 | Error |
| Duration <= 120s | Warning |
| Track count > 0 | Error |
| Target bones recognized | Warning |
| Compatible with VRM | Error for MVP |

### **12.2. GLTF/GLB animation validation**

```text
- Must contain at least one animation.
- Must not require external remote resources.
- If external buffers/images exist, import must copy them or reject.
- Must map tracks to known humanoid bones or require mapping.
```

### **12.3. BVH validation**

BVH is **not direct runtime animation**.

```text
BVH import allowed only if:
- retarget_profile_id exists
- parser can read hierarchy
- frame count reasonable
- duration reasonable
```

Default MVP policy:

```text
BVH = store as raw motion asset, not playable until retargeted.
```

### **12.4. Animation validation pseudocode**

```rust
pub async fn validate_animation(
    &self,
    path: &Path,
    metadata: &AnimationMetadata,
) -> Result<assetvalidationstatus> {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    if metadata.duration_seconds <= 0.0 {
        errors.push(issue("invalid_duration", "Animation duration must be positive"));
    }

    if metadata.duration_seconds > 120.0 {
        warnings.push(issue("long_animation", "Animation is longer than 120 seconds"));
    }

    if metadata.track_count == 0 {
        errors.push(issue("no_tracks", "Animation contains no tracks"));
    }

    if metadata.format == AnimationFormat::Bvh
        && metadata.compatibility.retarget_profile_id.is_none() {
        warnings.push(issue(
            "retarget_required",
            "BVH requires retarget profile before playback",
        ));
    }

    if !metadata.compatibility.compatible_with_vrm
        && !metadata.compatibility.requires_retargeting {
        errors.push(issue(
            "not_vrm_compatible",
            "Animation is not compatible with VRM runtime",
        ));
    }

    let status = if !errors.is_empty() {
        ValidationStatus::Invalid
    } else if !warnings.is_empty() {
        ValidationStatus::ValidWithWarnings
    } else {
        ValidationStatus::Valid
    };

    Ok(AssetValidationStatus {
        status,
        validated_at: Utc::now(),
        errors,
        warnings,
    })
}
```

---

## **13. Thumbnail Generation**

### **13.1. Thumbnail goals**

Thumbnail dùng cho:

```text
- Character selection UI
- Asset library
- Import confirmation
- Settings preview
```

### **13.2. Thumbnail policy**

| **Asset** | **Thumbnail source** |
|---|---|
| VRM model | Offscreen render front pose |
| VRMA animation | Use associated model + first/representative frame |
| BVH | Generic motion icon |
| Retarget profile | Generic JSON/profile icon |
| Texture | Downscaled image |

### **13.3. Thumbnail format**

```text
- Format: WebP preferred, PNG fallback
- Size: 256x256
- Background: transparent or neutral checker
- Path: asset folder / thumbnail.webp
```

### **13.4. Backend vs frontend generation**

Pragmatic approach:

```text
MVP:
- Frontend Three.js offscreen renderer creates thumbnail.
- Rust stores generated thumbnail file.

Reason:
- Three.js already has VRM loader.
- Avoid duplicate VRM parser/render backend in Rust.
```

### **13.5. Thumbnail request**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateThumbnailRequest {
    pub asset_id: String,
    pub width: u32,
    pub height: u32,
    pub format: ThumbnailFormat,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThumbnailFormat {
    Webp,
    Png,
}
```

### **13.6. Frontend thumbnail generation sketch**

```typescript
export async function generateVrmThumbnail(assetUrl: string): Promise<blob> {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });

  renderer.setSize(256, 256);

  const vrm = await loadVrm(assetUrl);
  scene.add(vrm.scene);

  // Normalize pose and camera
  vrm.scene.rotation.y = 0;
  camera.position.set(0, 1.35, 3.0);
  camera.lookAt(0, 1.25, 0);

  renderer.render(scene, camera);

  return await new Promise((resolve) => {
    renderer.domElement.toBlob(
      (blob) => resolve(blob!),
      "image/webp",
      0.9,
    );
  });
}
```

### **13.7. Save thumbnail command**

```rust
#[tauri::command]
pub async fn asset_save_thumbnail(
    asset_id: String,
    image_bytes: Vec<u8>,
    manager: tauri::State<'_, Arc<assetmanager>>,
) -> Result<(), String> {
    manager
        .save_thumbnail(asset_id, image_bytes, ThumbnailFormat::Webp)
        .await
        .map_err(|e| e.to_string())
}
```

---

## **14. Hot-Reload & Runtime Swap**

### **14.1. Hot-reload scenarios**

```text
- User imports new model and assigns it to active character.
- User replaces current model asset with new version.
- User imports animation and adds it to active animation set.
- User edits custom category/manifest in dev mode.
```

### **14.2. Runtime swap rule**

```text
AssetManager không trực tiếp thay renderer.
AssetManager emit event:
  AssetImported
  AssetUpdated
  AssetDeleted
  AssetReloadRequested

Renderer/CharacterManager quyết định reload.
```

### **14.3. Asset events**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AssetEvent {
    AssetImported {
        asset_id: String,
        kind: AssetKind,
    },
    AssetUpdated {
        asset_id: String,
        kind: AssetKind,
    },
    AssetDeleted {
        asset_id: String,
    },
    AssetReloadRequested {
        asset_id: String,
    },
    AssetValidationFailed {
        source_path: String,
        errors: Vec<assetvalidationissue>,
    },
}
```

### **14.4. Hot-swap model flow**

```text
User assigns model asset to active character
       ↓
CharacterManager validates asset_id exists and kind=VrmModel
       ↓
Character profile updates model_asset_id
       ↓
AssetRegistry adds dependency character→asset
       ↓
CharacterManager emits CharacterModelChanged
       ↓
Renderer receives event
       ↓
Renderer preloads new VRM
       ↓
If load success:
  - fade out old model
  - swap scene object
  - bind expressions
  - rebind spring bones/look-at
  - fade in new model
       ↓
If load fail:
  - keep old model
  - show error
```

### **14.5. Safe swap policy**

```text
- Never unload old model before new model loads successfully.
- If new model fails, keep old runtime.
- If old runtime missing, fallback to bundled default model.
- Animation bindings must be rebuilt after model swap.
```

### **14.6. Renderer-side pseudocode**

```typescript
async function swapVrmModel(assetId: string) {
  const asset = await invoke<resolvedasset>("asset_resolve", { asset_id: assetId });

  const oldVrm = currentVrm;

  try {
    const newVrm = await loadVrm(asset.url);

    await fadeOut(oldVrm.scene, 200);

    scene.remove(oldVrm.scene);
    scene.add(newVrm.scene);

    currentVrm = newVrm;

    expressionController.bind(newVrm);
    springBoneController.bind(newVrm);
    animationRuntime.rebindToModel(newVrm);

    await fadeIn(newVrm.scene, 200);
  } catch (err) {
    console.error("VRM swap failed", err);
    if (!oldVrm) {
      await loadFallbackModel();
    }
  }
}
```

---

## **15. Asset Versioning**

### **15.1. Why versioning**

Versioning cần cho:

```text
- User replace model nhưng muốn rollback.
- Animation update bị lỗi.
- Metadata schema thay đổi.
- Thumbnail regenerate.
```

### **15.2. Version policy**

```text
- Bundled assets: version theo app version, immutable.
- User imported assets: version tăng khi replace.
- Import duplicate hash không tạo version mới.
- Replace asset tạo new file trong versions/vN.ext.
```

### **15.3. Replace flow**

```text
User selects "Replace asset"
       ↓
Validate new file same compatible kind
       ↓
Copy current source.vrm to versions/vN.vrm
       ↓
Copy new file to source.vrm
       ↓
Update hash, metadata, validation
       ↓
Insert asset_version row
       ↓
Emit AssetUpdated
```

### **15.4. Rollback flow**

```text
User selects rollback to version N
       ↓
Copy current source to versions/current_backup
       ↓
Copy versions/vN to source
       ↓
Recompute metadata and validation
       ↓
Update AssetRecord
       ↓
Emit AssetUpdated
```

### **15.5. Version record**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetVersionRecord {
    pub id: String,
    pub asset_id: String,
    pub version_number: u32,
    pub file_path: String,
    pub content_hash_sha256: String,
    pub file_size_bytes: u64,
    pub created_at: DateTime<utc>,
    pub note: Option<string>,
}
```

---

## **16. Bundled Assets**

### **16.1. Required bundled assets for MVP**

```text
models:
- default companion VRM

animations:
- idle
- idle_sleepy
- talking_neutral
- talking_happy
- talking_gentle
- thinking
- wave
- happy
- shy
- drag
- error/confused
```

### **16.2. Bundled manifest**

`app_resources/bundled_assets/bundled_manifest.json`

```json
{
  "schema_version": 1,
  "assets": [
    {
      "asset_id": "bundled_model_default_mira",
      "name": "Default Mira",
      "kind": "vrm_model",
      "category": "model",
      "path": "models/default_mira.vrm",
      "thumbnail": "thumbnails/default_mira.webp"
    },
    {
      "asset_id": "bundled_anim_idle",
      "name": "Idle",
      "kind": "vrma_animation",
      "category": "animation",
      "path": "animations/idle.vrma",
      "role": "idle",
      "loop_recommended": true
    }
  ]
}
```

### **16.3. Bundled registration flow**

```text
App start
       ↓
Load bundled_manifest.json
       ↓
For each bundled asset:
  - validate path exists
  - compute or verify hash
  - upsert registry record with source=Bundled
       ↓
Ensure default character references bundled model
       ↓
Ensure default animation set references bundled animations
```

### **16.4. Bundled asset policy**

```text
- Không xóa.
- Không sửa.
- Có thể override bằng user asset trong character profile.
- Nếu missing/corrupt, app báo install integrity warning.
```

---

## **17. User Imported Assets**

### **17.1. User asset rules**

```text
- Copy vào user_data/assets.
- Không dùng file path gốc sau import.
- Có thể rename display name.
- Có thể delete nếu không còn dependency.
- Có thể replace.
- Có thể export asset package P2.
```

### **17.2. Duplicate handling**

| **Case** | **Behavior** |
|---|---|
| Same SHA-256 exists | Return existing asset |
| Same filename different hash | Import as new asset |
| Same display name | Auto suffix `(2)` |
| Replace existing asset | Version flow |

### **17.3. Rename asset**

```rust
pub async fn rename_asset(&self, asset_id: &str, new_name: String) -> Result<assetrecord> {
    validate_display_name(&new_name)?;

    let mut record = self.registry.get_required(asset_id).await?;
    record.name = new_name;
    record.updated_at = Utc::now();

    self.registry.update(record.clone()).await?;
    self.events.emit(AssetEvent::AssetUpdated {
        asset_id: asset_id.to_string(),
        kind: record.kind,
    });

    Ok(record)
}
```

### **17.4. Delete asset**

```text
Delete request
       ↓
Check dependency graph
       ↓
If referenced:
  - reject unless force with replacement asset
       ↓
Soft delete registry record
       ↓
Move files to trash folder or delete hard
       ↓
Emit AssetDeleted
```

MVP nên dùng **soft delete + trash folder** để rollback dễ.

---

## **18. Asset Dependency Graph**

### **18.1. Why dependency graph**

Để tránh:

```text
- Xóa model đang được character dùng.
- Xóa animation đang trong animation set.
- Xóa thumbnail của asset còn tồn tại.
- Cleanup nhầm asset bundled.
```

### **18.2. Dependency owner types**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetOwnerType {
    Character,
    AnimationSet,
    System,
    Cache,
}
```

### **18.3. Dependency types**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetDependencyType {
    Model,
    Animation,
    Thumbnail,
    RetargetProfile,
    Texture,
}
```

### **18.4. Character dependency example**

```json
{
  "owner_type": "character",
  "owner_id": "mira_default",
  "asset_id": "model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234",
  "dependency_type": "model"
}
```

### **18.5. Dependency update flow**

```text
Character changes model_asset_id
       ↓
Remove old dependency: character→old_model
       ↓
Add new dependency: character→new_model
       ↓
AssetManager.touch_last_used(new_model)
```

---

## **19. Cleanup & Garbage Collection**

### **19.1. Cleanup targets**

```text
- Import temp files older than 24h.
- Thumbnail cache orphaned.
- Soft-deleted assets older than retention.
- Runtime cache files.
- Unused generated previews.
```

### **19.2. Never cleanup**

```text
- Bundled assets.
- Assets referenced by dependency graph.
- Active character model.
- Active animation set.
- Assets imported within last 24h.
```

### **19.3. GC config**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetGcConfig {
    pub temp_retention_hours: u32,
    pub trash_retention_days: u32,
    pub cache_retention_days: u32,
    pub auto_cleanup_enabled: bool,
}

impl Default for AssetGcConfig {
    fn default() -> Self {
        Self {
            temp_retention_hours: 24,
            trash_retention_days: 30,
            cache_retention_days: 14,
            auto_cleanup_enabled: true,
        }
    }
}
```

### **19.4. GC flow**

```text
Scheduled GC runs daily
       ↓
Clean import temp > 24h
       ↓
Find soft-deleted assets > 30d
       ↓
Check dependencies again
       ↓
Hard delete files
       ↓
Delete registry rows or keep tombstone
       ↓
Clean orphan thumbnails/cache
       ↓
Emit cleanup summary
```

### **19.5. Cleanup result**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetCleanupResult {
    pub temp_files_deleted: u32,
    pub assets_hard_deleted: u32,
    pub thumbnails_deleted: u32,
    pub bytes_freed: u64,
    pub errors: Vec<string>,
}
```

---

## **20. Security & Safety**

### **20.1. Security rules**

```text
- Không load asset từ URL remote.
- Không cho external URI trong glTF trỏ ra ngoài asset folder.
- Không follow symlink khi import.
- Không preserve original absolute path.
- Không execute script từ asset.
- Không cho JSON manifest quá lớn.
- Không cho path traversal trong embedded resource.
```

### **20.2. External resource policy**

| **Resource type** | **Policy** |
|---|---|
| Embedded buffer | Allowed |
| Embedded texture | Allowed |
| Relative local URI | Copy into asset folder or reject |
| Absolute local URI | Reject |
| Remote URL | Reject |
| Data URI | Allowed if size within limit |

### **20.3. Symlink policy**

```rust
pub fn reject_symlink(path: &Path) -> Result<()> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() {
        return Err(anyhow!("symlink import is not allowed"));
    }
    Ok(())
}
```

### **20.4. Renderer safety**

```text
If renderer fails to load asset:
- Catch JS exception.
- Emit asset_runtime_load_failed.
- Mark asset last_runtime_error.
- Fallback to default bundled asset.
```

---

## **21. Backend: AssetManager**

### **21.1. Module trách nhiệm**

```rust
pub struct AssetManager {
    registry: Arc<assetregistry>,
    storage: Arc<assetstorage>,
    importer: Arc<assetimporter>,
    validator: Arc<dyn assetvalidator="">,
    metadata_extractor: Arc<assetmetadataextractor>,
    thumbnail: Arc<thumbnailservice>,
    resolver: Arc<assetresolver>,
    gc: Arc<assetgarbagecollector>,
    event_bus: Arc<asseteventbus>,
    audit: Arc<assetauditlogger>,
}
```

### **21.2. Public methods**

```rust
impl AssetManager {
    pub async fn init(config: AssetConfig) -> Result<self>;

    // Import
    pub async fn import_asset(&self, req: ImportAssetRequest) -> Result<importassetresult>;
    pub async fn import_vrm_model(&self, req: ImportAssetRequest) -> Result<importassetresult>;
    pub async fn import_animation(&self, req: ImportAnimationRequest) -> Result<importassetresult>;

    // Query
    pub async fn get_asset(&self, asset_id: &str) -> Result<assetrecord>;
    pub async fn list_assets(&self, filter: AssetFilter) -> Result<vec<assetrecord>>;
    pub async fn list_models(&self) -> Result<vec<assetrecord>>;
    pub async fn list_animations(&self) -> Result<vec<assetrecord>>;

    // Resolve
    pub async fn resolve_asset(&self, asset_id: &str) -> Result<resolvedasset>;
    pub async fn resolve_thumbnail(&self, asset_id: &str) -> Result<option<resolvedasset>>;

    // Mutation
    pub async fn rename_asset(&self, asset_id: &str, name: String) -> Result<assetrecord>;
    pub async fn replace_asset(&self, asset_id: &str, new_path: String) -> Result<assetrecord>;
    pub async fn rollback_asset(&self, asset_id: &str, version_number: u32) -> Result<assetrecord>;
    pub async fn delete_asset(&self, asset_id: &str, force: bool) -> Result<deleteassetresult>;

    // Dependencies
    pub async fn add_dependency(&self, req: AddAssetDependencyRequest) -> Result<()>;
    pub async fn remove_dependency(&self, req: RemoveAssetDependencyRequest) -> Result<()>;
    pub async fn list_dependencies(&self, asset_id: &str) -> Result<vec<assetdependency>>;

    // Thumbnail
    pub async fn save_thumbnail(
        &self,
        asset_id: String,
        image_bytes: Vec<u8>,
        format: ThumbnailFormat,
    ) -> Result<()>;

    // Maintenance
    pub async fn register_bundled_assets(&self) -> Result<()>;
    pub async fn validate_asset(&self, asset_id: &str) -> Result<assetvalidationstatus>;
    pub async fn cleanup_unused(&self) -> Result<assetcleanupresult>;

    // Events
    pub fn subscribe_events(&self) -> broadcast::Receiver<assetevent>;
}
```

### **21.3. ResolvedAsset**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedAsset {
    pub asset_id: String,
    pub kind: AssetKind,
    pub file_url: String,       // safe app-local URL for frontend
    pub file_path: String,      // backend only if needed
    pub metadata: AssetMetadata,
    pub content_hash_sha256: String,
}
```

### **21.4. AssetFilter**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetFilter {
    pub category: Option<assetcategory>,
    pub kind: Option<assetkind>,
    pub source: Option<assetsource>,
    pub include_deleted: bool,
    pub search: Option<string>,
}
```

---

## **22. Frontend Asset UI**

### **22.1. Asset Library UI**

```text
Settings
└─ Assets
   ├─ Models
   │  ├─ Default bundled model
   │  ├─ Imported models
   │  ├─ Import VRM button
   │  └─ Preview panel
   │
   ├─ Animations
   │  ├─ Idle
   │  ├─ Talking
   │  ├─ Reactions
   │  ├─ Import Animation button
   │  └─ Compatibility warnings
   │
   ├─ Cleanup
   │  ├─ Temp files
   │  ├─ Unused assets
   │  └─ Run cleanup
   │
   └─ Advanced
      ├─ Validate all assets
      ├─ Rebuild thumbnails
      └─ Open asset folder
```

### **22.2. Asset card**

```text
┌──────────────────────────┐
│ [Thumbnail]              │
│ Mira Model               │
│ VRM 1.0 · 42MB           │
│ Valid                    │
│ [Use] [Rename] [Delete]  │
└──────────────────────────┘
```

### **22.3. Import dialog**

```text
Import VRM Model
├─ File path
├─ Display name
├─ Validation status
├─ Warnings
│  ├─ High polycount
│  └─ Many textures
└─ [Import] [Cancel]
```

### **22.4. Frontend store**

```typescript
interface AssetStore {
  models: AssetRecord[];
  animations: AssetRecord[];
  loading: boolean;

  refreshModels: () => Promise<void>;
  refreshAnimations: () => Promise<void>;
  importModel: (sourcePath: string, displayName?: string) => Promise<importassetresult>;
  importAnimation: (sourcePath: string, displayName?: string) => Promise<importassetresult>;
  deleteAsset: (assetId: string) => Promise<void>;
  resolveAsset: (assetId: string) => Promise<resolvedasset>;
}
```

---

## **23. IPC Contract**

### **23.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `asset_import_model` | `ImportAssetRequest` | `ImportAssetResult` |
| `asset_import_animation` | `ImportAnimationRequest` | `ImportAssetResult` |
| `asset_get` | `{ asset_id }` | `AssetRecord` |
| `asset_list` | `AssetFilter` | `AssetRecord[]` |
| `asset_list_models` | `{}` | `AssetRecord[]` |
| `asset_list_animations` | `{}` | `AssetRecord[]` |
| `asset_resolve` | `{ asset_id }` | `ResolvedAsset` |
| `asset_resolve_thumbnail` | `{ asset_id }` | `ResolvedAsset \| null` |
| `asset_rename` | `{ asset_id, name }` | `AssetRecord` |
| `asset_replace` | `{ asset_id, new_path }` | `AssetRecord` |
| `asset_rollback` | `{ asset_id, version_number }` | `AssetRecord` |
| `asset_delete` | `{ asset_id, force }` | `DeleteAssetResult` |
| `asset_validate` | `{ asset_id }` | `AssetValidationStatus` |
| `asset_save_thumbnail` | `{ asset_id, image_bytes, format }` | `void` |
| `asset_cleanup_unused` | `{}` | `AssetCleanupResult` |
| `asset_open_folder` | `{ asset_id }` | `void` |

### **23.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `asset_imported` | `{ asset_id, kind }` | Refresh asset UI |
| `asset_updated` | `{ asset_id, kind }` | Reload metadata |
| `asset_deleted` | `{ asset_id }` | Remove from UI |
| `asset_reload_requested` | `{ asset_id }` | Renderer reload |
| `asset_validation_failed` | `{ source_path, errors }` | Show import error |
| `asset_cleanup_completed` | `AssetCleanupResult` | Show cleanup result |

### **23.3. TypeScript types**

```typescript
export type AssetCategory =
  | "model"
  | "animation"
  | "texture"
  | "thumbnail"
  | "manifest"
  | "retarget_profile";

export type AssetKind =
  | "vrm_model"
  | "vrma_animation"
  | "gltf_animation"
  | "bvh_motion"
  | "texture"
  | "thumbnail"
  | "retarget_profile";

export type AssetSource =
  | "bundled"
  | "user_imported"
  | "generated"
  | "cache";

export interface AssetRecord {
  asset_id: string;
  schema_version: number;
  name: string;
  category: AssetCategory;
  kind: AssetKind;
  source: AssetSource;
  file_path: string;
  thumbnail_path?: string | null;
  manifest_path?: string | null;
  original_filename?: string | null;
  content_hash_sha256: string;
  file_size_bytes: number;
  metadata: unknown;
  validation: AssetValidationStatus;
  created_at: string;
  updated_at: string;
  last_used_at?: string | null;
  is_deleted: boolean;
}

export interface ResolvedAsset {
  asset_id: string;
  kind: AssetKind;
  file_url: string;
  file_path: string;
  metadata: unknown;
  content_hash_sha256: string;
}
```

---

## **24. Integration Matrix**

| **Subsystem** | **Asset dependency** | **Required behavior** |
|---|---|---|
| **Character System** | model asset ID | Character stores `model_asset_id`, not raw path |
| **Animation Runtime** | animation asset IDs | Resolve animation via AssetManager |
| **Overlay Renderer** | resolved file URL | Loads only safe resolved asset URLs |
| **AI Interaction** | animation manifest IDs | AI suggestions validated against registry |
| **Settings UI** | asset library | Import, rename, delete, validate |
| **Privacy System** | path safety | No original absolute path exposed |
| **Telemetry/Debug** | asset status | Logs asset ID and kind, not raw path |

---

## **25. Logging & Audit**

### **25.1. Asset audit schema**

```sql
CREATE TABLE asset_audit_log (
    id TEXT PRIMARY KEY,
    asset_id TEXT,
    event_type TEXT NOT NULL,
    kind TEXT,
    source TEXT,
    status TEXT,
    reason TEXT,
    created_at DATETIME NOT NULL
);

CREATE INDEX idx_asset_audit_asset ON asset_audit_log(asset_id);
CREATE INDEX idx_asset_audit_created ON asset_audit_log(created_at);
```

### **25.2. Audit events**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AssetAuditEvent {
    ImportStarted {
        kind: AssetKind,
    },
    ImportCompleted {
        asset_id: String,
        kind: AssetKind,
    },
    ImportRejected {
        kind: Option<assetkind>,
        reason: String,
    },
    AssetUpdated {
        asset_id: String,
    },
    AssetDeleted {
        asset_id: String,
    },
    CleanupCompleted {
        bytes_freed: u64,
    },
}
```

### **25.3. Privacy rules**

```text
Audit log không lưu:
- original absolute source path
- user home path
- raw external URI
```

Cho phép lưu:

```text
- asset_id
- kind
- source type
- validation status
- original filename only
```

---

## **26. Error Handling**

### **26.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum AssetError {
    #[error("Asset not found: {0}")]
    AssetNotFound(String),

    #[error("Unsupported asset type: {0}")]
    UnsupportedAssetType(String),

    #[error("Validation failed")]
    ValidationFailed(Vec<assetvalidationissue>),

    #[error("File too large")]
    FileTooLarge,

    #[error("Duplicate asset: {0}")]
    DuplicateAsset(String),

    #[error("Storage failed: {0}")]
    StorageFailed(String),

    #[error("Registry failed: {0}")]
    RegistryFailed(String),

    #[error("Asset is in use: {0}")]
    AssetInUse(String),

    #[error("Path escapes asset root")]
    PathEscapesRoot,

    #[error("Thumbnail generation failed: {0}")]
    ThumbnailFailed(String),

    #[error("Runtime resolve failed: {0}")]
    ResolveFailed(String),
}
```

### **26.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Unsupported type | Reject import |
| File too large | Reject import |
| Duplicate hash | Return existing asset |
| Metadata parse fail | Reject or import as invalid disabled |
| Thumbnail fail | Import still succeeds with default thumbnail |
| Registry insert fail | Rollback copied files |
| Storage copy fail | Abort import, cleanup temp |
| Asset in use delete | Reject delete, show dependencies |
| Runtime load fail | Fallback bundled asset |
| Bundled missing | Show install integrity warning |

### **26.3. Import rollback**

```text
If import fails after file copy:
  1. Delete temp files.
  2. Delete created asset folder.
  3. Do not insert registry.
  4. Emit AssetValidationFailed or ImportRejected.
```

---

## **27. Performance Considerations**

### **27.1. Storage targets**

```text
- Default bundled model: < 50MB
- User VRM max: 150MB
- Animation max: 50MB
- Thumbnail: < 256KB
```

### **27.2. Import performance**

| **Operation** | **Target** |
|---|---|
| SHA-256 100MB file | < 2s |
| Metadata extraction | < 3s |
| Thumbnail generation | < 2s |
| Registry insert | < 20ms |
| Asset resolve | < 1ms |

### **27.3. Runtime loading**

```text
- Preload active character model.
- Lazy-load inactive character models.
- Cache animation clips by asset_id.
- Release old VRM textures/materials after swap.
```

### **27.4. Renderer cleanup**

Khi unload model:

```typescript
function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child: any) => {
    if (child.geometry) child.geometry.dispose();

    if (child.material) {
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];

      for (const mat of materials) {
        for (const key of Object.keys(mat)) {
          const value = mat[key];
          if (value && value.isTexture) value.dispose();
        }
        mat.dispose();
      }
    }
  });
}
```

---

## **28. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── asset/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── registry.rs
│               ├── storage.rs
│               ├── importer.rs
│               ├── validator.rs
│               ├── metadata.rs
│               ├── resolver.rs
│               ├── thumbnail.rs
│               ├── versioning.rs
│               ├── dependency.rs
│               ├── gc.rs
│               ├── events.rs
│               ├── audit.rs
│               └── errors.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── asset_commands.rs
│
├── src/
│   ├── settings/
│   │   └── pages/
│   │       └── Assets.tsx
│   │
│   ├── asset/
│   │   ├── components/
│   │   │   ├── AssetLibrary.tsx
│   │   │   ├── AssetCard.tsx
│   │   │   ├── ImportAssetDialog.tsx
│   │   │   ├── AssetPreview.tsx
│   │   │   └── ValidationIssues.tsx
│   │   ├── stores/
│   │   │   └── assetStore.ts
│   │   └── thumbnail/
│   │       └── generateVrmThumbnail.ts
│   │
│   ├── renderer/
│   │   └── assetLoader.ts
│   │
│   └── shared/
│       └── types/
│           └── asset.ts
│
├── app_resources/
│   └── bundled_assets/
│       ├── bundled_manifest.json
│       ├── models/
│       ├── animations/
│       └── thumbnails/
│
└── docs/
    └── asset-system.md
```

---

## **29. Implementation Checklist**

### **29.1. P0 Core**

- [ ] Define `AssetRecord`.
- [ ] Define `AssetKind`, `AssetCategory`, `AssetSource`.
- [ ] Define `AssetMetadata`.
- [ ] Define `AssetValidationStatus`.
- [ ] Implement SQLite `asset` table.
- [ ] Implement `AssetRegistry`.
- [ ] Implement `AssetStorage`.
- [ ] Implement `AssetResolver`.
- [ ] Implement `AssetManager`.

### **29.2. P0 Import**

- [ ] Implement `asset_import_model`.
- [ ] Validate `.vrm` extension.
- [ ] Validate file size.
- [ ] Compute SHA-256.
- [ ] Duplicate check.
- [ ] Copy file into user asset folder.
- [ ] Write manifest.
- [ ] Insert registry record.
- [ ] Rollback on failure.

### **29.3. P0 VRM Validation**

- [ ] Extract VRM version.
- [ ] Extract humanoid bones.
- [ ] Extract expression names.
- [ ] Validate required bones.
- [ ] Warn high texture count.
- [ ] Warn high polycount if available.
- [ ] Reject external URI.

### **29.4. P0 Animation Assets**

- [ ] Register bundled animations.
- [ ] Define animation roles.
- [ ] Import `.vrma`.
- [ ] Validate duration and track count.
- [ ] Resolve animation asset by ID.
- [ ] Expose animation registry to Animation Runtime.

### **29.5. P0 Bundled Assets**

- [ ] Create `bundled_manifest.json`.
- [ ] Register default model.
- [ ] Register default animation set.
- [ ] Fallback to default model if user model fails.
- [ ] Fallback to default idle/talking animations.

### **29.6. P1 Thumbnail**

- [ ] Generate VRM thumbnail in frontend.
- [ ] Save thumbnail via backend.
- [ ] Show thumbnail in asset library.
- [ ] Default thumbnail fallback.

### **29.7. P1 Dependencies**

- [ ] Implement `asset_dependency` table.
- [ ] Character model dependency.
- [ ] Animation set dependency.
- [ ] Prevent delete if referenced.
- [ ] Touch `last_used_at`.

### **29.8. P1 Hot-Reload**

- [ ] Emit `asset_updated`.
- [ ] Renderer listens to reload event.
- [ ] Safe model swap.
- [ ] Animation runtime rebind after model swap.

### **29.9. P1 Versioning**

- [ ] Replace asset flow.
- [ ] Save previous version.
- [ ] Rollback asset version.
- [ ] Version UI.

### **29.10. P2 Cleanup & Polish**

- [ ] Asset garbage collector.
- [ ] Trash folder.
- [ ] Cleanup UI.
- [ ] Export asset package.
- [ ] BVH retarget profile import.
- [ ] Validate all assets command.
- [ ] Rebuild all thumbnails.

---

## **30. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Asset** | File được app quản lý: model, animation, texture, thumbnail. |
| **AssetManager** | Module trung tâm điều phối import, resolve, update, delete asset. |
| **AssetRegistry** | SQLite registry lưu metadata và trạng thái asset. |
| **AssetResolver** | Bộ resolve `asset_id` thành path hoặc URL an toàn cho runtime. |
| **VRM** | Format model avatar humanoid dùng cho character. |
| **VRMA** | Format animation dành cho VRM. |
| **BVH** | Motion capture format, cần retarget trước khi dùng với VRM. |
| **Thumbnail** | Ảnh preview asset. |
| **Bundled Asset** | Asset đi kèm app, immutable. |
| **User Imported Asset** | Asset user import vào user data folder. |
| **Dependency Graph** | Quan hệ asset đang được character/profile/animation set sử dụng. |
| **Hot-Reload** | Reload asset runtime không cần restart app. |
| **Versioning** | Lưu lịch sử phiên bản asset để rollback. |
| **GC** | Garbage collection, dọn asset/cache không dùng. |

---

# **Phụ lục A: Flow import VRM**

```text
User chọn file .vrm
       ↓
Frontend gọi asset_import_model
       ↓
AssetManager.import_vrm_model
       ↓
Path validation:
  - exists
  - readable
  - not symlink
  - extension .vrm
       ↓
File size validation:
  - <= 150MB
       ↓
Copy to import temp
       ↓
Compute SHA-256
       ↓
Registry duplicate check
       ↓
If duplicate:
  - return existing asset
       ↓
Extract metadata:
  - VRM version
  - humanoid bones
  - expressions
  - materials/textures
       ↓
Validate VRM:
  - required humanoid bones
  - VRM extension exists
  - no external URI
       ↓
If invalid:
  - rollback temp
  - return validation errors
       ↓
Create asset_id
       ↓
Create asset folder:
  user_data/assets/models/vrm/model_<asset_id>/
       ↓
Copy source.vrm
       ↓
Generate thumbnail or default thumbnail
       ↓
Write manifest.json
       ↓
Insert AssetRecord into SQLite
       ↓
Emit asset_imported
       ↓
Return ImportAssetResult
```

---

# **Phụ lục B: Flow hot-swap character model**

```text
User chọn "Use this model" trong Asset Library
       ↓
CharacterManager receives model_asset_id
       ↓
AssetManager.get_asset(model_asset_id)
       ↓
Validate:
  - exists
  - kind = vrm_model
  - validation status != invalid
       ↓
Update character.profile.model_asset_id
       ↓
Update asset dependency graph:
  - remove old character→model dependency
  - add new character→model dependency
       ↓
Emit CharacterModelChanged
       ↓
Renderer receives event
       ↓
Resolve asset:
  AssetManager.resolve_asset(model_asset_id)
       ↓
Renderer preloads new VRM
       ↓
If success:
  - fade old model out
  - dispose old geometry/material/texture
  - add new model
  - bind expression/spring/look-at
  - rebind animation runtime
  - fade in
       ↓
If failure:
  - keep old model
  - if no old model, load bundled default
       ↓
Emit runtime model swap completed
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. AssetRecord VRM mẫu**

```json
{
  "asset_id": "model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234",
  "schema_version": 1,
  "name": "Mira Casual Hoodie",
  "category": "model",
  "kind": "vrm_model",
  "source": "user_imported",
  "file_path": "user_data/assets/models/vrm/model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234/source.vrm",
  "thumbnail_path": "user_data/assets/models/vrm/model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234/thumbnail.webp",
  "manifest_path": "user_data/assets/models/vrm/model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234/manifest.json",
  "original_filename": "mira_hoodie.vrm",
  "content_hash_sha256": "9b4e3d0f2a7e8b7d0a9e1c4f2a6d1c9e3b7f8a0c1d2e3f4a5b6c7d8e9f000111",
  "file_size_bytes": 42000000,
  "metadata": {
    "type": "VrmModel",
    "vrm_version": "1.0",
    "humanoid_bones_detected": ["hips", "spine", "chest", "neck", "head"],
    "expression_names": ["happy", "angry", "sad", "relaxed", "surprised"],
    "material_count": 8,
    "mesh_count": 4,
    "texture_count": 12,
    "triangle_count_estimate": 78000,
    "has_spring_bones": true,
    "has_look_at": true,
    "license_name": "custom",
    "author": "unknown"
  },
  "validation": {
    "status": "valid",
    "validated_at": "2026-05-26T23:50:00Z",
    "errors": [],
    "warnings": []
  },
  "created_at": "2026-05-26T23:50:00Z",
  "updated_at": "2026-05-26T23:50:00Z",
  "last_used_at": null,
  "is_deleted": false
}
```

## **C.2. ImportAssetRequest mẫu**

```json
{
  "source_path": "C:/Users/Phuong/Downloads/mira_hoodie.vrm",
  "display_name": "Mira Casual Hoodie",
  "category_hint": "model",
  "replace_asset_id": null
}
```

## **C.3. ImportAssetResult mẫu**

```json
{
  "asset_id": "model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234",
  "status": "imported",
  "duplicate_of": null,
  "warnings": []
}
```

## **C.4. AnimationAssetManifest mẫu**

```json
{
  "asset_id": "anim_018fb7f6_2df8_7f36_b1a2_94b05fdc5678",
  "name": "Talking Gentle",
  "role": "talking",
  "format": "vrma",
  "duration_seconds": 3.2,
  "loop_recommended": true,
  "priority_hint": 60,
  "compatible_model_kind": "any_vrm",
  "tags": ["talking", "gentle", "default"]
}
```

## **C.5. ResolvedAsset mẫu**

```json
{
  "asset_id": "model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234",
  "kind": "vrm_model",
  "file_url": "asset://model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234/source.vrm",
  "file_path": "user_data/assets/models/vrm/model_018fb7f6_2df8_7f36_b1a2_94b05fdc1234/source.vrm",
  "metadata": {
    "type": "VrmModel",
    "vrm_version": "1.0"
  },
  "content_hash_sha256": "9b4e3d0f2a7e8b7d0a9e1c4f2a6d1c9e3b7f8a0c1d2e3f4a5b6c7d8e9f000111"
}
```

## **C.6. AssetCleanupResult mẫu**

```json
{
  "temp_files_deleted": 12,
  "assets_hard_deleted": 2,
  "thumbnails_deleted": 4,
  "bytes_freed": 128000000,
  "errors": []
}
```

---

**Tài liệu này là source of truth cho Asset System. Mọi model, animation, thumbnail và manifest phải được quản lý qua AssetManager. Renderer và subsystem khác chỉ dùng `asset_id` hoặc `ResolvedAsset`, không dùng raw path. Import phải validate trước khi store, delete phải kiểm tra dependency, runtime load lỗi phải fallback sang bundled assets.**

---