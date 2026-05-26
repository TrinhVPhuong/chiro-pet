# **Chiro-Pet Settings System**

> Tài liệu thiết kế chính thức cho **Settings System** của **Chiro-Pet**.  
> Hệ thống này quản lý toàn bộ cấu hình app: **general**, **AI provider**, **privacy**, **overlay**, **behavior**, **animation**, **assets**, **hotkeys**, **developer/debug**.
>
> **Nguyên tắc lõi:** Settings là **configuration source of truth** của app. Mọi thay đổi cấu hình phải đi qua **SettingsManager**, được **validate**, **migrate**, **persist**, **emit event**, và không được expose secret như API key plaintext ra frontend.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Settings Architecture](#3-settings-architecture)
4. [Settings Sections](#4-settings-sections)
5. [Data Model](#5-data-model)
6. [Default Settings](#6-default-settings)
7. [Settings Persistence](#7-settings-persistence)
8. [Settings Validation](#8-settings-validation)
9. [Settings Migration](#9-settings-migration)
10. [Settings Patch System](#10-settings-patch-system)
11. [Settings Events](#11-settings-events)
12. [Secret Handling](#12-secret-handling)
13. [Import & Export](#13-import--export)
14. [Reset Flow](#14-reset-flow)
15. [Frontend Settings UI](#15-frontend-settings-ui)
16. [Backend: SettingsManager](#16-backend-settingsmanager)
17. [IPC Contract](#17-ipc-contract)
18. [Integration Matrix](#18-integration-matrix)
19. [Logging & Audit](#19-logging--audit)
20. [Error Handling](#20-error-handling)
21. [Performance Considerations](#21-performance-considerations)
22. [File Structure](#22-file-structure)
23. [Implementation Checklist](#23-implementation-checklist)
24. [Glossary](#24-glossary)
25. [Phụ lục A: Flow update settings section](#phụ-lục-a-flow-update-settings-section)
26. [Phụ lục B: Flow app startup settings load](#phụ-lục-b-flow-app-startup-settings-load)
27. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)
28. [Tổng kết tài liệu đã tổng hợp và còn lại](#28-tổng-kết-tài-liệu-đã-tổng-hợp-và-còn-lại)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Settings System của **Chiro-Pet** phải:

- Quản lý cấu hình toàn app qua một **AppSettings** duy nhất.
- Chia cấu hình thành các section rõ ràng:
  - **general**
  - **ai**
  - **privacy**
  - **overlay**
  - **behavior**
  - **animation**
  - **assets**
  - **hotkeys**
  - **developer**
- Hỗ trợ **default values** an toàn.
- Hỗ trợ **partial update** theo section.
- Validate mọi update trước khi persist.
- Hỗ trợ migration khi schema thay đổi.
- Hỗ trợ import/export settings.
- Hỗ trợ reset từng section hoặc reset toàn bộ.
- Bảo vệ secret:
  - API key không lưu plain text.
  - API key không trả về frontend.
  - Export settings không bao gồm credential mặc định.
- Emit event khi settings thay đổi để subsystem reload config.
- Cho phép frontend hydrate settings khi app start.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Settings schema.
- Default values.
- Validation.
- Persistence.
- Migration.
- Patch/update flow.
- Import/export.
- Reset.
- IPC contract.
- Settings UI structure.
- Integration với Privacy, AI, Overlay, Behavior, Asset, Hotkey.

Tài liệu này không mô tả chi tiết:

- AI request lifecycle.
- Privacy guard logic nội bộ.
- Overlay window implementation.
- Asset import pipeline.
- Hotkey registry chi tiết.

Các phần đó thuộc subsystem riêng.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Single settings source** | Mọi subsystem đọc config qua SettingsManager hoặc snapshot đã được phát event. |
| **2** | **Validate before persist** | Không ghi settings invalid xuống disk/database. |
| **3** | **Section-based update** | Update từng section để tránh ghi đè nhầm toàn bộ settings. |
| **4** | **Secrets separated** | API key/credential lưu riêng qua encrypted storage, không nằm trong JSON settings thường. |
| **5** | **Frontend receives safe settings** | Frontend chỉ nhận safe config, không nhận secret plaintext. |
| **6** | **Migration-safe** | Settings có `schema_version`, load version cũ phải migrate. |
| **7** | **Event-driven reload** | Settings update emit event để subsystem reload. |
| **8** | **Reset deterministic** | Reset section luôn quay về default rõ ràng. |
| **9** | **Import guarded** | Settings import phải validate và không override secret nếu user không xác nhận. |
| **10** | **Fail safe** | Nếu settings load lỗi, dùng default an toàn và backup file lỗi. |

### **2.2. Anti-pattern cần tránh**

- ❌ Lưu API key trong `settings.json`.
- ❌ Frontend tự sửa file settings.
- ❌ Update settings bằng `serde_json::Value` không validate.
- ❌ Một subsystem giữ config cache vĩnh viễn không nghe event update.
- ❌ Import settings ghi đè privacy sang trạng thái nguy hiểm mà không cảnh báo.
- ❌ Reset settings nhưng không emit event.
- ❌ Không có migration khi schema đổi.
- ❌ Settings UI dùng hardcode default khác backend.
- ❌ Expose developer/debug settings cho user thường nếu chưa bật advanced mode.
- ❌ Không backup settings corrupt trước khi reset.

---

## **3. Settings Architecture**

```text
┌──────────────────────────────────────────────────────────────┐
│                     FRONTEND SETTINGS UI                      │
│  - Settings pages                                             │
│  - Form validation nhẹ                                        │
│  - Invoke settings_* commands                                 │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                       IPC COMMAND LAYER                       │
│  - settings_get_all                                           │
│  - settings_update_section                                    │
│  - settings_reset_section                                     │
│  - settings_export/import                                     │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                       SETTINGS MANAGER                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Settings Store                                         │  │
│  │ - read/write JSON or SQLite                            │  │
│  │ - backup corrupt file                                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Validator                                              │  │
│  │ - range check                                          │  │
│  │ - enum check                                           │  │
│  │ - section-specific rules                               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Migration Registry                                     │  │
│  │ - v1 → v2                                              │  │
│  │ - v2 → v3                                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Secret Config Bridge                                   │  │
│  │ - AI provider API key                                  │
│  │ - encrypted storage                                    │
│  │ - safe frontend DTO                                    │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Event Bus                                              │  │
│  │ - settings_updated                                     │
│  │ - settings_reset                                       │
│  │ - settings_import_completed                            │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                       CORE SUBSYSTEMS                         │
│ AI / Privacy / Overlay / Behavior / Animation / Asset / etc.  │
└──────────────────────────────────────────────────────────────┘
```

---

## **4. Settings Sections**

### **4.1. Section list**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SettingsSection {
    General,
    Ai,
    Privacy,
    Overlay,
    Behavior,
    Animation,
    Assets,
    Hotkeys,
    Developer,
}
```

### **4.2. Section responsibility**

| **Section** | **Trách nhiệm** |
|---|---|
| **general** | Ngôn ngữ, startup, theme, app behavior cơ bản |
| **ai** | Provider config safe, model, timeout, budget |
| **privacy** | Privacy permissions, modes, retention |
| **overlay** | Window size, anchor, scale, visibility behavior |
| **behavior** | Proactivity, cooldown, daily budget, scheduler |
| **animation** | FPS, idle animation, expression intensity, procedural toggles |
| **assets** | Asset storage, cleanup, validation limits |
| **hotkeys** | Global hotkey bindings |
| **developer** | Debug UI, logging, diagnostics, prompt viewer |

---

## **5. Data Model**

### **5.1. AppSettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub schema_version: u32,

    pub general: GeneralSettings,
    pub ai: AiSettings,
    pub privacy: PrivacySettings,
    pub overlay: OverlaySettings,
    pub behavior: BehaviorSettings,
    pub animation: AnimationSettings,
    pub assets: AssetSettings,
    pub hotkeys: HotkeySettings,
    pub developer: DeveloperSettings,

    pub updated_at: DateTime<utc>,
}
```

### **5.2. GeneralSettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneralSettings {
    pub language: String,              // "vi", "en"
    pub theme: ThemeMode,
    pub launch_on_startup: bool,
    pub start_minimized: bool,
    pub check_updates: bool,
    pub confirm_before_quit: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    System,
    Light,
    Dark,
}
```

### **5.3. AiSettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub enabled: bool,

    pub base_url: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub timeout_seconds: u64,

    pub daily_limit_cents: u32,
    pub max_calls_per_minute: u32,
    pub max_calls_per_hour: u32,

    pub use_desktop_context: bool,
    pub use_memory_context: bool,
    pub fallback_enabled: bool,

    // Safe flag only. Actual key lives in encrypted credential store.
    pub has_api_key: bool,
}
```

### **5.4. OverlaySettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlaySettings {
    pub show_on_start: bool,
    pub always_on_top: bool,
    pub click_through_enabled: bool,

    pub default_anchor: AnchorMode,
    pub scale: f32,

    pub auto_hide_fullscreen_game: bool,
    pub auto_hide_meeting: bool,
    pub lower_on_fullscreen_video: bool,

    pub remember_position: bool,
    pub enable_snap: bool,
    pub snap_threshold_px: u32,

    pub bubble_enabled: bool,
    pub bubble_max_chars: u32,
    pub bubble_default_duration_ms: u32,
}
```

### **5.5. BehaviorSettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehaviorSettings {
    pub proactive_enabled: bool,
    pub daily_greeting_enabled: bool,
    pub focus_reminder_enabled: bool,
    pub periodic_checkin_enabled: bool,

    pub max_proactive_per_day: u32,
    pub max_focus_reminders_per_day: u32,
    pub global_proactive_cooldown_minutes: u32,
    pub focus_reminder_interval_minutes: u32,
    pub periodic_checkin_interval_minutes: u32,

    pub daily_greeting_hour: u8,
    pub daily_greeting_minute: u8,

    pub quiet_hours_enabled: bool,
    pub quiet_hours_start: u8,
    pub quiet_hours_end: u8,
}
```

### **5.6. AnimationSettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationSettings {
    pub target_fps: u32,
    pub reduce_motion: bool,

    pub idle_animation_id: Option<string>,
    pub default_talking_animation_id: Option<string>,

    pub expression_intensity: f32,
    pub blink_enabled: bool,
    pub look_at_cursor_enabled: bool,
    pub breathing_enabled: bool,
    pub spring_bones_enabled: bool,

    pub crossfade_ms: u32,
}
```

### **5.7. AssetSettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetSettings {
    pub auto_cleanup_enabled: bool,
    pub temp_retention_hours: u32,
    pub trash_retention_days: u32,
    pub cache_retention_days: u32,

    pub max_vrm_size_mb: u32,
    pub max_animation_size_mb: u32,
    pub generate_thumbnails: bool,
    pub validate_on_startup: bool,
}
```

### **5.8. HotkeySettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeySettings {
    pub enabled: bool,
    pub bindings: Vec<hotkeybinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub hotkey_id: String,
    pub action: String,
    pub accelerator: String,
    pub enabled: bool,
    pub scope: HotkeyScope,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyScope {
    Global,
    Overlay,
    Chat,
}
```

### **5.9. DeveloperSettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeveloperSettings {
    pub developer_mode: bool,
    pub debug_overlay_enabled: bool,
    pub show_behavior_debug_panel: bool,
    pub show_state_debug_panel: bool,

    pub debug_logging_enabled: bool,
    pub prompt_logging_enabled: bool,
    pub redact_debug_logs: bool,

    pub ipc_event_monitor_enabled: bool,
    pub performance_overlay_enabled: bool,
}
```

---

## **6. Default Settings**

### **6.1. AppSettings default**

```rust
impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: 1,
            general: GeneralSettings::default(),
            ai: AiSettings::default(),
            privacy: PrivacySettings::default(),
            overlay: OverlaySettings::default(),
            behavior: BehaviorSettings::default(),
            animation: AnimationSettings::default(),
            assets: AssetSettings::default(),
            hotkeys: HotkeySettings::default(),
            developer: DeveloperSettings::default(),
            updated_at: Utc::now(),
        }
    }
}
```

### **6.2. Key defaults**

```text
general:
  language = "vi"
  theme = system
  launch_on_startup = false

ai:
  enabled = true
  base_url = "https://api.openai.com/v1"
  model = "gpt-4o-mini"
  temperature = 0.7
  max_tokens = 500
  daily_limit_cents = 50
  has_api_key = false

overlay:
  show_on_start = true
  always_on_top = true
  click_through_enabled = true
  default_anchor = taskbar_right
  scale = 1.0

behavior:
  proactive_enabled = true
  max_proactive_per_day = 8
  focus_reminder_interval_minutes = 45
  global_proactive_cooldown_minutes = 15

animation:
  target_fps = 60
  blink_enabled = true
  look_at_cursor_enabled = true
  expression_intensity = 1.0

assets:
  max_vrm_size_mb = 150
  max_animation_size_mb = 50
  generate_thumbnails = true

developer:
  developer_mode = false
  prompt_logging_enabled = false
  redact_debug_logs = true
```

### **6.3. Default hotkeys**

```json
[
  {
    "hotkey_id": "toggle_overlay",
    "action": "overlay_toggle",
    "accelerator": "Ctrl+Shift+H",
    "enabled": true,
    "scope": "global"
  },
  {
    "hotkey_id": "toggle_private_mode",
    "action": "privacy_toggle_private",
    "accelerator": "Ctrl+Shift+P",
    "enabled": true,
    "scope": "global"
  },
  {
    "hotkey_id": "open_chat",
    "action": "overlay_show_chat_panel",
    "accelerator": "Ctrl+Shift+C",
    "enabled": true,
    "scope": "global"
  }
]
```

---

## **7. Settings Persistence**

### **7.1. Storage strategy**

Khuyến nghị MVP:

```text
user_data/settings/app_settings.json
user_data/settings/credentials.json.enc
```

SQLite có thể dùng cho audit/history, nhưng settings chính nên là JSON để dễ backup/debug.

### **7.2. Layout**

```text
user_data/
├── settings/
│   ├── app_settings.json
│   ├── app_settings.backup.json
│   ├── app_settings.corrupt.<timestamp>.json
│   └── credentials.json.enc
```

### **7.3. SettingsStore**

```rust
pub struct SettingsStore {
    settings_path: PathBuf,
    backup_path: PathBuf,
}

impl SettingsStore {
    pub async fn load(&self) -> Result<appsettings>;
    pub async fn save(&self, settings: &AppSettings) -> Result<()>;
    pub async fn backup_current(&self) -> Result<()>;
    pub async fn backup_corrupt(&self, raw: String) -> Result<pathbuf>;
}
```

### **7.4. Atomic write**

```rust
pub async fn save_atomic(path: &Path, content: &[u8]) -> Result<()> {
    let tmp = path.with_extension("tmp");

    tokio::fs::write(&tmp, content).await?;
    tokio::fs::rename(&tmp, path).await?;

    Ok(())
}
```

### **7.5. Load policy**

```text
On load:
  1. If settings file exists:
     - read
     - parse JSON
     - migrate if needed
     - validate
     - return
  2. If parse fail:
     - backup corrupt file
     - try backup file
  3. If backup valid:
     - load backup
  4. Else:
     - use default settings
     - save default
```

---

## **8. Settings Validation**

### **8.1. Validation levels**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SettingsValidationSeverity {
    Info,
    Warning,
    Error,
}
```

### **8.2. Validation issue**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsValidationIssue {
    pub section: SettingsSection,
    pub field: String,
    pub code: String,
    pub message: String,
    pub severity: SettingsValidationSeverity,
}
```

### **8.3. Validation result**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsValidationResult {
    pub valid: bool,
    pub issues: Vec<settingsvalidationissue>,
}
```

### **8.4. Validation rules**

| **Section** | **Field** | **Rule** |
|---|---|---|
| **ai** | `temperature` | `0.0..2.0` |
| **ai** | `max_tokens` | `64..4096` |
| **ai** | `timeout_seconds` | `5..120` |
| **ai** | `daily_limit_cents` | `0..10000` |
| **overlay** | `scale` | `0.5..3.0` |
| **overlay** | `bubble_max_chars` | `50..500` |
| **behavior** | `daily_greeting_hour` | `0..23` |
| **behavior** | `daily_greeting_minute` | `0..59` |
| **behavior** | `max_proactive_per_day` | `0..50` |
| **animation** | `target_fps` | `15, 30, 60, 120` |
| **animation** | `expression_intensity` | `0.0..1.5` |
| **assets** | `max_vrm_size_mb` | `10..500` |
| **assets** | `temp_retention_hours` | `1..168` |

### **8.5. Validator pseudocode**

```rust
pub struct SettingsValidator;

impl SettingsValidator {
    pub fn validate(&self, settings: &AppSettings) -> SettingsValidationResult {
        let mut issues = Vec::new();

        validate_range(
            &mut issues,
            SettingsSection::Ai,
            "temperature",
            settings.ai.temperature,
            0.0,
            2.0,
        );

        validate_range(
            &mut issues,
            SettingsSection::Overlay,
            "scale",
            settings.overlay.scale,
            0.5,
            3.0,
        );

        if ![15, 30, 60, 120].contains(&settings.animation.target_fps) {
            issues.push(SettingsValidationIssue {
                section: SettingsSection::Animation,
                field: "target_fps".into(),
                code: "invalid_fps".into(),
                message: "target_fps must be one of 15, 30, 60, 120".into(),
                severity: SettingsValidationSeverity::Error,
            });
        }

        let valid = !issues.iter().any(|i| {
            matches!(i.severity, SettingsValidationSeverity::Error)
        });

        SettingsValidationResult { valid, issues }
    }
}
```

---

## **9. Settings Migration**

### **9.1. Migration rules**

```text
- Migration chạy khi load settings.
- Migration là một chiều: v1 → v2 → v3.
- Migration không gọi AI, không gọi network.
- Migration phải preserve user values nếu có thể.
- Sau migration phải validate.
- Nếu migration fail, backup settings cũ và dùng default.
```

### **9.2. Migration trait**

```rust
pub trait SettingsMigration: Send + Sync {
    fn from_version(&self) -> u32;
    fn to_version(&self) -> u32;
    fn migrate(&self, raw: serde_json::Value) -> Result<serde_json::value>;
}
```

### **9.3. Migration registry**

```rust
pub struct SettingsMigrationRegistry {
    migrations: Vec<box<dyn settingsmigration="">>,
    latest_version: u32,
}

impl SettingsMigrationRegistry {
    pub fn migrate_to_latest(
        &self,
        mut raw: serde_json::Value,
    ) -> Result<appsettings> {
        let mut version = raw
            .get("schema_version")
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as u32;

        while version < self.latest_version {
            let migration = self.migrations
                .iter()
                .find(|m| m.from_version() == version)
                .ok_or_else(|| anyhow!("missing settings migration from v{}", version))?;

            raw = migration.migrate(raw)?;
            version = migration.to_version();
        }

        Ok(serde_json::from_value(raw)?)
    }
}
```

### **9.4. Example migration**

```rust
pub struct SettingsMigrationV1ToV2;

impl SettingsMigration for SettingsMigrationV1ToV2 {
    fn from_version(&self) -> u32 { 1 }
    fn to_version(&self) -> u32 { 2 }

    fn migrate(&self, mut raw: serde_json::Value) -> Result<serde_json::value> {
        let obj = raw.as_object_mut()
            .ok_or_else(|| anyhow!("settings root must be object"))?;

        obj.insert("schema_version".into(), serde_json::json!(2));

        if obj.get("developer").is_none() {
            obj.insert("developer".into(), serde_json::json!(DeveloperSettings::default()));
        }

        Ok(raw)
    }
}
```

---

## **10. Settings Patch System**

### **10.1. Patch principle**

Update phải theo section:

```text
settings_update_section({
  section: "overlay",
  patch: {
    scale: 1.2,
    default_anchor: "bottom_right"
  }
})
```

Không nên update toàn bộ AppSettings từ frontend trừ import/reset.

### **10.2. Patch type**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsSectionPatch {
    pub section: SettingsSection,
    pub patch: serde_json::Value,
}
```

### **10.3. Patch flow**

```text
Get current settings
  ↓
Deserialize patch into section-specific partial type
  ↓
Apply patch to cloned settings
  ↓
Validate full settings
  ↓
If valid:
  - save
  - update cache
  - emit settings_updated
  - notify dependent subsystem
  ↓
Return AppSettingsSafe
```

### **10.4. Patch pseudocode**

```rust
pub async fn update_section(
    &self,
    section: SettingsSection,
    patch: serde_json::Value,
) -> Result<appsettings> {
    let mut settings = self.get_all().await?;

    match section {
        SettingsSection::General => {
            let patch: GeneralSettingsPatch = serde_json::from_value(patch)?;
            patch.apply(&mut settings.general);
        }
        SettingsSection::Ai => {
            let patch: AiSettingsPatch = serde_json::from_value(patch)?;
            patch.apply(&mut settings.ai);
        }
        SettingsSection::Overlay => {
            let patch: OverlaySettingsPatch = serde_json::from_value(patch)?;
            patch.apply(&mut settings.overlay);
        }
        _ => {
            apply_json_merge_patch(&mut settings, section, patch)?;
        }
    }

    settings.updated_at = Utc::now();

    let validation = self.validator.validate(&settings);
    if !validation.valid {
        return Err(SettingsError::ValidationFailed(validation.issues));
    }

    self.store.save(&settings).await?;
    *self.cache.write().await = settings.clone();

    self.event_bus.emit(SettingsEvent::Updated {
        section,
        updated_at: settings.updated_at,
    });

    Ok(settings)
}
```

---

## **11. Settings Events**

### **11.1. SettingsEvent**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SettingsEvent {
    Updated {
        section: SettingsSection,
        updated_at: DateTime<utc>,
    },
    Reset {
        section: Option<settingssection>,
        updated_at: DateTime<utc>,
    },
    Imported {
        sections: Vec<settingssection>,
        updated_at: DateTime<utc>,
    },
    ValidationFailed {
        section: Option<settingssection>,
        issues: Vec<settingsvalidationissue>,
    },
}
```

### **11.2. Event consumers**

| **Consumer** | **Event** | **Action** |
|---|---|---|
| **AIOrchestrator** | `settings_updated(ai)` | Reload provider config, budget |
| **PrivacyManager** | `settings_updated(privacy)` | Reload privacy settings |
| **OverlayWindowManager** | `settings_updated(overlay)` | Apply scale/anchor/topmost |
| **BehaviorOrchestrator** | `settings_updated(behavior)` | Reload budget/cooldown/scheduler |
| **AnimationDirector** | `settings_updated(animation)` | Apply FPS/reduce motion/procedural toggles |
| **AssetManager** | `settings_updated(assets)` | Reload validation limits/GC config |
| **HotkeyManager** | `settings_updated(hotkeys)` | Re-register hotkeys |
| **Frontend Stores** | all | Refresh relevant store |

### **11.3. Event bridge**

```rust
pub async fn bridge_settings_events(
    app: AppHandle,
    mut rx: broadcast::Receiver<settingsevent>,
) {
    while let Ok(event) = rx.recv().await {
        match event {
            SettingsEvent::Updated { section, .. } => {
                let _ = app.emit("settings_updated", serde_json::json!({
                    "section": section
                }));
            }
            SettingsEvent::Reset { section, .. } => {
                let _ = app.emit("settings_reset", serde_json::json!({
                    "section": section
                }));
            }
            SettingsEvent::Imported { sections, .. } => {
                let _ = app.emit("settings_import_completed", serde_json::json!({
                    "sections": sections
                }));
            }
            _ => {}
        }
    }
}
```

---

## **12. Secret Handling**

### **12.1. Secret separation**

Settings thường không chứa secret plaintext.

```text
AppSettings.ai.has_api_key = true/false
Actual API key = credentials store encrypted
```

### **12.2. Credential store**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialStoreFile {
    pub schema_version: u32,
    pub ai_provider_api_key: Option<encryptedvalue>,
    pub updated_at: DateTime<utc>,
}
```

### **12.3. AI config update rule**

`settings_update_section(ai)` được phép update:

```text
- base_url
- model
- temperature
- max_tokens
- timeout
- budget
```

Nhưng API key update nên đi qua command AI riêng:

```text
ai_update_config
```

hoặc command settings credential riêng nếu triển khai:

```text
settings_update_ai_api_key
```

### **12.4. Safe settings DTO**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettingsSafe {
    pub schema_version: u32,
    pub general: GeneralSettings,
    pub ai: AiSettings,
    pub privacy: PrivacySettings,
    pub overlay: OverlaySettings,
    pub behavior: BehaviorSettings,
    pub animation: AnimationSettings,
    pub assets: AssetSettings,
    pub hotkeys: HotkeySettings,
    pub developer: DeveloperSettings,
    pub updated_at: DateTime<utc>,
}
```

`AiSettings.has_api_key` là flag safe, không phải key.

### **12.5. Export credentials policy**

Default:

```text
settings_export:
  include_credentials = false
```

Nếu user yêu cầu export credentials:

```text
- Cảnh báo mạnh.
- Chỉ export encrypted form.
- Không export plaintext.
```

---

## **13. Import & Export**

### **13.1. SettingsExport**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsExport {
    pub export_version: u32,
    pub exported_at: DateTime<utc>,
    pub app_version: String,
    pub settings_schema_version: u32,
    pub settings: AppSettingsSafe,
    pub includes_credentials: bool,
}
```

### **13.2. Export flow**

```text
User clicks export settings
  ↓
SettingsManager.get_all_safe()
  ↓
Remove credentials
  ↓
Build SettingsExport
  ↓
Write JSON file
  ↓
Emit settings_exported or audit event
```

### **13.3. Import flow**

```text
User selects settings export JSON
  ↓
Parse SettingsExport
  ↓
Validate export_version
  ↓
Migrate settings if needed
  ↓
Validate settings
  ↓
Preview changed sections
  ↓
Confirm import
  ↓
Backup current settings
  ↓
Save imported settings
  ↓
Emit settings_import_completed
```

### **13.4. ImportResult**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub imported_count: u32,
    pub skipped_count: u32,
    pub changed_sections: Vec<settingssection>,
    pub errors: Vec<string>,
}
```

### **13.5. Import safety rules**

```text
- Không import credentials mặc định.
- Nếu imported settings bật prompt_logging_enabled=true, phải force false trừ khi user xác nhận.
- Nếu imported privacy permissions quá permissive, show warning.
- Validate hotkey conflicts trước khi apply.
- Backup current settings trước khi overwrite.
```

---

## **14. Reset Flow**

### **14.1. Reset section**

```rust
pub async fn reset_section(
    &self,
    section: SettingsSection,
) -> Result<appsettings> {
    let mut settings = self.get_all().await?;
    let defaults = AppSettings::default();

    match section {
        SettingsSection::General => settings.general = defaults.general,
        SettingsSection::Ai => settings.ai = defaults.ai,
        SettingsSection::Privacy => settings.privacy = defaults.privacy,
        SettingsSection::Overlay => settings.overlay = defaults.overlay,
        SettingsSection::Behavior => settings.behavior = defaults.behavior,
        SettingsSection::Animation => settings.animation = defaults.animation,
        SettingsSection::Assets => settings.assets = defaults.assets,
        SettingsSection::Hotkeys => settings.hotkeys = defaults.hotkeys,
        SettingsSection::Developer => settings.developer = defaults.developer,
    }

    settings.updated_at = Utc::now();

    self.validator.ensure_valid(&settings)?;
    self.store.save(&settings).await?;
    *self.cache.write().await = settings.clone();

    self.event_bus.emit(SettingsEvent::Reset {
        section: Some(section),
        updated_at: settings.updated_at,
    });

    Ok(settings)
}
```

### **14.2. Reset all**

```text
Reset all:
  1. Backup current settings.
  2. Replace with AppSettings::default().
  3. Preserve encrypted credentials? Default: ask user.
  4. Save.
  5. Emit settings_reset(section=null).
```

### **14.3. Reset policy**

| **Action** | **Credentials** |
|---|---|
| Reset AI section | Ask: keep or remove API key |
| Reset privacy section | Keep credentials, reset permissions |
| Reset all | Ask explicitly |
| Full wipe | Delete credentials |

---

## **15. Frontend Settings UI**

### **15.1. Settings pages**

```text
Settings
├─ General
│  ├─ Language
│  ├─ Theme
│  ├─ Launch on startup
│  └─ Confirm before quit
│
├─ AI
│  ├─ Provider base URL
│  ├─ API key input
│  ├─ Model
│  ├─ Temperature
│  ├─ Max tokens
│  ├─ Daily budget
│  └─ Test connection
│
├─ Privacy
│  ├─ Privacy modes
│  ├─ Permissions
│  ├─ Retention
│  └─ Export/Delete data
│
├─ Overlay
│  ├─ Scale
│  ├─ Anchor
│  ├─ Click-through
│  ├─ Auto-hide
│  └─ Bubble
│
├─ Behavior
│  ├─ Proactivity
│  ├─ Focus reminders
│  ├─ Daily greeting
│  ├─ Quiet hours
│  └─ User rules
│
├─ Animation
│  ├─ FPS
│  ├─ Reduce motion
│  ├─ Blink/look-at/breathing
│  └─ Crossfade
│
├─ Assets
│  ├─ Validation limits
│  ├─ Thumbnail generation
│  └─ Cleanup policy
│
├─ Hotkeys
│  ├─ Binding list
│  ├─ Conflict check
│  └─ Reset defaults
│
└─ Developer
   ├─ Developer mode
   ├─ Debug panels
   ├─ IPC monitor
   └─ Logging
```

### **15.2. Settings store**

```typescript
interface SettingsStore {
  settings: AppSettings | null;
  loading: boolean;

  refresh: () => Promise<void>;
  updateSection: (
    section: SettingsSection,
    patch: unknown,
  ) => Promise<void>;
  resetSection: (section: SettingsSection) => Promise<void>;
  resetAll: () => Promise<void>;
  exportSettings: () => Promise<settingsexport>;
  importSettings: (data: SettingsExport) => Promise<importresult>;
}

export const useSettingsStore = create<settingsstore>((set, get) => ({
  settings: null,
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const settings = await invoke<appsettings>("settings_get_all");
      set({ settings });
    } finally {
      set({ loading: false });
    }
  },

  updateSection: async (section, patch) => {
    const settings = await invoke<appsettings>("settings_update_section", {
      section,
      patch,
    });
    set({ settings });
  },

  resetSection: async (section) => {
    const settings = await invoke<appsettings>("settings_reset_section", {
      section,
    });
    set({ settings });
  },

  resetAll: async () => {
    const settings = await invoke<appsettings>("settings_reset_all");
    set({ settings });
  },

  exportSettings: async () => {
    return await invoke<settingsexport>("settings_export");
  },

  importSettings: async (data) => {
    const result = await invoke<importresult>("settings_import", data);
    await get().refresh();
    return result;
  },
}));
```

### **15.3. UI validation**

Frontend validation chỉ để UX nhanh. Backend validation vẫn là source of truth.

```text
Frontend:
- disable Save nếu number ngoài range
- show inline warning

Backend:
- validate lại toàn bộ
- reject nếu invalid
```

---

## **16. Backend: SettingsManager**

### **16.1. Module trách nhiệm**

```rust
pub struct SettingsManager {
    store: Arc<settingsstore>,
    cache: Arc<rwlock<appsettings>>,
    validator: Arc<settingsvalidator>,
    migrations: Arc<settingsmigrationregistry>,
    credentials: Arc<credentialstore>,
    event_bus: Arc<settingseventbus>,
    audit: Arc<settingsauditlogger>,
}
```

### **16.2. Public methods**

```rust
impl SettingsManager {
    pub async fn init(config: SettingsConfig) -> Result<self>;

    pub async fn get_all(&self) -> Result<appsettingssafe>;
    pub async fn get_section(&self, section: SettingsSection) -> Result<serde_json::value>;

    pub async fn update_section(
        &self,
        section: SettingsSection,
        patch: serde_json::Value,
    ) -> Result<appsettingssafe>;

    pub async fn reset_section(
        &self,
        section: SettingsSection,
    ) -> Result<appsettingssafe>;

    pub async fn reset_all(
        &self,
        preserve_credentials: bool,
    ) -> Result<appsettingssafe>;

    pub async fn export_settings(&self) -> Result<settingsexport>;
    pub async fn import_settings(&self, export: SettingsExport) -> Result<importresult>;

    pub async fn validate_settings(
        &self,
        settings: &AppSettings,
    ) -> Result<settingsvalidationresult>;

    pub async fn reload_from_disk(&self) -> Result<appsettingssafe>;
    pub async fn flush(&self) -> Result<()>;

    pub fn subscribe_events(&self) -> broadcast::Receiver<settingsevent>;
}
```

### **16.3. Init flow**

```rust
pub async fn init(config: SettingsConfig) -> Result<self> {
    let store = Arc::new(SettingsStore::new(config.settings_path));
    let validator = Arc::new(SettingsValidator);
    let migrations = Arc::new(SettingsMigrationRegistry::default());

    let settings = match store.load_raw().await {
        Ok(raw) => {
            let migrated = migrations.migrate_to_latest(raw)?;
            validator.ensure_valid(&migrated)?;
            migrated
        }
        Err(e) => {
            tracing::warn!("settings load failed, using default: {}", e);
            let defaults = AppSettings::default();
            store.save(&defaults).await?;
            defaults
        }
    };

    Ok(Self {
        store,
        cache: Arc::new(RwLock::new(settings)),
        validator,
        migrations,
        credentials: Arc::new(CredentialStore::new(config.credentials_path)),
        event_bus: Arc::new(SettingsEventBus::new()),
        audit: Arc::new(SettingsAuditLogger::new()),
    })
}
```

---

## **17. IPC Contract**

### **17.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `settings_get_all` | `{}` | `AppSettingsSafe` |
| `settings_get_section` | `{ section: SettingsSection }` | `unknown` |
| `settings_update_section` | `{ section: SettingsSection, patch: unknown }` | `AppSettingsSafe` |
| `settings_reset_section` | `{ section: SettingsSection }` | `AppSettingsSafe` |
| `settings_reset_all` | `{ preserve_credentials: boolean }` | `AppSettingsSafe` |
| `settings_export` | `{}` | `SettingsExport` |
| `settings_import` | `SettingsExport` | `ImportResult` |
| `settings_validate` | `AppSettingsSafe` | `SettingsValidationResult` |
| `settings_reload_from_disk` | `{}` | `AppSettingsSafe` |

### **17.2. Rust → Frontend events**

| **Event** | **Payload** |
|---|---|
| `settings_updated` | `{ section: SettingsSection }` |
| `settings_reset` | `{ section?: SettingsSection \| null }` |
| `settings_import_completed` | `ImportResult` |
| `settings_validation_failed` | `SettingsValidationResult` |

### **17.3. TypeScript types**

```typescript
export type SettingsSection =
  | "general"
  | "ai"
  | "privacy"
  | "overlay"
  | "behavior"
  | "animation"
  | "assets"
  | "hotkeys"
  | "developer";

export interface AppSettings {
  schema_version: number;
  general: GeneralSettings;
  ai: AiSettings;
  privacy: PrivacySettings;
  overlay: OverlaySettings;
  behavior: BehaviorSettings;
  animation: AnimationSettings;
  assets: AssetSettings;
  hotkeys: HotkeySettings;
  developer: DeveloperSettings;
  updated_at: string;
}

export interface SettingsExport {
  export_version: number;
  exported_at: string;
  app_version: string;
  settings_schema_version: number;
  settings: AppSettings;
  includes_credentials: boolean;
}
```

### **17.4. Security rule**

```text
settings_get_all không bao giờ trả API key plaintext.
settings_export không include credentials mặc định.
settings_import không tự bật prompt logging hoặc permissive privacy nếu chưa confirm.
```

---

## **18. Integration Matrix**

| **Subsystem** | **Settings section** | **Behavior** |
|---|---|---|
| **AIInteraction** | `ai` | Reload provider config, budget, fallback |
| **PrivacySystem** | `privacy` | Reload permissions/modes/retention |
| **OverlayWindow** | `overlay` | Apply scale, anchor, click-through, auto-hide |
| **BehaviorOrchestrator** | `behavior` | Reload proactive budget, scheduler, cooldown |
| **AnimationRuntime** | `animation` | Apply FPS, reduce motion, procedural toggles |
| **AssetSystem** | `assets` | Reload size limits, cleanup policy |
| **HotkeySystem** | `hotkeys` | Register/unregister bindings |
| **Frontend UI** | all | Refresh form state |
| **Logging/Audit** | `developer` | Enable/disable debug logs |

---

## **19. Logging & Audit**

### **19.1. Settings audit schema**

```sql
CREATE TABLE settings_audit_log (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    section TEXT,
    changed_fields_json TEXT,
    reason TEXT,
    created_at DATETIME NOT NULL
);

CREATE INDEX idx_settings_audit_created ON settings_audit_log(created_at);
CREATE INDEX idx_settings_audit_section ON settings_audit_log(section);
```

### **19.2. Audit events**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SettingsAuditEvent {
    SectionUpdated {
        section: SettingsSection,
        changed_fields: Vec<string>,
    },
    SectionReset {
        section: SettingsSection,
    },
    AllReset,
    SettingsImported {
        sections: Vec<settingssection>,
    },
    SettingsExported,
    ValidationFailed {
        section: Option<settingssection>,
    },
    CorruptSettingsRecovered {
        backup_path: String,
    },
}
```

### **19.3. Privacy rules**

Không log:

```text
- API key
- credential encrypted payload nếu không cần
- full settings JSON nếu chứa sensitive config
```

Cho phép log:

```text
- section name
- changed field names
- validation issue codes
- import/export action
```

---

## **20. Error Handling**

### **20.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum SettingsError {
    #[error("Settings not found")]
    NotFound,

    #[error("Settings parse failed: {0}")]
    ParseFailed(String),

    #[error("Settings validation failed")]
    ValidationFailed(Vec<settingsvalidationissue>),

    #[error("Settings migration failed: {0}")]
    MigrationFailed(String),

    #[error("Settings persistence failed: {0}")]
    PersistenceFailed(String),

    #[error("Invalid settings section: {0}")]
    InvalidSection(String),

    #[error("Invalid patch: {0}")]
    InvalidPatch(String),

    #[error("Import failed: {0}")]
    ImportFailed(String),

    #[error("Export failed: {0}")]
    ExportFailed(String),

    #[error("Credential operation failed: {0}")]
    CredentialFailed(String),
}
```

### **20.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Settings file missing | Create default |
| JSON parse fail | Backup corrupt, try backup, else default |
| Validation fail on update | Reject update, keep old settings |
| Migration fail | Backup old, use default, show warning |
| Save fail | Keep cache, retry, show error |
| Import invalid | Reject import |
| Credential fail | Do not save secret, ask re-enter |
| Hotkey conflict after settings update | Apply settings but disable conflicting hotkey |

### **20.3. Fail-safe defaults**

Nếu settings unavailable:

```text
- Privacy: restrictive default
- AI: disabled or fallback only if no safe config
- Overlay: default visible safe anchor
- Behavior: proactive disabled
- Developer logging: disabled
```

---

## **21. Performance Considerations**

### **21.1. Runtime cost**

```text
- Settings load: once on startup.
- Settings read: from in-memory cache.
- Settings update: section-level, atomic write.
- Event emit: on update only.
```

### **21.2. Targets**

| **Operation** | **Target** |
|---|---|
| Load settings | < 20ms |
| Get all from cache | < 100μs |
| Update section | < 10ms |
| Validate settings | < 2ms |
| Export settings | < 20ms |
| Emit event | < 50μs |

### **21.3. Debounce**

Frontend settings forms nên debounce update:

```text
- Slider: local update immediately, backend update after 300ms.
- Text input: save on blur or explicit Save button.
- Toggle: immediate update OK.
```

---

## **22. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── settings/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── store.rs
│               ├── defaults.rs
│               ├── validator.rs
│               ├── patch.rs
│               ├── migration/
│               │   ├── mod.rs
│               │   ├── registry.rs
│               │   ├── v1_to_v2.rs
│               │   └── v2_to_v3.rs
│               ├── credentials.rs
│               ├── export.rs
│               ├── import.rs
│               ├── events.rs
│               ├── audit.rs
│               └── errors.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── settings_commands.rs
│
├── src/
│   ├── settings/
│   │   ├── SettingsApp.tsx
│   │   ├── pages/
│   │   │   ├── General.tsx
│   │   │   ├── AI.tsx
│   │   │   ├── Privacy.tsx
│   │   │   ├── Overlay.tsx
│   │   │   ├── Behavior.tsx
│   │   │   ├── Animation.tsx
│   │   │   ├── Assets.tsx
│   │   │   ├── Hotkeys.tsx
│   │   │   └── Developer.tsx
│   │   ├── components/
│   │   │   ├── SettingsLayout.tsx
│   │   │   ├── SettingsSection.tsx
│   │   │   ├── SettingRow.tsx
│   │   │   ├── DangerZone.tsx
│   │   │   └── ValidationIssues.tsx
│   │   └── stores/
│   │       └── settingsStore.ts
│   │
│   └── shared/
│       └── types/
│           └── settings.ts
│
└── docs/
    └── settings-system.md
```

---

## **23. Implementation Checklist**

### **23.1. P0 Core**

- [ ] Define `AppSettings`.
- [ ] Define all settings section structs.
- [ ] Define `SettingsSection`.
- [ ] Implement defaults.
- [ ] Implement `SettingsStore`.
- [ ] Implement atomic save.
- [ ] Implement corrupt backup.
- [ ] Implement `SettingsManager`.
- [ ] Implement settings cache.

### **23.2. P0 Validation**

- [ ] Implement `SettingsValidator`.
- [ ] Validate AI settings.
- [ ] Validate overlay settings.
- [ ] Validate behavior settings.
- [ ] Validate animation settings.
- [ ] Validate asset settings.
- [ ] Validate hotkey duplicate IDs.

### **23.3. P0 IPC**

- [ ] `settings_get_all`.
- [ ] `settings_get_section`.
- [ ] `settings_update_section`.
- [ ] `settings_reset_section`.
- [ ] `settings_reset_all`.
- [ ] `settings_validate`.
- [ ] Event `settings_updated`.
- [ ] Event `settings_reset`.

### **23.4. P0 Integration**

- [ ] AI reloads config on `settings_updated(ai)`.
- [ ] Overlay applies settings on `settings_updated(overlay)`.
- [ ] Behavior reloads budget/scheduler on `settings_updated(behavior)`.
- [ ] Privacy reloads permission on `settings_updated(privacy)`.
- [ ] Hotkey manager reloads bindings on `settings_updated(hotkeys)`.

### **23.5. P1 UI**

- [ ] Settings layout.
- [ ] General page.
- [ ] AI page.
- [ ] Privacy page.
- [ ] Overlay page.
- [ ] Behavior page.
- [ ] Animation page.
- [ ] Assets page.
- [ ] Hotkeys page.
- [ ] Developer page.

### **23.6. P1 Migration**

- [ ] Implement migration registry.
- [ ] Add version field.
- [ ] Migration tests.
- [ ] Backup before migration.

### **23.7. P1 Import/Export**

- [ ] `settings_export`.
- [ ] `settings_import`.
- [ ] Preview changed sections.
- [ ] Import safety warnings.
- [ ] Exclude credentials by default.

### **23.8. P2 Polish**

- [ ] Settings search.
- [ ] Advanced mode sections.
- [ ] Config diff viewer.
- [ ] Restore from backup UI.
- [ ] Per-character settings override.
- [ ] Cloud sync disabled by default, optional future only.

---

## **24. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **SettingsManager** | Module trung tâm quản lý cấu hình app. |
| **AppSettings** | Object chứa toàn bộ settings. |
| **SettingsSection** | Một nhóm settings như ai, privacy, overlay. |
| **SettingsStore** | Lớp đọc/ghi settings xuống disk. |
| **SettingsValidator** | Lớp kiểm tra settings hợp lệ. |
| **SettingsMigration** | Logic nâng schema settings cũ lên mới. |
| **SettingsPatch** | Partial update cho một section. |
| **CredentialStore** | Storage mã hóa cho secret như API key. |
| **AppSettingsSafe** | Settings đã loại bỏ secret, an toàn gửi frontend. |
| **Atomic Write** | Ghi file qua temp rồi rename để tránh corrupt. |

---

# **Phụ lục A: Flow update settings section**

```text
Frontend user changes overlay scale
       ↓
Frontend calls:
  settings_update_section({
    section: "overlay",
    patch: { scale: 1.2 }
  })
       ↓
IPC handler validates payload shape
       ↓
SettingsManager.update_section
       ↓
Load current settings from cache
       ↓
Apply overlay patch
       ↓
Validate full AppSettings
       ↓
If invalid:
  - reject
  - return IpcError settings.validation_failed
       ↓
If valid:
  - atomic save app_settings.json
  - update in-memory cache
  - audit changed section
  - emit SettingsEvent::Updated(overlay)
       ↓
Event bridge emits:
  settings_updated { section: "overlay" }
       ↓
OverlayWindowManager receives event
       ↓
Apply scale/anchor/topmost behavior
       ↓
Frontend store refreshes settings
```

---

# **Phụ lục B: Flow app startup settings load**

```text
App startup
       ↓
SettingsManager.init
       ↓
Check user_data/settings/app_settings.json
       ↓
If exists:
  - read file
  - parse JSON
  - migrate to latest schema
  - validate
       ↓
If valid:
  - cache settings
  - continue startup
       ↓
If parse/migration/validation fails:
  - backup corrupt file
  - try app_settings.backup.json
       ↓
If backup valid:
  - load backup
       ↓
Else:
  - use AppSettings::default()
  - save default
       ↓
Load credential store separately
       ↓
Set ai.has_api_key = credential exists
       ↓
Subsystems receive settings snapshot
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. AppSettings mẫu**

```json
{
  "schema_version": 1,
  "general": {
    "language": "vi",
    "theme": "system",
    "launch_on_startup": false,
    "start_minimized": false,
    "check_updates": true,
    "confirm_before_quit": true
  },
  "ai": {
    "enabled": true,
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "temperature": 0.7,
    "max_tokens": 500,
    "timeout_seconds": 30,
    "daily_limit_cents": 50,
    "max_calls_per_minute": 6,
    "max_calls_per_hour": 60,
    "use_desktop_context": true,
    "use_memory_context": true,
    "fallback_enabled": true,
    "has_api_key": false
  },
  "privacy": {
    "schema_version": 1,
    "private_mode": false,
    "quiet_mode": false,
    "streamer_mode": false,
    "restricted_mode": false,
    "allow_ai_in_private_mode": false,
    "allow_memory_read_in_private_mode": false,
    "allow_memory_write_in_private_mode": false,
    "redact_debug_logs": true,
    "encrypt_sensitive_memory": true,
    "audit_log_retention_days": 30,
    "ai_history_retention_days": 30,
    "updated_at": "2026-05-27T00:57:00Z"
  },
  "overlay": {
    "show_on_start": true,
    "always_on_top": true,
    "click_through_enabled": true,
    "default_anchor": "taskbar_right",
    "scale": 1.0,
    "auto_hide_fullscreen_game": true,
    "auto_hide_meeting": true,
    "lower_on_fullscreen_video": true,
    "remember_position": true,
    "enable_snap": true,
    "snap_threshold_px": 30,
    "bubble_enabled": true,
    "bubble_max_chars": 180,
    "bubble_default_duration_ms": 6000
  },
  "behavior": {
    "proactive_enabled": true,
    "daily_greeting_enabled": true,
    "focus_reminder_enabled": true,
    "periodic_checkin_enabled": true,
    "max_proactive_per_day": 8,
    "max_focus_reminders_per_day": 4,
    "global_proactive_cooldown_minutes": 15,
    "focus_reminder_interval_minutes": 45,
    "periodic_checkin_interval_minutes": 60,
    "daily_greeting_hour": 8,
    "daily_greeting_minute": 30,
    "quiet_hours_enabled": false,
    "quiet_hours_start": 23,
    "quiet_hours_end": 7
  },
  "animation": {
    "target_fps": 60,
    "reduce_motion": false,
    "idle_animation_id": null,
    "default_talking_animation_id": null,
    "expression_intensity": 1.0,
    "blink_enabled": true,
    "look_at_cursor_enabled": true,
    "breathing_enabled": true,
    "spring_bones_enabled": true,
    "crossfade_ms": 200
  },
  "assets": {
    "auto_cleanup_enabled": true,
    "temp_retention_hours": 24,
    "trash_retention_days": 30,
    "cache_retention_days": 14,
    "max_vrm_size_mb": 150,
    "max_animation_size_mb": 50,
    "generate_thumbnails": true,
    "validate_on_startup": false
  },
  "hotkeys": {
    "enabled": true,
    "bindings": [
      {
        "hotkey_id": "toggle_overlay",
        "action": "overlay_toggle",
        "accelerator": "Ctrl+Shift+H",
        "enabled": true,
        "scope": "global"
      },
      {
        "hotkey_id": "toggle_private_mode",
        "action": "privacy_toggle_private",
        "accelerator": "Ctrl+Shift+P",
        "enabled": true,
        "scope": "global"
      }
    ]
  },
  "developer": {
    "developer_mode": false,
    "debug_overlay_enabled": false,
    "show_behavior_debug_panel": false,
    "show_state_debug_panel": false,
    "debug_logging_enabled": false,
    "prompt_logging_enabled": false,
    "redact_debug_logs": true,
    "ipc_event_monitor_enabled": false,
    "performance_overlay_enabled": false
  },
  "updated_at": "2026-05-27T00:57:00Z"
}
```

## **C.2. settings_update_section payload mẫu**

```json
{
  "section": "overlay",
  "patch": {
    "scale": 1.2,
    "default_anchor": "bottom_right",
    "bubble_default_duration_ms": 7000
  }
}
```

## **C.3. SettingsValidationResult mẫu**

```json
{
  "valid": false,
  "issues": [
    {
      "section": "animation",
      "field": "target_fps",
      "code": "invalid_fps",
      "message": "target_fps must be one of 15, 30, 60, 120",
      "severity": "error"
    }
  ]
}
```

## **C.4. SettingsExport mẫu**

```json
{
  "export_version": 1,
  "exported_at": "2026-05-27T00:57:00Z",
  "app_version": "0.1.0",
  "settings_schema_version": 1,
  "includes_credentials": false,
  "settings": {
    "schema_version": 1,
    "general": {
      "language": "vi",
      "theme": "system"
    }
  }
}
```

## **C.5. settings_updated event mẫu**

```json
{
  "section": "overlay"
}
```

---
