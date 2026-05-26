# **Chiro-Pet Hotkey System**

> Tài liệu thiết kế chính thức cho **Hotkey System** của **Chiro-Pet**.  
> Hệ thống này quản lý toàn bộ phím tắt của app: **global hotkeys**, **overlay-scoped hotkeys**, **chat-scoped hotkeys**, conflict detection, customization, persistence và dispatch action.
>
> **Nguyên tắc lõi:** Hotkey System chỉ là lớp **input shortcut router**. Nó không tự thực thi business logic trực tiếp. Mỗi hotkey sau khi trigger phải được map thành **command/action hợp lệ**, đi qua **permission**, **privacy policy**, **behavior policy** và subsystem tương ứng.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Hotkey Architecture](#3-hotkey-architecture)
4. [Hotkey Types](#4-hotkey-types)
5. [Data Model](#5-data-model)
6. [Default Hotkeys](#6-default-hotkeys)
7. [Hotkey Scope System](#7-hotkey-scope-system)
8. [Accelerator Format](#8-accelerator-format)
9. [Registration Flow](#9-registration-flow)
10. [Conflict Detection](#10-conflict-detection)
11. [Hotkey Action Registry](#11-hotkey-action-registry)
12. [Dispatch Pipeline](#12-dispatch-pipeline)
13. [Customization Flow](#13-customization-flow)
14. [Persistence](#14-persistence)
15. [Privacy & Safety](#15-privacy--safety)
16. [Platform Adapter: Windows](#16-platform-adapter-windows)
17. [Backend: HotkeyManager](#17-backend-hotkeymanager)
18. [IPC Contract](#18-ipc-contract)
19. [Frontend Hotkey UI](#19-frontend-hotkey-ui)
20. [Integration Matrix](#20-integration-matrix)
21. [Logging & Audit](#21-logging--audit)
22. [Error Handling](#22-error-handling)
23. [Performance Considerations](#23-performance-considerations)
24. [File Structure](#24-file-structure)
25. [Implementation Checklist](#25-implementation-checklist)
26. [Glossary](#26-glossary)
27. [Phụ lục A: Flow register hotkey](#phụ-lục-a-flow-register-hotkey)
28. [Phụ lục B: Flow hotkey triggered](#phụ-lục-b-flow-hotkey-triggered)
29. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)
30. [Tổng kết tài liệu đã tổng hợp và còn lại](#30-tổng-kết-tài-liệu-đã-tổng-hợp-và-còn-lại)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Hotkey System của **Chiro-Pet** phải:

- Quản lý **global hotkeys** hoạt động khi app không focus.
- Quản lý **overlay hotkeys** khi overlay đang focus hoặc hover.
- Quản lý **chat hotkeys** khi chat panel đang focus.
- Cho phép user customize hotkey trong Settings.
- Detect conflict giữa:
  - hotkey nội bộ app
  - hotkey duplicate trong settings
  - global hotkey đã bị OS/app khác chiếm
- Register/unregister hotkey runtime không cần restart app.
- Persist hotkey bindings qua settings.
- Dispatch hotkey thành action an toàn.
- Tôn trọng **Privacy Mode**, **Restricted Mode**, **Streamer Mode**.
- Không để hotkey trigger action nguy hiểm ngoài ý muốn.
- Có fallback nếu global registration fail.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Hotkey schema.
- Scope system.
- Accelerator format.
- Registration lifecycle.
- Conflict detection.
- Action registry.
- Dispatch flow.
- Settings integration.
- IPC contract.
- Frontend UI.
- Windows adapter.

Tài liệu này không mô tả chi tiết:

- Overlay window implementation.
- Privacy policy nội bộ.
- Behavior action lifecycle.
- Settings migration chi tiết.

Các phần đó thuộc subsystem riêng.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Hotkey chỉ route action** | Không chứa business logic trực tiếp trong hotkey handler. |
| **2** | **Action phải allowlist** | Hotkey chỉ gọi action có trong `HotkeyActionRegistry`. |
| **3** | **Conflict check trước register** | Không register hotkey nếu duplicate nội bộ hoặc OS reject. |
| **4** | **Runtime reconfigurable** | User đổi hotkey không cần restart app. |
| **5** | **Scope-aware** | Global, overlay, chat có quy tắc khác nhau. |
| **6** | **Privacy-aware** | Hotkey không được bypass Private/Restricted/Streamer policy. |
| **7** | **Fail gracefully** | Nếu register fail, disable binding và báo UI. |
| **8** | **No unsafe default** | Default hotkey không dùng tổ hợp dễ bấm nhầm hoặc xung đột lớn. |
| **9** | **Auditable** | Register fail, conflict, trigger action quan trọng phải log. |
| **10** | **Settings source of truth** | Hotkey config lấy từ Settings System. |

### **2.2. Anti-pattern cần tránh**

- ❌ Hardcode hotkey trong nhiều file.
- ❌ Cho frontend tự register global hotkey trực tiếp.
- ❌ Cho hotkey gọi function nội bộ không qua manager.
- ❌ Dùng phím đơn như `F1`, `Esc`, `Space` làm global hotkey.
- ❌ Không unregister hotkey cũ khi user đổi binding.
- ❌ Không detect duplicate accelerator.
- ❌ Hotkey vẫn mở chat trong Restricted Mode.
- ❌ Hotkey hiện bubble riêng tư trong Streamer Mode.
- ❌ Không báo user khi hotkey bị app khác chiếm.
- ❌ Không persist enabled/disabled state.

---

## **3. Hotkey Architecture**

```text
┌──────────────────────────────────────────────────────────────┐
│                       SETTINGS UI                             │
│  - Hotkey list                                                │
│  - Edit accelerator                                           │
│  - Conflict warning                                           │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                    IPC HOTKEY COMMANDS                        │
│  - hotkey_list                                                │
│  - hotkey_update                                              │
│  - hotkey_check_conflict                                      │
│  - hotkey_reset_defaults                                      │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                       HOTKEY MANAGER                          │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Binding Store                                          │  │
│  │ - load from Settings.hotkeys                           │  │
│  │ - save updates                                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Conflict Detector                                      │  │
│  │ - duplicate internal                                   │  │
│  │ - OS registration failure                              │  │
│  │ - reserved accelerator                                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Platform Adapter                                       │  │
│  │ - register global shortcut                             │  │
│  │ - unregister                                           │  │
│  │ - receive trigger                                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Action Dispatcher                                      │  │
│  │ - map hotkey_id → action                               │  │
│  │ - privacy check                                        │  │
│  │ - route to subsystem                                   │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                       SUBSYSTEMS                              │
│ Overlay / Privacy / Behavior / AI / Settings / Animation      │
└──────────────────────────────────────────────────────────────┘
```

---

## **4. Hotkey Types**

### **4.1. Hotkey categories**

| **Type** | **Mô tả** | **Ví dụ** |
|---|---|---|
| **Global** | Hoạt động dù app không focus | Toggle overlay |
| **Overlay** | Chỉ hoạt động khi overlay focused/hovered | Open radial menu |
| **Chat** | Chỉ hoạt động trong chat panel | Send message |
| **Settings** | Chỉ hoạt động trong settings window | Save/reset form |
| **Developer** | Chỉ khi developer mode bật | Toggle debug panel |

### **4.2. Hotkey scope**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyScope {
    Global,
    Overlay,
    Chat,
    Settings,
    Developer,
}
```

### **4.3. Registration method by scope**

| **Scope** | **Register ở đâu** | **Ghi chú** |
|---|---|---|
| **Global** | Rust backend via Tauri/global shortcut | OS-level |
| **Overlay** | Frontend keydown listener | Window-level |
| **Chat** | Frontend keydown listener | Input-aware |
| **Settings** | Frontend keydown listener | Form-aware |
| **Developer** | Frontend + backend flag | Chỉ bật khi dev mode |

---

## **5. Data Model**

### **5.1. HotkeyBinding**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub hotkey_id: String,
    pub action: HotkeyActionId,
    pub accelerator: String,
    pub enabled: bool,
    pub scope: HotkeyScope,
    pub editable: bool,
    pub description: String,
    pub category: HotkeyCategory,
    pub created_at: DateTime<utc>,
    pub updated_at: DateTime<utc>,
}
```

### **5.2. HotkeyActionId**

```rust
pub type HotkeyActionId = String;
```

Ví dụ:

```text
overlay_toggle
overlay_show
overlay_hide
chat_open
chat_focus_input
privacy_toggle_private
privacy_toggle_quiet
privacy_toggle_streamer
behavior_quick_checkin
settings_open
developer_toggle_debug_overlay
```

### **5.3. HotkeyCategory**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyCategory {
    Overlay,
    Chat,
    Privacy,
    Behavior,
    Settings,
    Developer,
}
```

### **5.4. HotkeyStatus**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyStatus {
    pub hotkey_id: String,
    pub registered: bool,
    pub enabled: bool,
    pub conflict: Option<hotkeyconflictresult>,
    pub last_triggered_at: Option<datetime<utc>>,
}
```

### **5.5. HotkeyConflictResult**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyConflictResult {
    pub has_conflict: bool,
    pub conflict_type: Option<hotkeyconflicttype>,
    pub conflicting_hotkey_id: Option<string>,
    pub conflicting_action: Option<string>,
    pub reason: Option<string>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyConflictType {
    InternalDuplicate,
    ReservedByApp,
    ReservedByOs,
    RegistrationFailed,
    InvalidAccelerator,
}
```

### **5.6. TypeScript types**

```typescript
export type HotkeyScope =
  | "global"
  | "overlay"
  | "chat"
  | "settings"
  | "developer";

export type HotkeyCategory =
  | "overlay"
  | "chat"
  | "privacy"
  | "behavior"
  | "settings"
  | "developer";

export interface HotkeyBinding {
  hotkey_id: string;
  action: string;
  accelerator: string;
  enabled: boolean;
  scope: HotkeyScope;
  editable: boolean;
  description: string;
  category: HotkeyCategory;
  created_at: string;
  updated_at: string;
}

export interface HotkeyConflictResult {
  has_conflict: boolean;
  conflict_type?: string | null;
  conflicting_hotkey_id?: string | null;
  conflicting_action?: string | null;
  reason?: string | null;
}
```

---

## **6. Default Hotkeys**

### **6.1. Default binding list**

| **Hotkey ID** | **Action** | **Default accelerator** | **Scope** |
|---|---|---|---|
| `toggle_overlay` | `overlay_toggle` | `Ctrl+Shift+H` | Global |
| `open_chat` | `chat_open` | `Ctrl+Shift+C` | Global |
| `toggle_private_mode` | `privacy_toggle_private` | `Ctrl+Shift+P` | Global |
| `toggle_quiet_mode` | `privacy_toggle_quiet` | `Ctrl+Shift+Q` | Global |
| `toggle_streamer_mode` | `privacy_toggle_streamer` | `Ctrl+Shift+S` | Global |
| `quick_checkin` | `behavior_quick_checkin` | `Ctrl+Shift+M` | Global |
| `hide_bubble` | `overlay_hide_bubble` | `Esc` | Overlay |
| `send_chat` | `chat_send_message` | `Enter` | Chat |
| `newline_chat` | `chat_insert_newline` | `Shift+Enter` | Chat |
| `close_chat` | `chat_close` | `Esc` | Chat |
| `toggle_debug_overlay` | `developer_toggle_debug_overlay` | `Ctrl+Shift+D` | Developer |

### **6.2. Default JSON**

```json
[
  {
    "hotkey_id": "toggle_overlay",
    "action": "overlay_toggle",
    "accelerator": "Ctrl+Shift+H",
    "enabled": true,
    "scope": "global",
    "editable": true,
    "description": "Ẩn/hiện companion overlay",
    "category": "overlay"
  },
  {
    "hotkey_id": "open_chat",
    "action": "chat_open",
    "accelerator": "Ctrl+Shift+C",
    "enabled": true,
    "scope": "global",
    "editable": true,
    "description": "Mở chat với character",
    "category": "chat"
  },
  {
    "hotkey_id": "toggle_private_mode",
    "action": "privacy_toggle_private",
    "accelerator": "Ctrl+Shift+P",
    "enabled": true,
    "scope": "global",
    "editable": true,
    "description": "Bật/tắt Private Mode",
    "category": "privacy"
  }
]
```

### **6.3. Quan điểm thiết kế**

Không dùng các phím mặc định như:

```text
Alt+Tab
Ctrl+C
Ctrl+V
Ctrl+S
Ctrl+P
Win+*
F5
Esc global
```

Lý do: dễ xung đột với OS hoặc app khác. Với global hotkey, nên dùng tổ hợp **3 phím**.

---

## **7. Hotkey Scope System**

### **7.1. Scope rules**

| **Scope** | **Khi nào active** |
|---|---|
| **Global** | App chạy nền, không cần focus |
| **Overlay** | Overlay focused, hovered hoặc pointer over opaque region |
| **Chat** | Chat panel focused |
| **Settings** | Settings window focused |
| **Developer** | Developer mode enabled và app focused |

### **7.2. Scope priority**

Nếu nhiều scope cùng nhận một accelerator:

```text
1. Chat
2. Settings
3. Overlay
4. Developer
5. Global
```

Ví dụ:

```text
Enter trong chat = send message
Không được dispatch thành global action
```

### **7.3. ScopeContext**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyScopeContext {
    pub active_window: ActiveWindowKind,
    pub overlay_hovered: bool,
    pub chat_focused: bool,
    pub settings_focused: bool,
    pub developer_mode: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActiveWindowKind {
    Overlay,
    Chat,
    Settings,
    Other,
    None,
}
```

### **7.4. Scope evaluation**

```rust
pub fn scope_active(scope: HotkeyScope, ctx: &HotkeyScopeContext) -> bool {
    match scope {
        HotkeyScope::Global => true,
        HotkeyScope::Overlay => ctx.active_window == ActiveWindowKind::Overlay || ctx.overlay_hovered,
        HotkeyScope::Chat => ctx.chat_focused,
        HotkeyScope::Settings => ctx.settings_focused,
        HotkeyScope::Developer => ctx.developer_mode,
    }
}
```

---

## **8. Accelerator Format**

### **8.1. Format chuẩn**

Dùng chuỗi:

```text
Ctrl+Shift+H
Alt+Space
Ctrl+Alt+P
Shift+Enter
Esc
```

### **8.2. Modifier hợp lệ**

```text
Ctrl
Shift
Alt
Meta
```

Trên Windows:

```text
Meta = Win key
```

Nhưng MVP nên **không dùng Meta/Win** làm default.

### **8.3. Key hợp lệ**

```text
A-Z
0-9
F1-F24
Enter
Esc
Space
Tab
Backspace
Delete
Insert
Home
End
PageUp
PageDown
ArrowUp
ArrowDown
ArrowLeft
ArrowRight
```

### **8.4. Accelerator parser**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct ParsedAccelerator {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub meta: bool,
    pub key: String,
}
```

### **8.5. Parse pseudocode**

```rust
pub fn parse_accelerator(input: &str) -> Result<parsedaccelerator> {
    let parts: Vec<string> = input
        .split('+')
        .map(|p| p.trim().to_lowercase())
        .collect();

    if parts.is_empty() {
        return Err(anyhow!("empty accelerator"));
    }

    let mut parsed = ParsedAccelerator {
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
        key: String::new(),
    };

    for part in parts {
        match part.as_str() {
            "ctrl" | "control" => parsed.ctrl = true,
            "shift" => parsed.shift = true,
            "alt" => parsed.alt = true,
            "meta" | "win" | "cmd" => parsed.meta = true,
            key => {
                if !parsed.key.is_empty() {
                    return Err(anyhow!("multiple main keys"));
                }
                parsed.key = normalize_key(key)?;
            }
        }
    }

    if parsed.key.is_empty() {
        return Err(anyhow!("missing main key"));
    }

    Ok(parsed)
}
```

### **8.6. Global hotkey validation rule**

Global hotkeys phải có ít nhất:

```text
- 2 modifiers + 1 key
```

Cho phép:

```text
Ctrl+Shift+H
Ctrl+Alt+C
Alt+Shift+M
```

Không cho global:

```text
H
Ctrl+H
Esc
Enter
Space
```

---

## **9. Registration Flow**

### **9.1. Startup registration**

```text
App start
  ↓
SettingsManager loads hotkey settings
  ↓
HotkeyManager loads bindings
  ↓
Validate all accelerators
  ↓
Detect internal duplicates
  ↓
Register global hotkeys with OS
  ↓
Failed registrations marked conflict
  ↓
Emit hotkey_status_updated
```

### **9.2. Runtime update**

```text
User edits hotkey
  ↓
Frontend calls hotkey_update
  ↓
HotkeyManager validates accelerator
  ↓
Check conflict
  ↓
Unregister old accelerator
  ↓
Register new accelerator
  ↓
If success:
    save settings
    emit hotkey_registered / hotkey_updated
  ↓
If fail:
    restore old binding or disable new binding
    return conflict result
```

### **9.3. Register pseudocode**

```rust
pub async fn register_binding(&self, binding: HotkeyBinding) -> Result<()> {
    if !binding.enabled {
        return Ok(());
    }

    let parsed = parse_accelerator(&binding.accelerator)?;
    self.validator.validate_for_scope(&parsed, binding.scope)?;

    let conflict = self.conflict_detector
        .check_binding(&binding, &self.bindings.read().await)
        .await?;

    if conflict.has_conflict {
        return Err(HotkeyError::Conflict(conflict));
    }

    if binding.scope == HotkeyScope::Global {
        self.platform
            .register_global(&binding.accelerator, binding.hotkey_id.clone())
            .await?;
    }

    self.bindings.write().await.insert(binding.hotkey_id.clone(), binding);

    Ok(())
}
```

---

## **10. Conflict Detection**

### **10.1. Conflict types**

| **Conflict** | **Mô tả** |
|---|---|
| **Internal duplicate** | 2 hotkey cùng scope dùng cùng accelerator |
| **Reserved by app** | Accelerator nằm trong reserved list |
| **Reserved by OS** | OS hoặc app khác đang chiếm |
| **Invalid accelerator** | Parse fail hoặc không hợp lệ với scope |
| **Disabled developer action** | Action developer nhưng developer mode off |

### **10.2. Internal duplicate rule**

Conflict nếu:

```text
same accelerator + same active scope
```

Không conflict nếu:

```text
Enter in Chat
Ctrl+Shift+Enter in Global
```

Có thể conflict nếu:

```text
Ctrl+Shift+H global
Ctrl+Shift+H global
```

### **10.3. Reserved list**

```rust
pub fn reserved_accelerators() -> HashSet<string> {
    HashSet::from([
        "Alt+Tab".into(),
        "Alt+F4".into(),
        "Ctrl+Alt+Delete".into(),
        "Win+L".into(),
        "Win+D".into(),
        "Win+Tab".into(),
        "Ctrl+C".into(),
        "Ctrl+V".into(),
        "Ctrl+X".into(),
        "Ctrl+S".into(),
        "Ctrl+P".into(),
    ])
}
```

### **10.4. Conflict detector**

```rust
pub struct HotkeyConflictDetector {
    platform: Arc<dyn hotkeyplatformadapter="">,
}

impl HotkeyConflictDetector {
    pub async fn check_binding(
        &self,
        candidate: &HotkeyBinding,
        existing: &HashMap<string, hotkeybinding="">,
    ) -> Result<hotkeyconflictresult> {
        if parse_accelerator(&candidate.accelerator).is_err() {
            return Ok(conflict(
                HotkeyConflictType::InvalidAccelerator,
                "Invalid accelerator format",
            ));
        }

        if reserved_accelerators().contains(&candidate.accelerator) {
            return Ok(conflict(
                HotkeyConflictType::ReservedByOs,
                "Reserved by OS or common application shortcut",
            ));
        }

        for binding in existing.values() {
            if binding.hotkey_id == candidate.hotkey_id {
                continue;
            }

            if binding.enabled
                && binding.scope == candidate.scope
                && normalize_accel(&binding.accelerator) == normalize_accel(&candidate.accelerator)
            {
                return Ok(HotkeyConflictResult {
                    has_conflict: true,
                    conflict_type: Some(HotkeyConflictType::InternalDuplicate),
                    conflicting_hotkey_id: Some(binding.hotkey_id.clone()),
                    conflicting_action: Some(binding.action.clone()),
                    reason: Some("Duplicate hotkey in same scope".into()),
                });
            }
        }

        if candidate.scope == HotkeyScope::Global {
            if !self.platform.can_register(&candidate.accelerator).await {
                return Ok(conflict(
                    HotkeyConflictType::RegistrationFailed,
                    "OS rejected this global shortcut",
                ));
            }
        }

        Ok(HotkeyConflictResult {
            has_conflict: false,
            conflict_type: None,
            conflicting_hotkey_id: None,
            conflicting_action: None,
            reason: None,
        })
    }
}
```

---

## **11. Hotkey Action Registry**

### **11.1. Action registry responsibility**

Hotkey action registry định nghĩa action nào được phép gọi bằng hotkey.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyActionDefinition {
    pub action_id: String,
    pub display_name: String,
    pub description: String,
    pub category: HotkeyCategory,
    pub allowed_scopes: Vec<hotkeyscope>,
    pub requires_privacy_check: bool,
    pub requires_developer_mode: bool,
}
```

### **11.2. Default actions**

| **Action ID** | **Category** | **Allowed scopes** |
|---|---|---|
| `overlay_toggle` | Overlay | Global, Overlay |
| `overlay_show` | Overlay | Global |
| `overlay_hide` | Overlay | Global, Overlay |
| `overlay_hide_bubble` | Overlay | Overlay, Chat |
| `chat_open` | Chat | Global, Overlay |
| `chat_close` | Chat | Chat |
| `chat_send_message` | Chat | Chat |
| `chat_insert_newline` | Chat | Chat |
| `privacy_toggle_private` | Privacy | Global |
| `privacy_toggle_quiet` | Privacy | Global |
| `privacy_toggle_streamer` | Privacy | Global |
| `behavior_quick_checkin` | Behavior | Global, Overlay |
| `settings_open` | Settings | Global |
| `developer_toggle_debug_overlay` | Developer | Developer |

### **11.3. Registry check**

```rust
pub fn validate_action_for_scope(
    action: &HotkeyActionDefinition,
    scope: HotkeyScope,
) -> Result<()> {
    if !action.allowed_scopes.contains(&scope) {
        return Err(anyhow!("action not allowed in this scope"));
    }

    Ok(())
}
```

---

## **12. Dispatch Pipeline**

### **12.1. Dispatch flow**

```text
Hotkey triggered
  ↓
Lookup HotkeyBinding by hotkey_id
  ↓
Check enabled
  ↓
Check scope active
  ↓
Lookup action definition
  ↓
Privacy guard
  ↓
Dispatch to subsystem command
  ↓
Emit hotkey_triggered
  ↓
Audit
```

### **12.2. HotkeyTrigger**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyTrigger {
    pub hotkey_id: String,
    pub action: String,
    pub accelerator: String,
    pub scope: HotkeyScope,
    pub triggered_at: DateTime<utc>,
}
```

### **12.3. Dispatch result**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyDispatchResult {
    pub hotkey_id: String,
    pub action: String,
    pub status: HotkeyDispatchStatus,
    pub reason: Option<string>,
    pub triggered_at: DateTime<utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyDispatchStatus {
    Applied,
    Blocked,
    Ignored,
    Failed,
}
```

### **12.4. Dispatcher pseudocode**

```rust
pub struct HotkeyDispatcher {
    overlay: Arc<overlaywindowmanager>,
    privacy: Arc<privacymanager>,
    behavior: Arc<behaviororchestrator>,
    settings_window: Arc<settingswindowcontroller>,
    developer: Arc<developertoolscontroller>,
}

impl HotkeyDispatcher {
    pub async fn dispatch(
        &self,
        binding: &HotkeyBinding,
        ctx: &HotkeyScopeContext,
    ) -> Result<hotkeydispatchresult> {
        if !binding.enabled {
            return Ok(ignored(binding, "binding_disabled"));
        }

        if !scope_active(binding.scope, ctx) {
            return Ok(ignored(binding, "scope_inactive"));
        }

        match binding.action.as_str() {
            "overlay_toggle" => {
                self.overlay.toggle().await?;
                Ok(applied(binding))
            }

            "overlay_hide" => {
                self.overlay.hide().await?;
                Ok(applied(binding))
            }

            "chat_open" => {
                if self.privacy.is_restricted_mode().await? {
                    return Ok(blocked(binding, "restricted_mode"));
                }

                self.overlay.show_chat_panel().await?;
                Ok(applied(binding))
            }

            "privacy_toggle_private" => {
                let current = self.privacy.get_settings().await?.private_mode;
                self.privacy.set_private_mode(!current).await?;
                Ok(applied(binding))
            }

            "privacy_toggle_quiet" => {
                let current = self.privacy.get_settings().await?.quiet_mode;
                self.privacy.set_quiet_mode(!current).await?;
                Ok(applied(binding))
            }

            "privacy_toggle_streamer" => {
                let current = self.privacy.get_settings().await?.streamer_mode;
                self.privacy.set_streamer_mode(!current).await?;
                Ok(applied(binding))
            }

            "behavior_quick_checkin" => {
                self.behavior
                    .handle_quick_action("quick_checkin".into())
                    .await?;
                Ok(applied(binding))
            }

            "settings_open" => {
                self.settings_window.open().await?;
                Ok(applied(binding))
            }

            "developer_toggle_debug_overlay" => {
                self.developer.toggle_debug_overlay().await?;
                Ok(applied(binding))
            }

            _ => Ok(blocked(binding, "unknown_action")),
        }
    }
}
```

---

## **13. Customization Flow**

### **13.1. User changes hotkey**

```text
User opens Settings → Hotkeys
  ↓
Clicks binding row
  ↓
Frontend enters capture mode
  ↓
User presses key combination
  ↓
Frontend builds accelerator string
  ↓
Call hotkey_check_conflict
  ↓
If no conflict:
    call hotkey_update
  ↓
Backend unregisters old global shortcut
  ↓
Backend registers new global shortcut
  ↓
Settings updated
  ↓
UI refreshes binding
```

### **13.2. Capture mode rules**

Trong capture mode:

```text
- Prevent default browser behavior.
- Show pressed modifiers live.
- Esc cancels capture.
- Backspace clears binding.
- Enter confirms only if valid.
```

### **13.3. Frontend capture sketch**

```typescript
export function buildAcceleratorFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];

  if (e.ctrlKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  if (e.metaKey) parts.push("Meta");

  const key = normalizeKeyboardEventKey(e.key);
  if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
    parts.push(key);
  }

  return parts.join("+");
}
```

### **13.4. Update binding command flow**

```rust
pub async fn update_hotkey(
    &self,
    new_binding: HotkeyBinding,
) -> Result<hotkeybinding> {
    let old = self.bindings.read().await
        .get(&new_binding.hotkey_id)
        .cloned();

    let conflict = self.check_conflict(&new_binding).await?;
    if conflict.has_conflict {
        return Err(HotkeyError::Conflict(conflict));
    }

    if let Some(old_binding) = old {
        if old_binding.scope == HotkeyScope::Global && old_binding.enabled {
            self.platform.unregister_global(&old_binding.hotkey_id).await?;
        }
    }

    if new_binding.scope == HotkeyScope::Global && new_binding.enabled {
        self.platform
            .register_global(&new_binding.accelerator, new_binding.hotkey_id.clone())
            .await?;
    }

    self.settings.update_hotkey_binding(new_binding.clone()).await?;
    self.bindings.write().await.insert(new_binding.hotkey_id.clone(), new_binding.clone());

    self.events.emit(HotkeyEvent::Updated {
        binding: new_binding.clone(),
    });

    Ok(new_binding)
}
```

---

## **14. Persistence**

### **14.1. Settings source**

Hotkey bindings nằm trong:

```text
AppSettings.hotkeys.bindings
```

Không tạo file riêng trừ khi cần cache runtime.

### **14.2. HotkeySettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeySettings {
    pub enabled: bool,
    pub bindings: Vec<hotkeybinding>,
}
```

### **14.3. Save policy**

```text
- Update one binding → update settings section hotkeys.
- Reset defaults → replace bindings with default list.
- Failed registration → do not save invalid binding unless user chooses disable.
```

### **14.4. Migration**

Nếu thêm action mới ở version mới:

```text
- Keep existing user bindings.
- Add missing default binding if hotkey_id not found.
- Do not override user customized accelerator.
- If default accelerator conflicts, add binding disabled.
```

### **14.5. Merge defaults**

```rust
pub fn merge_default_hotkeys(
    user: Vec<hotkeybinding>,
    defaults: Vec<hotkeybinding>,
) -> Vec<hotkeybinding> {
    let mut map: HashMap<string, hotkeybinding=""> = user
        .into_iter()
        .map(|b| (b.hotkey_id.clone(), b))
        .collect();

    for default in defaults {
        map.entry(default.hotkey_id.clone()).or_insert(default);
    }

    map.into_values().collect()
}
```

---

## **15. Privacy & Safety**

### **15.1. Privacy mode effects**

| **Mode** | **Hotkey behavior** |
|---|---|
| **Normal** | Tất cả hotkey theo settings |
| **Quiet** | Cho phép toggle overlay/chat, block proactive quick action |
| **Private** | Cho phép toggle private off, overlay hide/show, chat nếu setting cho phép |
| **Streamer** | Cho phép safe actions, block bubble/content-sensitive actions |
| **Restricted** | Chỉ cho phép disable restricted, hide overlay, open settings |

### **15.2. Restricted allowlist**

Trong Restricted Mode chỉ cho:

```text
privacy_toggle_restricted
privacy_toggle_private
overlay_hide
overlay_toggle
settings_open
```

### **15.3. Sensitive actions**

Các action cần privacy check:

```text
chat_open
behavior_quick_checkin
overlay_show_bubble
developer_toggle_prompt_viewer
```

### **15.4. Privacy guard pseudocode**

```rust
pub async fn hotkey_action_allowed(
    action: &str,
    privacy: &PrivacySettings,
) -> Result<bool> {
    if privacy.restricted_mode {
        return Ok(matches!(
            action,
            "privacy_toggle_restricted"
                | "privacy_toggle_private"
                | "overlay_hide"
                | "overlay_toggle"
                | "settings_open"
        ));
    }

    if privacy.streamer_mode {
        if matches!(action, "overlay_show_bubble" | "developer_toggle_prompt_viewer") {
            return Ok(false);
        }
    }

    if privacy.quiet_mode {
        if matches!(action, "behavior_quick_checkin") {
            return Ok(false);
        }
    }

    Ok(true)
}
```

---

## **16. Platform Adapter: Windows**

### **16.1. Adapter trait**

```rust
#[async_trait::async_trait]
pub trait HotkeyPlatformAdapter: Send + Sync {
    async fn register_global(&self, accelerator: &str, hotkey_id: String) -> Result<()>;
    async fn unregister_global(&self, hotkey_id: &str) -> Result<()>;
    async fn unregister_all(&self) -> Result<()>;
    async fn can_register(&self, accelerator: &str) -> bool;
}
```

### **16.2. Tauri plugin strategy**

MVP nên dùng Tauri global shortcut API/plugin.

```rust
pub struct TauriGlobalShortcutAdapter {
    app: AppHandle,
    registered: Arc<dashmap<string, string="">>, // hotkey_id → accelerator
}
```

### **16.3. Register sketch**

```rust
impl TauriGlobalShortcutAdapter {
    pub async fn register_global(
        &self,
        accelerator: &str,
        hotkey_id: String,
    ) -> Result<()> {
        let app = self.app.clone();
        let accel = accelerator.to_string();
        let id = hotkey_id.clone();

        app.global_shortcut()
            .on_shortcut(accel.as_str(), move |_app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    // send to HotkeyManager event channel
                    emit_hotkey_pressed(id.clone());
                }
            })?;

        self.registered.insert(hotkey_id, accelerator.to_string());
        Ok(())
    }
}
```

### **16.4. Win32 alternative**

Nếu cần tự implement:

```text
- RegisterHotKey(hwnd, id, modifiers, vk)
- Listen WM_HOTKEY
- UnregisterHotKey(hwnd, id)
```

MVP không cần tự làm Win32 nếu Tauri plugin ổn.

### **16.5. OS-level limitations**

```text
- Không biết chắc hotkey bị app nào chiếm.
- Nếu OS reject register, chỉ biết registration failed.
- Một số tổ hợp Win+* bị OS giữ.
- Admin/elevated apps có thể ảnh hưởng focus nhưng global hotkey vẫn thường hoạt động.
```

---

## **17. Backend: HotkeyManager**

### **17.1. Module trách nhiệm**

```rust
pub struct HotkeyManager {
    settings: Arc<settingsmanager>,
    platform: Arc<dyn hotkeyplatformadapter="">,
    dispatcher: Arc<hotkeydispatcher>,
    conflict_detector: Arc<hotkeyconflictdetector>,
    action_registry: Arc<hotkeyactionregistry>,
    bindings: Arc<rwlock<hashmap<string, hotkeybinding="">>>,
    status: Arc<rwlock<hashmap<string, hotkeystatus="">>>,
    event_bus: Arc<hotkeyeventbus>,
    audit: Arc<hotkeyauditlogger>,
}
```

### **17.2. Public methods**

```rust
impl HotkeyManager {
    pub async fn init(config: HotkeyConfig) -> Result<self>;

    pub async fn start(&self) -> Result<()>;
    pub async fn stop(&self) -> Result<()>;

    pub async fn list_bindings(&self) -> Result<vec<hotkeybinding>>;
    pub async fn get_binding(&self, hotkey_id: &str) -> Result<hotkeybinding>;

    pub async fn register_binding(&self, binding: HotkeyBinding) -> Result<()>;
    pub async fn unregister_binding(&self, hotkey_id: &str) -> Result<()>;
    pub async fn update_binding(&self, binding: HotkeyBinding) -> Result<hotkeybinding>;

    pub async fn check_conflict(
        &self,
        accelerator: String,
        scope: HotkeyScope,
        exclude_hotkey_id: Option<string>,
    ) -> Result<hotkeyconflictresult>;

    pub async fn reset_defaults(&self) -> Result<vec<hotkeybinding>>;

    pub async fn handle_triggered(&self, hotkey_id: String) -> Result<hotkeydispatchresult>;

    pub async fn get_status(&self) -> Result<vec<hotkeystatus>>;

    pub fn subscribe_events(&self) -> broadcast::Receiver<hotkeyevent>;
}
```

### **17.3. Start flow**

```rust
pub async fn start(&self) -> Result<()> {
    let settings = self.settings.get_all().await?;
    if !settings.hotkeys.enabled {
        return Ok(());
    }

    let merged = merge_default_hotkeys(
        settings.hotkeys.bindings,
        default_hotkeys(),
    );

    for binding in merged {
        if !binding.enabled {
            continue;
        }

        match self.register_binding(binding.clone()).await {
            Ok(_) => {
                self.audit.log_registered(&binding).await?;
            }
            Err(e) => {
                self.audit.log_register_failed(&binding, &e).await?;
                self.mark_conflict(&binding.hotkey_id, e).await;
            }
        }
    }

    Ok(())
}
```

### **17.4. Trigger handling**

```rust
pub async fn handle_triggered(
    &self,
    hotkey_id: String,
) -> Result<hotkeydispatchresult> {
    let binding = self.get_binding(&hotkey_id).await?;

    let scope_ctx = self.build_scope_context().await?;

    let result = self.dispatcher.dispatch(&binding, &scope_ctx).await?;

    self.status.write().await
        .entry(hotkey_id.clone())
        .and_modify(|s| s.last_triggered_at = Some(Utc::now()));

    self.event_bus.emit(HotkeyEvent::Triggered {
        hotkey_id: binding.hotkey_id.clone(),
        action: binding.action.clone(),
    });

    self.audit.log_triggered(&result).await?;

    Ok(result)
}
```

---

## **18. IPC Contract**

### **18.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `hotkey_list` | `{}` | `HotkeyBinding[]` |
| `hotkey_get_status` | `{}` | `HotkeyStatus[]` |
| `hotkey_register` | `HotkeyBinding` | `void` |
| `hotkey_unregister` | `{ hotkey_id: string }` | `void` |
| `hotkey_update` | `HotkeyBinding` | `HotkeyBinding` |
| `hotkey_reset_defaults` | `{}` | `HotkeyBinding[]` |
| `hotkey_check_conflict` | `{ accelerator: string, scope: HotkeyScope, exclude_hotkey_id?: string \| null }` | `HotkeyConflictResult` |
| `hotkey_list_actions` | `{}` | `HotkeyActionDefinition[]` |

### **18.2. Rust → Frontend events**

| **Event** | **Payload** |
|---|---|
| `hotkey_triggered` | `{ hotkey_id: string, action: string }` |
| `hotkey_registered` | `HotkeyBinding` |
| `hotkey_unregistered` | `{ hotkey_id: string }` |
| `hotkey_updated` | `HotkeyBinding` |
| `hotkey_conflict_detected` | `HotkeyConflictResult` |
| `hotkey_dispatch_failed` | `HotkeyDispatchResult` |

### **18.3. TypeScript IPC wrappers**

```typescript
export const hotkeyIpc = {
  list() {
    return ipcInvoke<record<string, never="">, HotkeyBinding[]>(
      "hotkey_list",
      {},
    );
  },

  update(binding: HotkeyBinding) {
    return ipcInvoke<hotkeybinding, hotkeybinding="">(
      "hotkey_update",
      binding,
    );
  },

  checkConflict(
    accelerator: string,
    scope: HotkeyScope,
    exclude_hotkey_id?: string | null,
  ) {
    return ipcInvoke<
      {
        accelerator: string;
        scope: HotkeyScope;
        exclude_hotkey_id?: string | null;
      },
      HotkeyConflictResult
    >("hotkey_check_conflict", {
      accelerator,
      scope,
      exclude_hotkey_id,
    });
  },

  resetDefaults() {
    return ipcInvoke<record<string, never="">, HotkeyBinding[]>(
      "hotkey_reset_defaults",
      {},
    );
  },
};
```

---

## **19. Frontend Hotkey UI**

### **19.1. Settings page**

```text
Settings
└─ Hotkeys
   ├─ Enable hotkeys
   ├─ Search action
   ├─ Categories
   │  ├─ Overlay
   │  ├─ Chat
   │  ├─ Privacy
   │  ├─ Behavior
   │  ├─ Settings
   │  └─ Developer
   ├─ Binding list
   ├─ Conflict warnings
   └─ Reset defaults
```

### **19.2. Hotkey row**

```text
┌──────────────────────────────────────────────┐
│ Toggle Overlay                               │
│ Ẩn/hiện companion overlay                    │
│ [Ctrl + Shift + H] [Edit] [Disable]          │
└──────────────────────────────────────────────┘
```

### **19.3. Conflict UI**

```text
⚠ Phím tắt này đang trùng với:
"Open Chat" trong scope Global.

[Chọn phím khác] [Disable binding]
```

### **19.4. Capture component behavior**

```text
1. User clicks Edit.
2. Button shows "Press shortcut..."
3. User presses Ctrl+Shift+K.
4. UI calls hotkey_check_conflict.
5. If valid, Save enabled.
6. If invalid/conflict, show warning.
```

### **19.5. Frontend store**

```typescript
interface HotkeyStore {
  bindings: HotkeyBinding[];
  statuses: HotkeyStatus[];
  loading: boolean;

  refresh: () => Promise<void>;
  updateBinding: (binding: HotkeyBinding) => Promise<void>;
  checkConflict: (
    accelerator: string,
    scope: HotkeyScope,
    excludeId?: string,
  ) => Promise<hotkeyconflictresult>;
  resetDefaults: () => Promise<void>;
}

export const useHotkeyStore = create<hotkeystore>((set, get) => ({
  bindings: [],
  statuses: [],
  loading: false,

  refresh: async () => {
    set({ loading: true });
    try {
      const [bindings, statuses] = await Promise.all([
        hotkeyIpc.list(),
        ipcInvoke<record<string, never="">, HotkeyStatus[]>("hotkey_get_status", {}),
      ]);

      set({ bindings, statuses });
    } finally {
      set({ loading: false });
    }
  },

  updateBinding: async (binding) => {
    await hotkeyIpc.update(binding);
    await get().refresh();
  },

  checkConflict: async (accelerator, scope, excludeId) => {
    return await hotkeyIpc.checkConflict(accelerator, scope, excludeId);
  },

  resetDefaults: async () => {
    await hotkeyIpc.resetDefaults();
    await get().refresh();
  },
}));
```

---

## **20. Integration Matrix**

| **Subsystem** | **Hotkey action** | **Required behavior** |
|---|---|---|
| **OverlayWindow** | show/hide/toggle/chat panel | Dispatch via OverlayWindowManager |
| **PrivacySystem** | toggle private/quiet/streamer/restricted | Dispatch via PrivacyManager |
| **BehaviorOrchestrator** | quick action/check-in | Route as BehaviorTrigger |
| **SettingsSystem** | load/save bindings | Settings is source of truth |
| **AIInteraction** | direct chat via chat open | Không gọi AI trực tiếp từ hotkey |
| **DeveloperTools** | debug overlay/panels | Require developer mode |
| **IPCContract** | commands/events | Must match IPC docs |

---

## **21. Logging & Audit**

### **21.1. Audit schema**

```sql
CREATE TABLE hotkey_audit_log (
    id TEXT PRIMARY KEY,
    hotkey_id TEXT,
    action TEXT,
    accelerator TEXT,
    scope TEXT,
    event_type TEXT NOT NULL,
    status TEXT,
    reason TEXT,
    created_at DATETIME NOT NULL
);

CREATE INDEX idx_hotkey_audit_created ON hotkey_audit_log(created_at);
CREATE INDEX idx_hotkey_audit_hotkey ON hotkey_audit_log(hotkey_id);
```

### **21.2. Audit event types**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum HotkeyAuditEvent {
    Registered {
        hotkey_id: String,
        accelerator: String,
    },
    Unregistered {
        hotkey_id: String,
    },
    Updated {
        hotkey_id: String,
        old_accelerator: String,
        new_accelerator: String,
    },
    Triggered {
        hotkey_id: String,
        action: String,
    },
    ConflictDetected {
        hotkey_id: Option<string>,
        reason: String,
    },
    DispatchBlocked {
        hotkey_id: String,
        reason: String,
    },
    DispatchFailed {
        hotkey_id: String,
        reason: String,
    },
}
```

### **21.3. Privacy rules**

Log được:

```text
- hotkey_id
- action
- accelerator
- status
- reason
```

Không log:

```text
- chat message content
- AI prompt
- raw desktop data
- user text captured ngoài accelerator
```

---

## **22. Error Handling**

### **22.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum HotkeyError {
    #[error("Invalid accelerator: {0}")]
    InvalidAccelerator(String),

    #[error("Hotkey conflict")]
    Conflict(HotkeyConflictResult),

    #[error("Hotkey not found: {0}")]
    NotFound(String),

    #[error("Registration failed: {0}")]
    RegistrationFailed(String),

    #[error("Unregistration failed: {0}")]
    UnregistrationFailed(String),

    #[error("Action not allowed: {0}")]
    ActionNotAllowed(String),

    #[error("Dispatch failed: {0}")]
    DispatchFailed(String),

    #[error("Settings update failed: {0}")]
    SettingsUpdateFailed(String),
}
```

### **22.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Invalid accelerator | Reject update |
| Internal duplicate | Reject update, show conflict |
| OS registration failed | Disable binding or restore old |
| Action unknown | Block dispatch |
| Privacy blocked | Dispatch result = Blocked |
| Settings save fail | Keep runtime old binding |
| Unregister old fail | Retry, log warn |
| Developer mode off | Ignore developer hotkey |

### **22.3. Fail-safe policy**

Nếu HotkeyManager lỗi:

```text
- App vẫn chạy bình thường.
- Overlay vẫn có thể thao tác bằng UI.
- Settings vẫn mở bằng menu.
- Hotkeys disabled until restart or re-register.
```

---

## **23. Performance Considerations**

### **23.1. Runtime cost**

```text
- Global hotkey handled by OS event, no polling.
- Lookup binding O(1).
- Dispatch lightweight unless action calls subsystem.
- No per-frame work.
```

### **23.2. Targets**

| **Operation** | **Target** |
|---|---|
| Parse accelerator | < 100μs |
| Internal conflict check < 100 bindings | < 1ms |
| Register global hotkey | < 20ms |
| Dispatch hotkey | < 5ms excluding subsystem action |
| List bindings | < 1ms from cache |

### **23.3. Event throttling**

Không throttle `hotkey_triggered`, nhưng action có thể tự có cooldown.

Ví dụ:

```text
behavior_quick_checkin → BehaviorOrchestrator cooldown
overlay_toggle → immediate
privacy_toggle_private → immediate
```

---

## **24. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── hotkey/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── parser.rs
│               ├── validator.rs
│               ├── conflict.rs
│               ├── action_registry.rs
│               ├── dispatcher.rs
│               ├── defaults.rs
│               ├── events.rs
│               ├── audit.rs
│               ├── errors.rs
│               └── platform/
│                   ├── mod.rs
│                   ├── tauri_shortcut.rs
│                   └── windows.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── hotkey_commands.rs
│
├── src/
│   ├── settings/
│   │   └── pages/
│   │       └── Hotkeys.tsx
│   │
│   ├── hotkey/
│   │   ├── components/
│   │   │   ├── HotkeyList.tsx
│   │   │   ├── HotkeyRow.tsx
│   │   │   ├── HotkeyCaptureInput.tsx
│   │   │   └── HotkeyConflictWarning.tsx
│   │   ├── stores/
│   │   │   └── hotkeyStore.ts
│   │   └── utils/
│   │       ├── accelerator.ts
│   │       └── keyboardEvent.ts
│   │
│   └── shared/
│       └── types/
│           └── hotkey.ts
│
├── assets/
│   └── hotkey/
│       ├── default_hotkeys.json
│       └── hotkey_actions.json
│
└── docs/
    └── hotkey-system.md
```

---

## **25. Implementation Checklist**

### **25.1. P0 Core**

- [ ] Define `HotkeyBinding`.
- [ ] Define `HotkeyScope`.
- [ ] Define `HotkeyConflictResult`.
- [ ] Define `HotkeyDispatchResult`.
- [ ] Implement accelerator parser.
- [ ] Implement accelerator validator.
- [ ] Implement default hotkey list.
- [ ] Implement `HotkeyActionRegistry`.
- [ ] Implement `HotkeyManager`.

### **25.2. P0 Global Hotkeys**

- [ ] Implement Tauri global shortcut adapter.
- [ ] Register default global hotkeys on startup.
- [ ] Unregister on shutdown.
- [ ] Handle OS registration failure.
- [ ] Emit `hotkey_triggered`.

### **25.3. P0 Conflict Detection**

- [ ] Detect internal duplicate.
- [ ] Detect reserved accelerators.
- [ ] Detect invalid accelerator.
- [ ] Detect OS registration failure.
- [ ] IPC `hotkey_check_conflict`.

### **25.4. P0 Dispatch**

- [ ] Dispatch `overlay_toggle`.
- [ ] Dispatch `chat_open`.
- [ ] Dispatch `privacy_toggle_private`.
- [ ] Dispatch `privacy_toggle_quiet`.
- [ ] Dispatch `privacy_toggle_streamer`.
- [ ] Dispatch `settings_open`.
- [ ] Privacy check before sensitive actions.

### **25.5. P0 Settings Integration**

- [ ] Load bindings from Settings.
- [ ] Save binding updates to Settings.
- [ ] Reset defaults.
- [ ] Merge new default bindings without overwriting user customizations.

### **25.6. P1 Frontend UI**

- [ ] Hotkeys settings page.
- [ ] Hotkey capture input.
- [ ] Conflict warning UI.
- [ ] Enable/disable binding toggle.
- [ ] Reset defaults button.
- [ ] Category filter.

### **25.7. P1 Scoped Hotkeys**

- [ ] Chat scoped keydown handling.
- [ ] Overlay scoped keydown handling.
- [ ] Settings scoped keydown handling.
- [ ] Scope priority handling.

### **25.8. P2 Polish**

- [ ] Hotkey search.
- [ ] Import/export hotkey profile.
- [ ] Per-character hotkey overrides.
- [ ] Alternative keymap presets.
- [ ] Display keyboard layout warning.
- [ ] Advanced Win32 RegisterHotKey fallback.

---

## **26. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Hotkey** | Phím tắt kích hoạt action trong app. |
| **Global Hotkey** | Phím tắt hoạt động cả khi app không focus. |
| **Scoped Hotkey** | Phím tắt chỉ hoạt động trong một context như chat/overlay. |
| **Accelerator** | Chuỗi mô tả tổ hợp phím, ví dụ `Ctrl+Shift+H`. |
| **Binding** | Mapping từ hotkey sang action. |
| **Action Registry** | Danh sách action được phép gọi bằng hotkey. |
| **Conflict Detection** | Kiểm tra duplicate hoặc OS reject hotkey. |
| **Dispatch** | Quá trình route hotkey thành action subsystem. |
| **Reserved Accelerator** | Tổ hợp phím không nên hoặc không được dùng. |
| **Scope Priority** | Thứ tự ưu tiên khi nhiều scope có cùng accelerator. |

---

# **Phụ lục A: Flow register hotkey**

```text
App startup
       ↓
SettingsManager loads AppSettings.hotkeys
       ↓
HotkeyManager merges with default_hotkeys.json
       ↓
For each binding:
  - if enabled=false → skip
  - parse accelerator
  - validate scope
  - check internal duplicate
  - check reserved accelerator
       ↓
If scope = global:
  PlatformAdapter.register_global(accelerator, hotkey_id)
       ↓
If success:
  - mark registered
  - emit hotkey_registered
       ↓
If failed:
  - mark conflict
  - emit hotkey_conflict_detected
  - do not crash app
```

---

# **Phụ lục B: Flow hotkey triggered**

```text
User presses Ctrl+Shift+P
       ↓
OS/Tauri global shortcut fires
       ↓
PlatformAdapter emits hotkey_id = toggle_private_mode
       ↓
HotkeyManager.handle_triggered
       ↓
Lookup HotkeyBinding
       ↓
Check enabled
       ↓
Build HotkeyScopeContext
       ↓
Check action registry
       ↓
Privacy guard:
  action privacy_toggle_private is allowed
       ↓
Dispatcher:
  PrivacyManager.set_private_mode(!current)
       ↓
PrivacyManager emits privacy_mode_changed
       ↓
HotkeyManager emits hotkey_triggered
       ↓
Audit log:
  hotkey_id, action, accelerator, status=applied
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. HotkeyBinding mẫu**

```json
{
  "hotkey_id": "toggle_overlay",
  "action": "overlay_toggle",
  "accelerator": "Ctrl+Shift+H",
  "enabled": true,
  "scope": "global",
  "editable": true,
  "description": "Ẩn/hiện companion overlay",
  "category": "overlay",
  "created_at": "2026-05-27T01:20:00Z",
  "updated_at": "2026-05-27T01:20:00Z"
}
```

## **C.2. HotkeyConflictResult mẫu**

```json
{
  "has_conflict": true,
  "conflict_type": "internal_duplicate",
  "conflicting_hotkey_id": "open_chat",
  "conflicting_action": "chat_open",
  "reason": "Duplicate hotkey in same scope"
}
```

## **C.3. HotkeyDispatchResult mẫu**

```json
{
  "hotkey_id": "toggle_private_mode",
  "action": "privacy_toggle_private",
  "status": "applied",
  "reason": null,
  "triggered_at": "2026-05-27T01:20:00Z"
}
```

## **C.4. HotkeyActionDefinition mẫu**

```json
{
  "action_id": "overlay_toggle",
  "display_name": "Toggle Overlay",
  "description": "Ẩn hoặc hiện companion overlay",
  "category": "overlay",
  "allowed_scopes": ["global", "overlay"],
  "requires_privacy_check": false,
  "requires_developer_mode": false
}
```

## **C.5. hotkey_check_conflict payload mẫu**

```json
{
  "accelerator": "Ctrl+Shift+K",
  "scope": "global",
  "exclude_hotkey_id": "toggle_overlay"
}
```

---