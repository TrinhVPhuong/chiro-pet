# **Chiro-Pet Desktop Awareness System**

&gt; Tài liệu thiết kế chính thức cho **Desktop Awareness System** của **Chiro-Pet**.
&gt; Đây là **core differentiator**: hệ thống cho phép companion **biết user đang làm gì** trên desktop, từ đó AI có thể phản hồi đúng ngữ cảnh, đúng thời điểm, đúng mức độ làm phiền.
&gt;
&gt; **Nguyên tắc lõi:** App **quan sát desktop** để tạo ra ngữ cảnh, nhưng **không bao giờ gửi raw data** lên AI. Mọi thông tin nhạy cảm (window title, file path, process name, clipboard) đều được **sanitize** trước khi rời khỏi process boundary. User phải có **quyền tắt** toàn bộ desktop awareness bất kỳ lúc nào.

---

## **Mục lục**

1. [Mục tiêu &amp; Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Awareness Layers](#3-awareness-layers)
4. [Data Model](#4-data-model)
5. [Foreground Window Detection](#5-foreground-window-detection)
6. [App Category Classification](#6-app-category-classification)
7. [Idle Detection](#7-idle-detection)
8. [Fullscreen Detection](#8-fullscreen-detection)
9. [Mode State Machine](#9-mode-state-machine)
10. [Context Classifier](#10-context-classifier)
11. [Session Tracking](#11-session-tracking)
12. [Context Sanitizer](#12-context-sanitizer)
13. [Polling Strategy](#13-polling-strategy)
14. [Event Emission](#14-event-emission)
15. [Privacy &amp; Permission Model](#15-privacy--permission-model)
16. [Backend: DesktopAwarenessManager](#16-backend-desktopawarenessmanager)
17. [Platform Layer (Windows)](#17-platform-layer-windows)
18. [IPC Contract](#18-ipc-contract)
19. [Frontend Awareness Store](#19-frontend-awareness-store)
20. [Logging &amp; Audit](#20-logging--audit)
21. [Error Handling](#21-error-handling)
22. [Performance Considerations](#22-performance-considerations)
23. [File Structure](#23-file-structure)
24. [Implementation Checklist](#24-implementation-checklist)
25. [Glossary](#25-glossary)
26. [Phụ lục A: Mode transition flow](#phụ-lục-a-mode-transition-flow)
27. [Phụ lục B: Sanitization flow](#phụ-lục-b-sanitization-flow)
28. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)

---

## **1. Mục tiêu &amp; Phạm vi**

### **1.1. Mục tiêu**

Desktop Awareness System của **Chiro-Pet** phải:

- **Quan sát** foreground app, window state, idle, fullscreen, time of day.
- **Phân loại** app thành category an toàn (developer_tool, browser, game, meeting...).
- **Phát hiện mode** hiện tại của user (Normal, Focus, Gaming, Meeting, Watching).
- **Theo dõi session duration** cho mỗi app/mode.
- **Sanitize** mọi thông tin nhạy cảm trước khi gửi cho AI.
- **Emit event** để các subsystem khác (AI, Behavior, Animation) react.
- **Tôn trọng privacy**: user có thể tắt awareness bất kỳ lúc nào.
- **Tối ưu CPU**: polling thấp, debounce, suspend khi không cần.
- **Cross-platform-ready**: tập trung Windows, nhưng abstract layer cho Linux/macOS sau này.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Foreground window detection.
- App category classification.
- Idle/fullscreen detection.
- Mode state machine.
- Context sanitization.
- Session tracking.
- IPC contract.
- Polling strategy và performance.

Tài liệu này **không** mô tả:

- Cách AI dùng sanitized context (xem `ai-interaction-system.md`).
- Cách Proactivity Controller quyết định notification (xem `behavior-orchestrator-system.md`).
- Cách Privacy Manager quản lý permission tổng thể (xem `privacy-system.md`).
- Cách Animation react với mode (xem `animation-system.md`).

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Observe, don't intercept** | Chỉ đọc state OS, không hook, không inject, không capture input. |
| **2** | **Sanitize at boundary** | Raw data không bao giờ rời khỏi DesktopAwarenessManager. |
| **3** | **Category over identity** | AI biết "developer_tool", không biết "VS Code". |
| **4** | **No screenshot, no clipboard** | Không capture màn hình, không đọc clipboard. |
| **5** | **No keystroke logging** | Chỉ idle detection qua API hệ thống, không log key. |
| **6** | **User-controlled** | User có thể tắt toàn bộ awareness, hoặc per-category. |
| **7** | **Debounced &amp; cached** | Polling thấp, kết quả cache, event emit khi thay đổi thực sự. |
| **8** | **Confidence-scored** | Mỗi classification có confidence để AI dùng "có vẻ" thay vì "chắc chắn". |
| **9** | **Auditable** | Mọi sanitization và mode change có log local. |
| **10** | **Opt-out friendly** | Khi user tắt, app vẫn chạy bình thường với context = null. |

### **2.2. Anti-pattern cần tránh**

- ❌ Gửi raw window title lên AI.
- ❌ Đọc clipboard.
- ❌ Capture screenshot để phân tích.
- ❌ Hook keyboard/mouse để track input.
- ❌ Phân loại app dựa trên file path đầy đủ.
- ❌ Polling foreground 100ms (tốn CPU).
- ❌ Cache mode lâu dài rồi không update.
- ❌ Hardcode app category trong nhiều nơi.
- ❌ Bỏ qua privacy settings khi build context.
- ❌ Log raw window title vào file.

---

## **3. Awareness Layers**

System chia thành **4 lớp** từ low-level đến high-level:

### **3.1. Layer 1: Raw OS Data (Internal Only)**

Dữ liệu thô lấy từ Win32 API, **chỉ tồn tại trong process boundary**.

```text
- foreground_hwnd
- process_name (Code.exe, chrome.exe...)
- window_title (raw string)
- window_class
- process_id
- executable_path
- last_input_time (cho idle)
- monitor_info (size, DPI)
- is_fullscreen
```

**Quy tắc:** Layer này **không được serialize**, không log, không gửi qua IPC ra frontend ngoài debug mode.

### **3.2. Layer 2: Classified Data (Internal)**

Phân loại từ Layer 1, vẫn nội bộ:

```text
- app_category: developer_tool | browser | game | meeting | media | terminal | office | other
- app_subcategory: ide | text_editor | video_conference | streaming...
- classification_confidence: 0.0..1.0
- is_known_app: bool
- input_idle_seconds: number
- session_started_at: timestamp
```

### **3.3. Layer 3: Sanitized Context (External-safe)**

Dữ liệu **an toàn để gửi AI**:

```text
- app_category (string)
- session_duration_minutes (rounded to 5)
- is_fullscreen (bool)
- mode (enum)
- time_of_day (morning|afternoon|evening|night)
- is_idle (bool)
- idle_duration_minutes (rounded to 5)
- privacy_level (normal|elevated)
```

### **3.4. Layer 4: Derived Mode (High-level)**

Mode state machine derived từ Layer 2 + 3:

```text
- mode: Normal | Focus | Gaming | Meeting | Watching | Idle | Locked
- mode_confidence: 0.0..1.0
- mode_started_at: timestamp
- mode_duration_minutes: number
```

### **3.5. Sơ đồ tổng thể**

```text
┌──────────────────────────────────────────────────┐
│  Layer 1: Raw OS Data (NEVER leaves manager)     │
│  hwnd, process_name, window_title, pid, path     │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Layer 2: Classified Data (Internal)             │
│  app_category, confidence, idle_seconds          │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Layer 4: Derived Mode (Internal + emitted)      │
│  Mode FSM: Normal/Focus/Gaming/Meeting/Watching  │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Layer 3: Sanitized Context (Safe for AI/IPC)    │
│  app_category, mode, duration_rounded, time_bucket│
└──────────────────────────────────────────────────┘
```

---

## **4. Data Model**

### **4.1. Raw OS data (Rust, internal)**

```rust
#[derive(Debug, Clone)]
pub(crate) struct RawForegroundInfo {
    pub hwnd: isize,
    pub process_name: String,
    pub window_title: String,
    pub window_class: String,
    pub process_id: u32,
    pub executable_path: Option<pathbuf>,
    pub is_fullscreen: bool,
    pub monitor_id: i32,
    pub captured_at: DateTime<utc>,
}
```

&gt; ⚠️ `RawForegroundInfo` là `pub(crate)`. **Không** expose qua IPC hoặc serialize.

### **4.2. Classified data**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifiedContext {
    pub app_category: AppCategory,
    pub app_subcategory: Option<appsubcategory>,
    pub classification_confidence: f32,
    pub is_known_app: bool,
    pub is_fullscreen: bool,
    pub input_idle_seconds: u32,
    pub session_started_at: DateTime<utc>,
    pub captured_at: DateTime<utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppCategory {
    DeveloperTool,
    Browser,
    Game,
    Meeting,
    Media,
    Terminal,
    Office,
    Communication,
    DesignTool,
    Reading,
    System,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppSubcategory {
    Ide,
    TextEditor,
    VideoConference,
    Streaming,
    Music,
    Fps,
    Moba,
    Rpg,
    SocialChat,
    Email,
    Spreadsheet,
    Presentation,
    Other,
}
```

### **4.3. Sanitized context (External-safe)**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SanitizedDesktopContext {
    pub app_category: AppCategory,
    pub session_duration_minutes: u32,   // rounded to nearest 5
    pub is_fullscreen: bool,
    pub mode: AppMode,
    pub mode_confidence: f32,
    pub time_of_day: TimeOfDay,
    pub is_idle: bool,
    pub idle_duration_minutes: u32,      // rounded to nearest 5
    pub privacy_level: PrivacyLevel,
    pub generated_at: DateTime<utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppMode {
    Normal,
    Focus,
    Gaming,
    Meeting,
    Watching,
    Idle,
    Locked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimeOfDay {
    Morning,    // 5..12
    Afternoon,  // 12..18
    Evening,    // 18..22
    Night,      // 22..5
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrivacyLevel {
    Normal,
    Elevated,   // user-marked sensitive app
    Private,    // private mode on
}
```

### **4.4. TypeScript types**

```typescript
export type AppCategory =
  | "developer_tool"
  | "browser"
  | "game"
  | "meeting"
  | "media"
  | "terminal"
  | "office"
  | "communication"
  | "design_tool"
  | "reading"
  | "system"
  | "unknown";

export type AppMode =
  | "normal"
  | "focus"
  | "gaming"
  | "meeting"
  | "watching"
  | "idle"
  | "locked";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export type PrivacyLevel = "normal" | "elevated" | "private";

export interface SanitizedDesktopContext {
  app_category: AppCategory;
  session_duration_minutes: number;
  is_fullscreen: boolean;
  mode: AppMode;
  mode_confidence: number;
  time_of_day: TimeOfDay;
  is_idle: boolean;
  idle_duration_minutes: number;
  privacy_level: PrivacyLevel;
  generated_at: string;
}
```

### **4.5. App category registry (config)**

Registry là JSON file ngoài code để dễ maintain:

```json
{
  "version": 1,
  "categories": {
    "developer_tool": {
      "subcategory": "ide",
      "processes": ["code.exe", "rustrover64.exe", "idea64.exe", "pycharm64.exe", "webstorm64.exe", "devenv.exe"],
      "window_class_hints": ["Chrome_WidgetWin_1"],
      "title_hints": []
    },
    "developer_tool_editor": {
      "subcategory": "text_editor",
      "processes": ["sublime_text.exe", "notepad++.exe", "vim.exe", "nvim.exe"]
    },
    "browser": {
      "processes": ["chrome.exe", "firefox.exe", "msedge.exe", "brave.exe", "arc.exe", "opera.exe"]
    },
    "game": {
      "processes": [],
      "detection_strategy": "fullscreen_plus_high_gpu"
    },
    "meeting": {
      "subcategory": "video_conference",
      "processes": ["zoom.exe", "teams.exe", "discord.exe", "skype.exe", "webex.exe", "msteams.exe"]
    },
    "media": {
      "subcategory": "streaming",
      "processes": ["chrome.exe", "msedge.exe"],
      "title_hints": ["YouTube", "Netflix", "Spotify", "Bilibili"]
    },
    "terminal": {
      "processes": ["windowsterminal.exe", "powershell.exe", "cmd.exe", "wezterm-gui.exe", "alacritty.exe"]
    },
    "office": {
      "processes": ["winword.exe", "excel.exe", "powerpnt.exe", "onenote.exe"]
    },
    "communication": {
      "processes": ["telegram.exe", "slack.exe", "discord.exe"]
    },
    "design_tool": {
      "processes": ["figma.exe", "photoshop.exe", "illustrator.exe", "blender.exe"]
    }
  }
}
```

&gt; ⚠️ Trong code chỉ dùng category, **không reference process name**. Process name chỉ tồn tại trong classifier internal.

---

## **5. Foreground Window Detection**

### **5.1. Win32 API sử dụng**

```text
- GetForegroundWindow()         → HWND
- GetWindowThreadProcessId()    → PID
- QueryFullProcessImageNameW()  → executable path
- GetWindowTextW()              → window title (raw)
- GetClassNameW()               → window class
- GetWindowRect() / GetMonitorInfoW() → fullscreen check
- GetLastInputInfo()            → idle time
- WTSRegisterSessionNotification → lock/unlock event
```

### **5.2. Detection flow**

```text
Polling tick (configurable, default 2s)
       ↓
GetForegroundWindow()
       ↓
If HWND == 0 or same as last → skip (or check title change only on 10s tick)
       ↓
GetWindowThreadProcessId()
       ↓
OpenProcess(QUERY_LIMITED_INFORMATION)
       ↓
QueryFullProcessImageNameW()
       ↓
Extract process_name (basename, lowercased)
       ↓
GetWindowTextW() → window_title (raw, NEVER logged)
       ↓
GetClassNameW() → window_class
       ↓
Check fullscreen (window rect == monitor rect)
       ↓
Build RawForegroundInfo
       ↓
Pass to ContextClassifier
```

### **5.3. Rust implementation skeleton**

```rust
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetClassNameW,
    GetWindowRect, GetWindowThreadProcessId,
};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW,
    PROCESS_QUERY_LIMITED_INFORMATION,
};

pub(crate) fn capture_foreground() -&gt; Option<rawforegroundinfo> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            return None;
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&amp;mut pid));

        let process_name = query_process_name(pid)?;
        let window_title = read_window_text(hwnd);
        let window_class = read_window_class(hwnd);
        let executable_path = query_process_path(pid);
        let is_fullscreen = check_fullscreen(hwnd);
        let monitor_id = get_monitor_id(hwnd);

        Some(RawForegroundInfo {
            hwnd: hwnd.0,
            process_name: process_name.to_lowercase(),
            window_title,
            window_class,
            process_id: pid,
            executable_path,
            is_fullscreen,
            monitor_id,
            captured_at: Utc::now(),
        })
    }
}
```

### **5.4. Window change detection**

```rust
pub(crate) fn has_window_changed(
    last: Option&lt;&amp;RawForegroundInfo&gt;,
    current: &amp;RawForegroundInfo,
) -&gt; WindowChangeKind {
    let Some(last) = last else {
        return WindowChangeKind::FirstCapture;
    };

    if last.process_id != current.process_id {
        return WindowChangeKind::ProcessChanged;
    }

    if last.hwnd != current.hwnd {
        return WindowChangeKind::WindowChanged;
    }

    if last.is_fullscreen != current.is_fullscreen {
        return WindowChangeKind::FullscreenToggled;
    }

    WindowChangeKind::NoChange
}

pub(crate) enum WindowChangeKind {
    FirstCapture,
    ProcessChanged,
    WindowChanged,
    FullscreenToggled,
    NoChange,
}
```

---

## **6. App Category Classification**

### **6.1. Classifier interface**

```rust
pub struct AppClassifier {
    registry: Arc<appcategoryregistry>,
    custom_overrides: Arc<rwlock<hashmap<string, appcategory="">&gt;&gt;,
}

impl AppClassifier {
    pub fn classify(&amp;self, raw: &amp;RawForegroundInfo) -&gt; ClassificationResult {
        // 1. Check user custom override first
        if let Some(category) = self.lookup_custom(&amp;raw.process_name) {
            return ClassificationResult {
                category,
                subcategory: None,
                confidence: 1.0,
                is_known: true,
                source: ClassificationSource::UserOverride,
            };
        }

        // 2. Lookup registry by process name
        if let Some(entry) = self.registry.match_process(&amp;raw.process_name) {
            return ClassificationResult {
                category: entry.category,
                subcategory: entry.subcategory,
                confidence: 0.95,
                is_known: true,
                source: ClassificationSource::Registry,
            };
        }

        // 3. Heuristic: fullscreen + high GPU → likely game
        if raw.is_fullscreen &amp;&amp; self.gpu_monitor.is_high_load() {
            return ClassificationResult {
                category: AppCategory::Game,
                subcategory: None,
                confidence: 0.6,
                is_known: false,
                source: ClassificationSource::Heuristic,
            };
        }

        // 4. Title hints (for browser-as-media)
        if let Some(hit) = self.match_title_hints(&amp;raw.window_title) {
            return hit;
        }

        // 5. Unknown
        ClassificationResult {
            category: AppCategory::Unknown,
            subcategory: None,
            confidence: 0.3,
            is_known: false,
            source: ClassificationSource::Fallback,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ClassificationResult {
    pub category: AppCategory,
    pub subcategory: Option<appsubcategory>,
    pub confidence: f32,
    pub is_known: bool,
    pub source: ClassificationSource,
}

#[derive(Debug, Clone, Copy)]
pub enum ClassificationSource {
    UserOverride,
    Registry,
    Heuristic,
    TitleHint,
    Fallback,
}
```

### **6.2. Title hint matcher**

```rust
fn match_title_hints(&amp;self, raw_title: &amp;str) -&gt; Option<classificationresult> {
    // Title hints ONLY used to refine browser/media,
    // never to extract user data.
    let title_lower = raw_title.to_lowercase();

    const MEDIA_HINTS: &amp;[&amp;str] = &amp;["youtube", "netflix", "spotify", "bilibili", "twitch"];
    const MEETING_HINTS: &amp;[&amp;str] = &amp;["zoom meeting", "google meet", "microsoft teams"];

    for hint in MEDIA_HINTS {
        if title_lower.contains(hint) {
            return Some(ClassificationResult {
                category: AppCategory::Media,
                subcategory: Some(AppSubcategory::Streaming),
                confidence: 0.85,
                is_known: true,
                source: ClassificationSource::TitleHint,
            });
        }
    }

    for hint in MEETING_HINTS {
        if title_lower.contains(hint) {
            return Some(ClassificationResult {
                category: AppCategory::Meeting,
                subcategory: Some(AppSubcategory::VideoConference),
                confidence: 0.9,
                is_known: true,
                source: ClassificationSource::TitleHint,
            });
        }
    }

    None
}
```

&gt; ⚠️ Title hints **chỉ check sự tồn tại của keyword**, không lưu title, không log title.

### **6.3. User custom override**

User có thể manually map app:

```text
Settings UI:
  "I want to mark this app as: [dropdown]"
  → Pick category from list
  → Save to custom_overrides
```

```rust
pub async fn set_custom_category(
    &amp;self,
    process_name: String,
    category: AppCategory,
) -&gt; Result&lt;()&gt; {
    let mut overrides = self.custom_overrides.write().await;
    overrides.insert(process_name.to_lowercase(), category);
    self.persist_overrides().await?;
    Ok(())
}
```

---

## **7. Idle Detection**

### **7.1. Idle definition**

```text
- User được coi là "idle" nếu không có input (mouse/keyboard)
  trong N giây (mặc định 300s = 5 phút).
- Idle detection KHÔNG dùng keylogger.
- Chỉ dùng GetLastInputInfo() của Win32 → trả về timestamp last input,
  không tiết lộ key/button nào được nhấn.
```

### **7.2. Implementation**

```rust
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetLastInputInfo, LASTINPUTINFO,
};

pub(crate) fn get_idle_seconds() -&gt; u32 {
    unsafe {
        let mut lii = LASTINPUTINFO {
            cbSize: std::mem::size_of::<lastinputinfo>() as u32,
            dwTime: 0,
        };
        if GetLastInputInfo(&amp;mut lii).as_bool() {
            let tick_now = windows::Win32::System::SystemInformation::GetTickCount();
            let elapsed_ms = tick_now.saturating_sub(lii.dwTime);
            elapsed_ms / 1000
        } else {
            0
        }
    }
}
```

### **7.3. Idle thresholds**

```rust
pub struct IdleConfig {
    pub idle_threshold_seconds: u32,      // 300 (5 min)
    pub deep_idle_threshold_seconds: u32, // 1800 (30 min)
    pub afk_threshold_seconds: u32,       // 3600 (60 min)
}

impl Default for IdleConfig {
    fn default() -&gt; Self {
        Self {
            idle_threshold_seconds: 300,
            deep_idle_threshold_seconds: 1800,
            afk_threshold_seconds: 3600,
        }
    }
}
```

### **7.4. Idle state**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IdleState {
    Active,
    Idle,        // &gt; 5 min no input
    DeepIdle,    // &gt; 30 min no input
    Afk,         // &gt; 60 min no input
}

pub fn classify_idle(seconds: u32, cfg: &amp;IdleConfig) -&gt; IdleState {
    if seconds &gt;= cfg.afk_threshold_seconds {
        IdleState::Afk
    } else if seconds &gt;= cfg.deep_idle_threshold_seconds {
        IdleState::DeepIdle
    } else if seconds &gt;= cfg.idle_threshold_seconds {
        IdleState::Idle
    } else {
        IdleState::Active
    }
}
```

### **7.5. Lock screen detection**

```text
- Khi user lock màn hình (Win+L), foreground window đổi sang LogonUI.exe.
- DesktopAwarenessManager detect → mode = Locked.
- Khi locked: KHÔNG show bubble, KHÔNG play animation, suspend polling chậm hơn.
```

```rust
pub(crate) fn is_lock_screen(raw: &amp;RawForegroundInfo) -&gt; bool {
    let lower = raw.process_name.to_lowercase();
    lower == "logonui.exe" || raw.window_class == "LockScreenBackstopFrame"
}
```

---

## **8. Fullscreen Detection**

### **8.1. Fullscreen logic**

```rust
pub(crate) fn check_fullscreen(hwnd: HWND) -&gt; bool {
    unsafe {
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &amp;mut rect).is_err() {
            return false;
        }

        let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi = MONITORINFO {
            cbSize: std::mem::size_of::<monitorinfo>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &amp;mut mi).as_bool() {
            return false;
        }

        let monitor_rect = mi.rcMonitor;
        rect.left == monitor_rect.left
            &amp;&amp; rect.top == monitor_rect.top
            &amp;&amp; rect.right == monitor_rect.right
            &amp;&amp; rect.bottom == monitor_rect.bottom
    }
}
```

### **8.2. Borderless vs exclusive fullscreen**

```text
- Borderless fullscreen: window rect == monitor rect (cover toàn bộ).
- Exclusive fullscreen (game cũ): DWM bị bypass, detect khó hơn.
- Chiro-Pet chỉ cần detect "có phải fullscreen không" → borderless check là đủ.
- Khi fullscreen detected:
  - Overlay tự ẩn (anchor change).
  - Mode có thể chuyển Gaming/Watching.
```

### **8.3. Auto-hide overlay**

```text
Fullscreen detected
       ↓
Emit FullscreenEntered event
       ↓
Overlay Window Manager nhận event
       ↓
Hide overlay (set window visible = false)
       ↓
When fullscreen exits:
       ↓
Emit FullscreenExited
       ↓
Restore overlay
```

---

## **9. Mode State Machine**

### **9.1. Mode FSM**

```text
                    ┌─────────────────┐
                    │     Normal      │◄──────────────┐
                    └────────┬────────┘               │
                             │                        │
        ┌────────────────────┼────────────────────┐   │
        ▼                    ▼                    ▼   │
   ┌─────────┐         ┌──────────┐         ┌────────┴────┐
   │  Focus  │         │  Gaming  │         │  Meeting    │
   └─────────┘         └──────────┘         └─────────────┘
        │                    │                    │
        │                    ▼                    │
        │              ┌──────────┐               │
        │              │ Watching │               │
        │              └──────────┘               │
        │                                         │
        └────────┬────────────────────┬───────────┘
                 ▼                    ▼
            ┌────────┐           ┌─────────┐
            │  Idle  │           │ Locked  │
            └────────┘           └─────────┘
```

### **9.2. Mode rules**

| **Mode** | **Trigger** | **Exit condition** |
|---|---|---|
| **Normal** | Default | Bất kỳ trigger khác |
| **Focus** | App = developer_tool / office / reading, session ≥ 15 min, không bị ngắt | App đổi category, idle &gt; 10 min |
| **Gaming** | App = game OR (fullscreen + high GPU), session ≥ 5 min | App đổi, fullscreen tắt |
| **Meeting** | App = meeting | App đổi |
| **Watching** | App = media + fullscreen | Fullscreen tắt, app đổi |
| **Idle** | input_idle_seconds ≥ 300 | User active trở lại |
| **Locked** | Lock screen detected | Unlock |

### **9.3. Mode decision pseudocode**

```rust
pub fn decide_mode(
    classified: &amp;ClassifiedContext,
    idle: IdleState,
    is_locked: bool,
    current_mode: AppMode,
    mode_duration: Duration,
) -&gt; ModeDecision {
    if is_locked {
        return ModeDecision::transition(AppMode::Locked, 1.0, "lock_screen");
    }

    if matches!(idle, IdleState::DeepIdle | IdleState::Afk) {
        return ModeDecision::transition(AppMode::Idle, 0.95, "deep_idle");
    }

    if matches!(idle, IdleState::Idle) &amp;&amp; current_mode == AppMode::Normal {
        return ModeDecision::transition(AppMode::Idle, 0.7, "idle_threshold");
    }

    match classified.app_category {
        AppCategory::Meeting =&gt; {
            return ModeDecision::transition(AppMode::Meeting, 0.9, "meeting_app");
        }
        AppCategory::Game =&gt; {
            return ModeDecision::transition(AppMode::Gaming, 0.85, "game_app");
        }
        AppCategory::Media =&gt; {
            if classified.is_fullscreen {
                return ModeDecision::transition(AppMode::Watching, 0.85, "media_fullscreen");
            }
        }
        AppCategory::DeveloperTool | AppCategory::Office | AppCategory::Reading =&gt; {
            let session_minutes = mode_duration.as_secs() / 60;
            if session_minutes &gt;= 15 &amp;&amp; idle == IdleState::Active {
                return ModeDecision::transition(AppMode::Focus, 0.8, "long_focus_session");
            }
        }
        _ =&gt; {}
    }

    ModeDecision::stay(current_mode, 0.6)
}

pub struct ModeDecision {
    pub mode: AppMode,
    pub confidence: f32,
    pub reason: String,
    pub is_transition: bool,
}
```

### **9.4. Hysteresis (chống flapping)**

```text
- Mode không đổi nếu transition &lt; 30s sau lần đổi cuối.
  → trừ trường hợp Locked / Idle (luôn ưu tiên).
- Confidence &lt; 0.7: giữ mode cũ.
- Counter: cần 3 consecutive ticks confirm trước khi đổi.
```

```rust
pub struct ModeStabilizer {
    pending_mode: Option<appmode>,
    confirmations: u32,
    required_confirmations: u32,
    last_transition_at: DateTime<utc>,
    min_dwell_time: Duration,
}

impl ModeStabilizer {
    pub fn observe(&amp;mut self, decision: ModeDecision, current: AppMode) -&gt; Option<appmode> {
        // High-priority modes bypass hysteresis
        if matches!(decision.mode, AppMode::Locked | AppMode::Idle) {
            return Some(decision.mode);
        }

        let elapsed = Utc::now() - self.last_transition_at;
        if elapsed &lt; chrono::Duration::from_std(self.min_dwell_time).unwrap() {
            return None;
        }

        if decision.confidence &lt; 0.7 {
            self.pending_mode = None;
            self.confirmations = 0;
            return None;
        }

        if Some(decision.mode) == self.pending_mode {
            self.confirmations += 1;
        } else {
            self.pending_mode = Some(decision.mode);
            self.confirmations = 1;
        }

        if self.confirmations &gt;= self.required_confirmations
            &amp;&amp; self.pending_mode != Some(current)
        {
            self.last_transition_at = Utc::now();
            self.confirmations = 0;
            return self.pending_mode.take();
        }

        None
    }
}
```

---

## **10. Context Classifier**

### **10.1. Trách nhiệm**

`ContextClassifier` gom Layer 1 → Layer 2 → Layer 4, sau đó delegate sanitization sang `ContextSanitizer`.

```rust
pub struct ContextClassifier {
    app_classifier: Arc<appclassifier>,
    idle_config: IdleConfig,
    mode_stabilizer: Arc<mutex<modestabilizer>&gt;,
    session_tracker: Arc<sessiontracker>,
    last_classified: Arc<rwlock<option<classifiedcontext>&gt;&gt;,
    current_mode: Arc<rwlock<appmode>&gt;,
}

impl ContextClassifier {
    pub async fn process(
        &amp;self,
        raw: RawForegroundInfo,
        idle_seconds: u32,
    ) -&gt; ClassifierOutput {
        // 1. Classify app
        let class_result = self.app_classifier.classify(&amp;raw);

        // 2. Update session
        let session = self.session_tracker.update(&amp;raw).await;

        // 3. Build classified context
        let classified = ClassifiedContext {
            app_category: class_result.category,
            app_subcategory: class_result.subcategory,
            classification_confidence: class_result.confidence,
            is_known_app: class_result.is_known,
            is_fullscreen: raw.is_fullscreen,
            input_idle_seconds: idle_seconds,
            session_started_at: session.started_at,
            captured_at: raw.captured_at,
        };

        // 4. Idle state
        let idle_state = classify_idle(idle_seconds, &amp;self.idle_config);

        // 5. Lock detection
        let is_locked = is_lock_screen(&amp;raw);

        // 6. Mode decision
        let current_mode = *self.current_mode.read().await;
        let mode_duration = self.session_tracker.mode_duration(current_mode).await;
        let decision = decide_mode(&amp;classified, idle_state, is_locked, current_mode, mode_duration);

        // 7. Stabilize
        let new_mode_opt = self.mode_stabilizer.lock().await.observe(decision, current_mode);
        let mode_changed = new_mode_opt.is_some();
        if let Some(new_mode) = new_mode_opt {
            *self.current_mode.write().await = new_mode;
            self.session_tracker.on_mode_change(current_mode, new_mode).await;
        }

        // 8. Store last
        *self.last_classified.write().await = Some(classified.clone());

        ClassifierOutput {
            classified,
            idle_state,
            mode: *self.current_mode.read().await,
            mode_changed,
            mode_confidence: 0.8, // computed from stabilizer
        }
    }
}

pub struct ClassifierOutput {
    pub classified: ClassifiedContext,
    pub idle_state: IdleState,
    pub mode: AppMode,
    pub mode_changed: bool,
    pub mode_confidence: f32,
}
```

---

## **11. Session Tracking**

### **11.1. Mục đích**

- Theo dõi **session duration** trong mode hiện tại.
- Theo dõi **app session** (thời gian dùng 1 category liên tục).
- Cung cấp số liệu cho proactive (vd: focus 45 phút → nhắc nghỉ).

### **11.2. Session model**

```rust
pub struct AppSession {
    pub category: AppCategory,
    pub started_at: DateTime<utc>,
    pub last_seen_at: DateTime<utc>,
    pub total_minutes: u32,
}

pub struct ModeSession {
    pub mode: AppMode,
    pub started_at: DateTime<utc>,
    pub last_tick_at: DateTime<utc>,
}

pub struct SessionTracker {
    current_app_session: Arc<rwlock<option<appsession>&gt;&gt;,
    current_mode_session: Arc<rwlock<option<modesession>&gt;&gt;,
    history: Arc<rwlock<vecdeque<sessionhistoryentry>&gt;&gt;,
}
```

### **11.3. Session lifecycle**

```text
- Khi category đổi → close current app session, open new.
- Khi mode đổi → close current mode session, open new.
- Idle &gt; 5 min: pause session (không tính time).
- Idle quay lại Active: resume.
- App quit / lock: close all sessions.
```

### **11.4. Session duration sanitization**

```rust
pub fn round_duration_minutes(seconds: u64) -&gt; u32 {
    let minutes = seconds / 60;
    // Round to nearest 5 minutes
    ((minutes + 2) / 5 * 5) as u32
}
```

&gt; Ví dụ: 47 phút → gửi AI là "45 phút". Tránh leak thông tin chính xác.

### **11.5. Focus milestone hook**

```text
Session tracker emit milestone:
  - focus_15min
  - focus_30min
  - focus_45min
  - focus_60min
  - focus_90min
  - gaming_60min
  - meeting_started
  - meeting_ended
```

```rust
pub enum SessionMilestone {
    FocusMilestone { minutes: u32 },
    GamingMilestone { minutes: u32 },
    MeetingStarted,
    MeetingEnded,
    IdleEntered,
    IdleExited,
}
```

Milestone đẩy vào EventScheduler → ProactivityController quyết định có notify hay không.

---

## **12. Context Sanitizer**

### **12.1. Vai trò**

Convert `ClassifiedContext` + `AppMode` + system clock → `SanitizedDesktopContext`.

```rust
pub struct ContextSanitizer {
    privacy: Arc<privacysettings>,
    sensitive_apps: Arc<rwlock<hashset<string>&gt;&gt;, // user-marked
}

impl ContextSanitizer {
    pub async fn sanitize(
        &amp;self,
        classified: &amp;ClassifiedContext,
        mode: AppMode,
        mode_confidence: f32,
        idle_state: IdleState,
        idle_seconds: u32,
        session_seconds: u64,
    ) -&gt; Option<sanitizeddesktopcontext> {
        // Privacy mode → return None
        if self.privacy.private_mode {
            return None;
        }

        let privacy_level = if self.is_sensitive_category(classified.app_category).await {
            PrivacyLevel::Elevated
        } else {
            PrivacyLevel::Normal
        };

        // For elevated privacy → drop category, only mode + time
        let safe_category = if privacy_level == PrivacyLevel::Elevated {
            AppCategory::Unknown
        } else {
            classified.app_category
        };

        Some(SanitizedDesktopContext {
            app_category: safe_category,
            session_duration_minutes: round_duration_minutes(session_seconds),
            is_fullscreen: classified.is_fullscreen,
            mode,
            mode_confidence,
            time_of_day: current_time_of_day(),
            is_idle: matches!(idle_state, IdleState::Idle | IdleState::DeepIdle | IdleState::Afk),
            idle_duration_minutes: round_duration_minutes(idle_seconds as u64),
            privacy_level,
            generated_at: Utc::now(),
        })
    }
}
```

### **12.2. Sanitization rules**

| **Raw field** | **Action** | **Lý do** |
|---|---|---|
| `process_name` | Drop | Có thể leak app cụ thể |
| `window_title` | Drop | Chứa file name, URL, project name |
| `executable_path` | Drop | Chứa username, project structure |
| `process_id` | Drop | Không cần |
| `window_class` | Drop | Không cần |
| `hwnd` | Drop | Internal only |
| `monitor_id` | Drop | Không cần |
| `is_fullscreen` | Keep | Boolean an toàn |
| `app_category` | Keep (or mask if elevated) | Đã abstract |
| `session_duration_seconds` | Round to 5 min | Tránh exact timing |
| `idle_seconds` | Round to 5 min | Tránh exact timing |

### **12.3. User-marked sensitive apps**

```text
Settings:
  "Treat these apps as sensitive (don't tell AI about them):"
  [+ Add app]
  - 1Password
  - KeePass
  - Banking app
  - ...
```

Khi sensitive app foreground:

```text
- privacy_level = Elevated
- app_category = Unknown (mask)
- Vẫn track mode (Idle/Focus) nhưng không gửi category
- AI vẫn có thể proactive nhưng không biết user đang làm gì cụ thể
```

### **12.4. Time of day**

```rust
pub fn current_time_of_day() -&gt; TimeOfDay {
    let hour = Local::now().hour();
    match hour {
        5..=11 =&gt; TimeOfDay::Morning,
        12..=17 =&gt; TimeOfDay::Afternoon,
        18..=21 =&gt; TimeOfDay::Evening,
        _ =&gt; TimeOfDay::Night,
    }
}
```

---

## **13. Polling Strategy**

### **13.1. Tick intervals**

| **Task** | **Interval** | **Lý do** |
|---|---|---|
| **Foreground capture** | 2s | Đủ nhạy, không tốn CPU |
| **Idle check** | 5s | Idle thay đổi chậm |
| **Fullscreen check** | piggyback foreground | Cùng tick |
| **GPU monitor** | 10s | Heuristic only |
| **Session tracker tick** | 30s | Update duration |
| **Mode re-evaluation** | mỗi foreground tick | Cần realtime |
| **Daily reset check** | mỗi 60s | Cheap |

### **13.2. Adaptive polling**

```text
Default: 2s foreground tick.

When idle &gt; 5 min:
  → Slow down to 10s foreground tick.

When fullscreen + Gaming/Watching:
  → Slow down to 10s (vì user không tương tác app khác).

When meeting:
  → Stay at 2s (vì mode quan trọng, có thể đổi đột ngột).

When lock screen:
  → Slow down to 30s (chỉ check unlock).

When user explicitly disables awareness:
  → Stop all polling.
```

### **13.3. Polling scheduler**

```rust
pub struct AwarenessScheduler {
    foreground_interval: Arc<rwlock<duration>&gt;,
    idle_interval: Arc<rwlock<duration>&gt;,
    enabled: Arc<atomicbool>,
}

impl AwarenessScheduler {
    pub async fn run(&amp;self, manager: Arc<desktopawarenessmanager>) {
        let mut fg_ticker = tokio::time::interval(*self.foreground_interval.read().await);
        let mut idle_ticker = tokio::time::interval(*self.idle_interval.read().await);

        loop {
            if !self.enabled.load(Ordering::Relaxed) {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }

            tokio::select! {
                _ = fg_ticker.tick() =&gt; {
                    if let Err(e) = manager.tick_foreground().await {
                        tracing::warn!("foreground tick failed: {}", e);
                    }
                    self.adapt_interval(&amp;mut fg_ticker, &amp;self.foreground_interval).await;
                }
                _ = idle_ticker.tick() =&gt; {
                    manager.tick_idle().await.ok();
                }
            }
        }
    }
}
```

### **13.4. CPU budget**

```text
Target: &lt; 0.3% CPU on average (Ryzen 5 / i5 baseline).

Measurements:
- GetForegroundWindow: ~5μs
- QueryProcessImageName: ~50μs
- Total tick: &lt; 200μs typical, &lt; 1ms worst case.
- 2s interval → ~0.01% CPU.
```

---

## **14. Event Emission**

### **14.1. Awareness events**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AwarenessEvent {
    ContextUpdated {
        context: SanitizedDesktopContext,
    },
    ModeChanged {
        from: AppMode,
        to: AppMode,
        confidence: f32,
        reason: String,
    },
    SessionMilestone {
        milestone: SessionMilestone,
        mode: AppMode,
    },
    IdleStateChanged {
        from: IdleState,
        to: IdleState,
    },
    FullscreenEntered,
    FullscreenExited,
    ScreenLocked,
    ScreenUnlocked,
    AwarenessDisabled,
    AwarenessEnabled,
}
```

### **14.2. Event bus**

```rust
pub struct AwarenessEventBus {
    sender: broadcast::Sender<awarenessevent>,
}

impl AwarenessEventBus {
    pub fn new() -&gt; Self {
        let (sender, _) = broadcast::channel(128);
        Self { sender }
    }

    pub fn subscribe(&amp;self) -&gt; broadcast::Receiver<awarenessevent> {
        self.sender.subscribe()
    }

    pub fn emit(&amp;self, event: AwarenessEvent) {
        let _ = self.sender.send(event);
    }
}
```

### **14.3. Subscribers**

| **Subscriber** | **Quan tâm event** | **Hành động** |
|---|---|---|
| **AIOrchestrator** | ContextUpdated, ModeChanged | Update next prompt context |
| **OverlayWindowManager** | FullscreenEntered/Exited, ScreenLocked | Hide/show overlay |
| **AnimationDirector** | ModeChanged | Switch idle variant theo mode |
| **ProactivityController** | SessionMilestone, ModeChanged | Quyết định có proactive không |
| **EventScheduler** | SessionMilestone | Trigger milestone-based actions |
| **StateManager** | ModeChanged | Adjust state delta multiplier |
| **Frontend** | ContextUpdated, ModeChanged | UI indicator |

---

## **15. Privacy &amp; Permission Model**

### **15.1. Permission levels**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwarenessPermissions {
    pub foreground_detection: bool,        // default: true
    pub idle_detection: bool,              // default: true
    pub fullscreen_detection: bool,        // default: true
    pub app_classification: bool,          // default: true
    pub session_tracking: bool,            // default: true
    pub send_context_to_ai: bool,          // default: true
    pub send_idle_to_ai: bool,             // default: true
    pub send_session_duration_to_ai: bool, // default: true
}

impl Default for AwarenessPermissions {
    fn default() -&gt; Self {
        Self {
            foreground_detection: true,
            idle_detection: true,
            fullscreen_detection: true,
            app_classification: true,
            session_tracking: true,
            send_context_to_ai: true,
            send_idle_to_ai: true,
            send_session_duration_to_ai: true,
        }
    }
}
```

### **15.2. First-run consent**

```text
On first launch:
  ┌─────────────────────────────────────────────────────┐
  │ Chiro-Pet wants to know what you're doing           │
  │                                                      │
  │ This helps your companion respond appropriately:    │
  │ - Quiet when you're in a meeting                    │
  │ - Encouraging during focus sessions                 │
  │ - Out of the way when gaming fullscreen             │
  │                                                      │
  │ We will NEVER:                                       │
  │ ✓ Read your window titles                           │
  │ ✓ Take screenshots                                  │
  │ ✓ Log your keystrokes                               │
  │ ✓ Read clipboard                                    │
  │ ✓ Send your file names anywhere                     │
  │                                                      │
  │ We WILL detect (locally only):                       │
  │ • App category (e.g. "developer_tool")              │
  │ • Whether you're idle (&gt;5 min no input)             │
  │ • Whether app is fullscreen                         │
  │ • Time of day                                       │
  │                                                      │
  │ [ Enable awareness ]  [ Skip — use limited mode ]   │
  └─────────────────────────────────────────────────────┘
```

### **15.3. Granular toggle UI**

```text
Settings &gt; Privacy &gt; Desktop Awareness

  Foreground app detection         [●─── ON ]
  Idle detection                    [●─── ON ]
  Fullscreen detection              [●─── ON ]
  App category classification       [●─── ON ]
  Session duration tracking         [●─── ON ]

  ───────────────────────────────────────────

  Send context to AI                [●─── ON ]
  Send idle state to AI             [●─── ON ]
  Send session duration to AI       [●─── ON ]

  ───────────────────────────────────────────

  Sensitive apps (mask category):
  [ + Add app ]
  • 1Password
  • Banking
```

### **15.4. Disable behavior**

```text
When all awareness disabled:
  - No polling.
  - No event emission (except AwarenessDisabled).
  - SanitizedDesktopContext returns None to AI.
  - AI prompt builder skips desktop context block.
  - Mode forced to "Normal".
  - Proactivity disabled (no context to trigger on).
```

---

## **16. Backend: DesktopAwarenessManager**

### **16.1. Module trách nhiệm**

```rust
pub struct DesktopAwarenessManager {
    config: Arc<rwlock<awarenessconfig>&gt;,
    permissions: Arc<rwlock<awarenesspermissions>&gt;,
    classifier: Arc<contextclassifier>,
    sanitizer: Arc<contextsanitizer>,
    session_tracker: Arc<sessiontracker>,
    scheduler: Arc<awarenessscheduler>,
    event_bus: Arc<awarenesseventbus>,
    audit: Arc<awarenessauditlogger>,

    last_raw: Arc<rwlock<option<rawforegroundinfo>&gt;&gt;,
    last_sanitized: Arc<rwlock<option<sanitizeddesktopcontext>&gt;&gt;,
    last_idle_state: Arc<rwlock<idlestate>&gt;,
    last_fullscreen: Arc<atomicbool>,
}
```

### **16.2. Public methods**

```rust
impl DesktopAwarenessManager {
    pub async fn init(config: AwarenessConfig) -&gt; Result<self>;
    pub async fn start(&amp;self) -&gt; Result&lt;()&gt;;
    pub async fn stop(&amp;self) -&gt; Result&lt;()&gt;;

    // Querying
    pub async fn current_context(&amp;self) -&gt; Option<sanitizeddesktopcontext>;
    pub async fn current_mode(&amp;self) -&gt; AppMode;
    pub async fn current_idle_state(&amp;self) -&gt; IdleState;
    pub async fn is_fullscreen_active(&amp;self) -&gt; bool;

    // Permission management
    pub async fn update_permissions(&amp;self, perms: AwarenessPermissions) -&gt; Result&lt;()&gt;;
    pub async fn get_permissions(&amp;self) -&gt; AwarenessPermissions;
    pub async fn disable_all(&amp;self) -&gt; Result&lt;()&gt;;
    pub async fn enable_all(&amp;self) -&gt; Result&lt;()&gt;;

    // Sensitive apps
    pub async fn add_sensitive_app(&amp;self, process_name: String) -&gt; Result&lt;()&gt;;
    pub async fn remove_sensitive_app(&amp;self, process_name: String) -&gt; Result&lt;()&gt;;
    pub async fn list_sensitive_apps(&amp;self) -&gt; Vec<string>;

    // Custom category overrides
    pub async fn set_custom_category(&amp;self, process_name: String, category: AppCategory) -&gt; Result&lt;()&gt;;
    pub async fn clear_custom_category(&amp;self, process_name: String) -&gt; Result&lt;()&gt;;

    // Subscription
    pub fn subscribe_events(&amp;self) -&gt; broadcast::Receiver<awarenessevent>;

    // Internal ticks
    pub(crate) async fn tick_foreground(&amp;self) -&gt; Result&lt;()&gt;;
    pub(crate) async fn tick_idle(&amp;self) -&gt; Result&lt;()&gt;;
}
```

### **16.3. Main foreground tick flow**

```rust
pub(crate) async fn tick_foreground(&amp;self) -&gt; Result&lt;()&gt; {
    let perms = self.permissions.read().await.clone();

    if !perms.foreground_detection {
        return Ok(());
    }

    // 1. Capture raw
    let Some(raw) = capture_foreground() else {
        return Ok(());
    };

    // 2. Detect change
    let last = self.last_raw.read().await.clone();
    let change = has_window_changed(last.as_ref(), &amp;raw);

    // 3. Get idle
    let idle_seconds = if perms.idle_detection {
        get_idle_seconds()
    } else {
        0
    };

    // 4. Classify
    let output = self.classifier.process(raw.clone(), idle_seconds).await;

    // 5. Fullscreen edge detection
    let prev_fs = self.last_fullscreen.swap(raw.is_fullscreen, Ordering::Relaxed);
    if prev_fs != raw.is_fullscreen {
        if raw.is_fullscreen {
            self.event_bus.emit(AwarenessEvent::FullscreenEntered);
        } else {
            self.event_bus.emit(AwarenessEvent::FullscreenExited);
        }
    }

    // 6. Mode change event
    if output.mode_changed {
        let prev_mode = last.as_ref()
            .map(|_| *self.last_idle_state.read().await)
            .map(|_| output.mode); // simplified
        self.event_bus.emit(AwarenessEvent::ModeChanged {
            from: prev_mode.unwrap_or(AppMode::Normal),
            to: output.mode,
            confidence: output.mode_confidence,
            reason: "classifier_decision".into(),
        });
    }

    // 7. Sanitize
    if perms.send_context_to_ai {
        let session_seconds = self.session_tracker
            .current_app_session_seconds().await;
        let sanitized = self.sanitizer.sanitize(
            &amp;output.classified,
            output.mode,
            output.mode_confidence,
            output.idle_state,
            idle_seconds,
            session_seconds,
        ).await;

        if let Some(ctx) = sanitized.clone() {
            self.event_bus.emit(AwarenessEvent::ContextUpdated { context: ctx });
        }
        *self.last_sanitized.write().await = sanitized;
    }

    // 8. Persist last raw (internal only)
    *self.last_raw.write().await = Some(raw);

    Ok(())
}
```

### **16.4. Lifecycle**

```rust
pub async fn start(&amp;self) -&gt; Result&lt;()&gt; {
    let scheduler = self.scheduler.clone();
    let manager = Arc::new(self.clone());
    tokio::spawn(async move {
        scheduler.run(manager).await;
    });
    self.event_bus.emit(AwarenessEvent::AwarenessEnabled);
    Ok(())
}

pub async fn stop(&amp;self) -&gt; Result&lt;()&gt; {
    self.scheduler.disable();
    self.event_bus.emit(AwarenessEvent::AwarenessDisabled);
    Ok(())
}
```

---

## **17. Platform Layer (Windows)**

### **17.1. Abstraction trait**

```rust
pub trait PlatformAwareness: Send + Sync {
    fn capture_foreground(&amp;self) -&gt; Option<rawforegroundinfo>;
    fn get_idle_seconds(&amp;self) -&gt; u32;
    fn is_lock_screen_active(&amp;self) -&gt; bool;
    fn register_session_notifications(&amp;self) -&gt; Result&lt;()&gt;;
}
```

### **17.2. Windows implementation**

```rust
pub struct WindowsAwareness {
    hwnd_overlay: HWND,  // exclude self from foreground detection
}

impl PlatformAwareness for WindowsAwareness {
    fn capture_foreground(&amp;self) -&gt; Option<rawforegroundinfo> {
        let raw = capture_foreground()?;

        // Exclude Chiro-Pet's own overlay window
        if raw.hwnd == self.hwnd_overlay.0 {
            return None;
        }

        Some(raw)
    }

    fn get_idle_seconds(&amp;self) -&gt; u32 {
        get_idle_seconds()
    }

    fn is_lock_screen_active(&amp;self) -&gt; bool {
        // WTSGetActiveConsoleSessionId + WTSQuerySessionInformation
        // or check LogonUI.exe foreground
        is_lock_screen_via_wts()
    }

    fn register_session_notifications(&amp;self) -&gt; Result&lt;()&gt; {
        unsafe {
            WTSRegisterSessionNotification(
                self.hwnd_overlay,
                NOTIFY_FOR_THIS_SESSION,
            ).ok()?;
        }
        Ok(())
    }
}
```

### **17.3. Session notification (Win+L detect)**

```text
Win32 sends WM_WTSSESSION_CHANGE:
- WTS_SESSION_LOCK: user locked screen
- WTS_SESSION_UNLOCK: user unlocked
- WTS_SESSION_LOGOFF: user logged off

Handle in window proc → emit AwarenessEvent::ScreenLocked / ScreenUnlocked.
```

### **17.4. Future platforms**

```text
Linux:
- X11: GetForegroundWindow equivalent via XGetInputFocus
- Wayland: hard — needs compositor extension (gnome-shell, KDE)
- Idle: dbus org.freedesktop.ScreenSaver or sway-idle

macOS:
- NSWorkspace.shared.frontmostApplication
- CGEventSourceSecondsSinceLastEventType for idle
- requires Accessibility permission for window title

→ Implement trait per-platform when needed.
```

---

## **18. IPC Contract**

### **18.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `awareness_get_context` | `{}` | `SanitizedDesktopContext \| null` |
| `awareness_get_mode` | `{}` | `AppMode` |
| `awareness_get_idle_state` | `{}` | `IdleState` |
| `awareness_get_permissions` | `{}` | `AwarenessPermissions` |
| `awareness_update_permissions` | `AwarenessPermissions` | `void` |
| `awareness_disable_all` | `{}` | `void` |
| `awareness_enable_all` | `{}` | `void` |
| `awareness_add_sensitive_app` | `{ process_name }` | `void` |
| `awareness_remove_sensitive_app` | `{ process_name }` | `void` |
| `awareness_list_sensitive_apps` | `{}` | `string[]` |
| `awareness_set_custom_category` | `{ process_name, category }` | `void` |
| `awareness_debug_dump` | `{}` | `string` (debug build only) |

### **18.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `awareness_context_updated` | `SanitizedDesktopContext` | UI indicator update |
| `awareness_mode_changed` | `ModeChangedPayload` | Animation/UI react |
| `awareness_idle_changed` | `IdleStateChangedPayload` | Show/hide elements |
| `awareness_fullscreen_entered` | `{}` | Hide overlay |
| `awareness_fullscreen_exited` | `{}` | Show overlay |
| `awareness_screen_locked` | `{}` | Suspend everything |
| `awareness_screen_unlocked` | `{}` | Resume |
| `awareness_session_milestone` | `SessionMilestonePayload` | Proactive trigger |
| `awareness_disabled` | `{}` | UI grey out indicators |
| `awareness_enabled` | `{}` | UI restore |

### **18.3. TypeScript types**

```typescript
export interface ModeChangedPayload {
  from: AppMode;
  to: AppMode;
  confidence: number;
  reason: string;
}

export interface IdleStateChangedPayload {
  from: IdleState;
  to: IdleState;
}

export type IdleState = "active" | "idle" | "deep_idle" | "afk";

export interface SessionMilestonePayload {
  milestone:
    | { type: "focus_milestone"; minutes: number }
    | { type: "gaming_milestone"; minutes: number }
    | { type: "meeting_started" }
    | { type: "meeting_ended" }
    | { type: "idle_entered" }
    | { type: "idle_exited" };
  mode: AppMode;
}

export interface AwarenessPermissions {
  foreground_detection: boolean;
  idle_detection: boolean;
  fullscreen_detection: boolean;
  app_classification: boolean;
  session_tracking: boolean;
  send_context_to_ai: boolean;
  send_idle_to_ai: boolean;
  send_session_duration_to_ai: boolean;
}
```

---

## **19. Frontend Awareness Store**

### **19.1. Zustand store**

```typescript
import { create } from "zustand";

interface AwarenessStore {
  context: SanitizedDesktopContext | null;
  mode: AppMode;
  idleState: IdleState;
  isFullscreen: boolean;
  isLocked: boolean;
  permissions: AwarenessPermissions | null;
  enabled: boolean;

  refresh: () =&gt; Promise<void>;
  onContextUpdated: (ctx: SanitizedDesktopContext) =&gt; void;
  onModeChanged: (payload: ModeChangedPayload) =&gt; void;
  onIdleChanged: (payload: IdleStateChangedPayload) =&gt; void;
  onFullscreen: (active: boolean) =&gt; void;
  onLockChanged: (locked: boolean) =&gt; void;
  setEnabled: (enabled: boolean) =&gt; Promise<void>;
}

export const useAwarenessStore = create<awarenessstore>((set, get) =&gt; ({
  context: null,
  mode: "normal",
  idleState: "active",
  isFullscreen: false,
  isLocked: false,
  permissions: null,
  enabled: true,

  refresh: async () =&gt; {
    const [context, mode, idle, perms] = await Promise.all([
      invoke<sanitizeddesktopcontext |="" null="">("awareness_get_context"),
      invoke<appmode>("awareness_get_mode"),
      invoke<idlestate>("awareness_get_idle_state"),
      invoke<awarenesspermissions>("awareness_get_permissions"),
    ]);
    set({ context, mode, idleState: idle, permissions: perms });
  },

  onContextUpdated: (ctx) =&gt; set({ context: ctx }),
  onModeChanged: (payload) =&gt; set({ mode: payload.to }),
  onIdleChanged: (payload) =&gt; set({ idleState: payload.to }),
  onFullscreen: (active) =&gt; set({ isFullscreen: active }),
  onLockChanged: (locked) =&gt; set({ isLocked: locked }),

  setEnabled: async (enabled) =&gt; {
    if (enabled) await invoke("awareness_enable_all");
    else await invoke("awareness_disable_all");
    set({ enabled });
  },
}));
```

### **19.2. Event listener setup**

```typescript
import { listen } from "@tauri-apps/api/event";

export async function setupAwarenessListeners() {
  const store = useAwarenessStore.getState();

  await listen<sanitizeddesktopcontext>("awareness_context_updated", (e) =&gt; {
    useAwarenessStore.getState().onContextUpdated(e.payload);
  });

  await listen<modechangedpayload>("awareness_mode_changed", (e) =&gt; {
    useAwarenessStore.getState().onModeChanged(e.payload);
  });

  await listen<idlestatechangedpayload>("awareness_idle_changed", (e) =&gt; {
    useAwarenessStore.getState().onIdleChanged(e.payload);
  });

  await listen("awareness_fullscreen_entered", () =&gt; {
    useAwarenessStore.getState().onFullscreen(true);
  });

  await listen("awareness_fullscreen_exited", () =&gt; {
    useAwarenessStore.getState().onFullscreen(false);
  });

  await listen("awareness_screen_locked", () =&gt; {
    useAwarenessStore.getState().onLockChanged(true);
  });

  await listen("awareness_screen_unlocked", () =&gt; {
    useAwarenessStore.getState().onLockChanged(false);
  });
}
```

### **19.3. UI indicators**

```text
- ModeBadge: hiển thị mode hiện tại (Normal/Focus/Gaming/Meeting)
- IdleDot: chấm nhỏ khi user idle &gt; 5 min
- AwarenessPrivacyBanner: hiện banner khi private mode hoặc disabled
- FocusTimer: hiển thị thời gian focus hiện tại
```

---

## **20. Logging &amp; Audit**

### **20.1. Audit schema**

```sql
CREATE TABLE awareness_audit_log (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,

    -- Sanitized only
    app_category TEXT,
    mode TEXT,
    idle_state TEXT,
    is_fullscreen BOOLEAN,
    session_duration_minutes INTEGER,
    privacy_level TEXT,

    -- Metadata
    confidence REAL,
    reason TEXT,

    created_at DATETIME NOT NULL
);

CREATE INDEX idx_awareness_log_created ON awareness_audit_log(created_at);
```

### **20.2. What is logged**

| **Field** | **Logged?** | **Notes** |
|---|---|---|
| app_category | ✓ | Safe |
| mode | ✓ | Safe |
| idle_state | ✓ | Safe |
| session_duration_minutes | ✓ | Rounded |
| is_fullscreen | ✓ | Safe |
| confidence | ✓ | Useful for tuning |
| **process_name** | ✗ | NEVER |
| **window_title** | ✗ | NEVER |
| **executable_path** | ✗ | NEVER |
| **PID** | ✗ | NEVER |

### **20.3. Log rotation**

```text
- Keep audit log 14 days.
- Daily VACUUM old entries.
- User can clear log anytime in Settings &gt; Privacy.
```

### **20.4. Debug mode**

```text
When --debug flag enabled:
  - May log raw process_name (for category tuning).
  - NEVER log raw window_title.
  - Debug log written to separate file with explicit "debug-only" warning.
  - User must explicitly enable each session.
```

---

## **21. Error Handling**

### **21.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum AwarenessError {
    #[error("Win32 API failed: {0}")]
    Win32Failed(String),

    #[error("Process query denied: {0}")]
    ProcessAccessDenied(String),

    #[error("Awareness disabled by user")]
    Disabled,

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Classifier registry malformed: {0}")]
    RegistryMalformed(String),

    #[error("Session tracker error: {0}")]
    SessionTrackerError(String),

    #[error("Platform not supported")]
    PlatformNotSupported,
}
```

### **21.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Process query denied (e.g. system process) | Skip tick, no error to user |
| GetForegroundWindow returns 0 | Skip tick (just nothing focused) |
| Idle query failed | Use last known idle, log warn |
| Classifier registry malformed | Fall back to embedded defaults, alert |
| Awareness disabled | Return None from current_context, no error |
| Platform unsupported | Disable awareness, log info |
| Session tracker overflow | Reset session, log warn |

### **21.3. Resilience**

```text
- Single tick failure: skip, retry next tick.
- 5 consecutive failures: enter degraded mode (slow polling, no context to AI).
- 20 consecutive failures: disable awareness, emit AwarenessDisabled, notify user.
```

```rust
pub struct FailureTracker {
    consecutive_failures: AtomicU32,
    degraded_threshold: u32,
    disable_threshold: u32,
}

impl FailureTracker {
    pub fn record_failure(&amp;self) -&gt; FailureAction {
        let n = self.consecutive_failures.fetch_add(1, Ordering::Relaxed) + 1;
        if n &gt;= self.disable_threshold {
            FailureAction::Disable
        } else if n &gt;= self.degraded_threshold {
            FailureAction::Degrade
        } else {
            FailureAction::Continue
        }
    }

    pub fn record_success(&amp;self) {
        self.consecutive_failures.store(0, Ordering::Relaxed);
    }
}
```

---

## **22. Performance Considerations**

### **22.1. Memory footprint**

```text
- RawForegroundInfo cache: ~500 bytes
- SanitizedContext cache: ~200 bytes
- Session history: 100 entries × ~100 bytes = 10KB
- App category registry: ~5KB JSON parsed
- Total awareness module: &lt; 50KB resident
```

### **22.2. CPU optimization**

```text
- Foreground capture: ~200μs per tick
- Idle query: ~10μs
- Fullscreen check: ~50μs
- Classification: ~20μs (hashmap lookup)
- Total per tick: &lt; 300μs

At 2s interval: 0.015% CPU.
At 10s interval (idle): 0.003% CPU.
```

### **22.3. Battery considerations (laptop)**

```text
- Slow polling when on battery (10s instead of 2s).
- Suspend polling when screen off.
- Suspend polling when laptop lid closed.
- Detect AC/battery via Win32 GetSystemPowerStatus.
```

```rust
pub fn adapt_to_power_state(&amp;self) {
    let on_battery = is_on_battery();
    let interval = if on_battery {
        Duration::from_secs(10)
    } else {
        Duration::from_secs(2)
    };
    self.scheduler.set_foreground_interval(interval);
}
```

### **22.4. Benchmarks mục tiêu**

| **Operation** | **Target** |
|---|---|
| `capture_foreground` | &lt; 500μs |
| `classify` | &lt; 50μs |
| `sanitize` | &lt; 30μs |
| Full tick | &lt; 1ms |
| Mode transition emit | &lt; 100μs |
| Sustained CPU usage | &lt; 0.3% |

---

## **23. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── awareness/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── classifier.rs
│               ├── sanitizer.rs
│               ├── session_tracker.rs
│               ├── mode_fsm.rs
│               ├── mode_stabilizer.rs
│               ├── scheduler.rs
│               ├── events.rs
│               ├── audit.rs
│               ├── permissions.rs
│               ├── errors.rs
│               ├── platform/
│               │   ├── mod.rs
│               │   ├── traits.rs
│               │   ├── windows.rs
│               │   ├── linux.rs       (stub)
│               │   # **Chiro-Pet Desktop Awareness System**

&gt; Tài liệu thiết kế chính thức cho **Desktop Awareness System** của **Chiro-Pet**.
&gt; Hệ thống này là **giác quan** của app: quan sát desktop, phân loại ngữ cảnh, phát hiện mode, sanitize dữ liệu nhạy cảm trước khi đưa vào AI context.
&gt;
&gt; **Nguyên tắc lõi:** Desktop Awareness **quan sát thụ động**, không can thiệp OS, không đọc nội dung file, không screenshot, không log keystroke. Mọi dữ liệu thô đều đi qua **Sanitizer** trước khi rời module. Subsystem khác chỉ nhận **classified context** đã được làm sạch.

---

## **Mục lục**

1. [Mục tiêu &amp; Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Awareness Layers](#3-awareness-layers)
4. [Data Model](#4-data-model)
5. [Foreground Window Detection](#5-foreground-window-detection)
6. [Idle Detection](#6-idle-detection)
7. [Fullscreen Detection](#7-fullscreen-detection)
8. [App Category Classification](#8-app-category-classification)
9. [Mode State Machine](#9-mode-state-machine)
10. [Context Classifier](#10-context-classifier)
11. [Context Sanitizer](#11-context-sanitizer)
12. [Polling Strategy](#12-polling-strategy)
13. [Event System](#13-event-system)
14. [Multi-Monitor Awareness](#14-multi-monitor-awareness)
15. [App Categories Registry](#15-app-categories-registry)
16. [Privacy Integration](#16-privacy-integration)
17. [Backend: AwarenessManager](#17-backend-awarenessmanager)
18. [Platform Adapter (Windows)](#18-platform-adapter-windows)
19. [IPC Contract](#19-ipc-contract)
20. [Frontend Integration](#20-frontend-integration)
21. [Logging &amp; Audit](#21-logging--audit)
22. [Error Handling](#22-error-handling)
23. [Performance Considerations](#23-performance-considerations)
24. [File Structure](#24-file-structure)
25. [Implementation Checklist](#25-implementation-checklist)
26. [Glossary](#26-glossary)
27. [Phụ lục A: Flow chuẩn một awareness tick](#phụ-lục-a-flow-chuẩn-một-awareness-tick)
28. [Phụ lục B: Flow mode transition](#phụ-lục-b-flow-mode-transition)
29. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)

---

## **1. Mục tiêu &amp; Phạm vi**

### **1.1. Mục tiêu**

Desktop Awareness System của **Chiro-Pet** phải:

- Phát hiện **foreground window** hiện tại (app đang active).
- Phát hiện **idle state** (user không tương tác mouse/keyboard).
- Phát hiện **fullscreen** (game, video).
- Phân loại **app category** (developer_tool, browser, game, media, communication).
- Quản lý **mode state machine** (Normal, Focus, Gaming, Meeting, Watching, Idle).
- **Sanitize** mọi dữ liệu thô trước khi expose ra AI hoặc subsystem khác.
- Emit **mode change events** để các subsystem khác react.
- Hỗ trợ **multi-monitor** (biết overlay đang ở monitor nào).
- **Không tốn CPU** (target &lt; 0.5% CPU usage).
- Tôn trọng **Private Mode** (dừng polling hoặc giảm scope).

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Foreground window detection.
- Idle detection.
- Fullscreen detection.
- App category mapping.
- Mode state machine và transitions.
- Context Classifier với confidence score.
- Sanitizer rules cho AI context.
- Polling strategy và optimization.
- Platform adapter cho Windows (chính).
- Event emission.

Tài liệu này **không** mô tả:

- Cách AI dùng sanitized context (xem `ai-interaction-system.md`).
- Cách ProactivityController dùng mode (xem `behavior-orchestrator-system.md`).
- Cách overlay window react theo mode (xem `overlay-window-system.md`).
- Privacy permissions chi tiết (xem `privacy-system.md`).

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Passive observation only** | Không hook keyboard, không inject DLL, không screenshot, không đọc clipboard. |
| **2** | **No raw data leaves module** | Window title, file path, PID không được expose ra ngoài. Chỉ category và label. |
| **3** | **Sanitize before export** | Mọi context gửi AI phải đi qua Sanitizer. |
| **4** | **Mode is debounced** | Không flip mode mỗi tick. Có hysteresis. |
| **5** | **CPU-friendly** | Polling rate adapt theo activity. Idle = giảm tần suất. |
| **6** | **Privacy-respecting** | Private mode = dừng polling foreground window. |
| **7** | **Platform-abstracted** | Windows API gọi qua adapter. Logic chính platform-agnostic. |
| **8** | **Confidence-aware** | Classifier báo confidence, không khẳng định tuyệt đối. |
| **9** | **Event-driven** | Mode change emit event. Subsystem subscribe. |
| **10** | **Recoverable** | Nếu adapter fail, fallback về Normal mode, không crash app. |

### **2.2. Anti-pattern cần tránh**

- ❌ Gửi raw window title cho AI.
- ❌ Polling foreground mỗi frame (gây spike CPU).
- ❌ Hook global keyboard để detect idle.
- ❌ Screenshot desktop để phân tích.
- ❌ Đọc nội dung file đang mở.
- ❌ Log PID hoặc command line.
- ❌ Mode flip nhanh giữa Focus và Normal mỗi vài giây.
- ❌ Hardcode app category trong code (phải dùng registry).
- ❌ Block main thread khi gọi Win32 API.
- ❌ Ignore privacy mode khi user bật.

---

## **3. Awareness Layers**

Awareness được chia thành **3 lớp** với mục đích khác nhau:

### **3.1. Layer 1: Raw Sensors (Internal Only)**

Dữ liệu thô từ OS, **không bao giờ rời module**.

```text
- foreground_process_name: "Code.exe"
- foreground_window_title: "payment_api.ts - VS Code"
- foreground_pid: 1234
- foreground_path: "C:/Users/.../Code.exe"
- last_input_time_ms: 1748293200000
- is_fullscreen: false
- monitor_index: 0
- monitor_resolution: "2560x1440"
```

**Đặc điểm:**
- Chỉ tồn tại trong `AwarenessSensor`.
- Không log ra file.
- Không emit qua event.
- Không gửi IPC ra frontend.

### **3.2. Layer 2: Classified Context (Internal + Subsystem)**

Dữ liệu đã phân loại, **subsystem có thể đọc**.

```text
- app_category: "developer_tool"
- session_duration_seconds: 2700
- idle_seconds: 0
- is_fullscreen: false
- monitor_index: 0
- input_activity_level: "high"
```

**Đặc điểm:**
- Có thể đọc trong process, không gửi network.
- Dùng nội bộ cho Mode classifier, ProactivityController.

### **3.3. Layer 3: Sanitized Context (External + AI)**

Dữ liệu cuối cùng gửi AI hoặc log.

```text
- app_category: "developer_tool"
- session_duration_minutes: 45    (rounded)
- is_fullscreen: false
- mode: "focus"
- time_of_day: "night"
- privacy_level: "normal"
```

**Đặc điểm:**
- Rounded duration (5-minute bucket).
- Không có window title, path, PID.
- Có thể gửi AI provider.

### **3.4. Sơ đồ luồng dữ liệu**

```text
┌────────────────────────────────────────────────┐
│        OS (Win32 API)                          │
└──────────────────┬─────────────────────────────┘
                   ↓ raw
┌────────────────────────────────────────────────┐
│   Layer 1: Raw Sensors                         │
│   - process_name, window_title, pid            │
│   ⚠ NEVER LEAVES THIS LAYER                    │
└──────────────────┬─────────────────────────────┘
                   ↓ classify
┌────────────────────────────────────────────────┐
│   Layer 2: Classified Context                  │
│   - app_category, session_duration, idle       │
│   ✓ INTERNAL SUBSYSTEM USE                     │
└──────────────────┬─────────────────────────────┘
                   ↓ sanitize
┌────────────────────────────────────────────────┐
│   Layer 3: Sanitized Context                   │
│   - app_category, rounded_duration, mode       │
│   ✓ SAFE FOR AI / LOG / EXPORT                 │
└────────────────────────────────────────────────┘
```

---

## **4. Data Model**

### **4.1. RawSensorReading (Internal Only)**

```rust
/// ⚠ INTERNAL ONLY. Never serialize to IPC or AI.
#[derive(Debug, Clone)]
pub(crate) struct RawSensorReading {
    pub foreground_process_name: Option<string>,
    pub foreground_window_title: Option<string>,
    pub foreground_pid: Option<u32>,
    pub foreground_path: Option<string>,
    pub last_input_at_ms: u64,
    pub is_fullscreen: bool,
    pub monitor_index: u8,
    pub captured_at: DateTime<utc>,
}
```

### **4.2. ClassifiedContext (Internal Subsystem)**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifiedContext {
    pub app_category: AppCategory,
    pub category_confidence: f32,
    pub session_duration_seconds: u64,
    pub idle_seconds: u64,
    pub is_fullscreen: bool,
    pub monitor_index: u8,
    pub input_activity_level: ActivityLevel,
    pub classified_at: DateTime<utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AppCategory {
    DeveloperTool,
    Browser,
    Game,
    Media,
    Communication,
    Office,
    Design,
    Terminal,
    FileManager,
    System,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityLevel {
    Idle,    // 0 input in last 60s
    Low,     // sporadic
    Medium,  // normal typing
    High,    // intensive typing/clicking
}
```

### **4.3. SanitizedDesktopContext (External + AI)**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SanitizedDesktopContext {
    pub app_category: AppCategory,
    pub session_duration_minutes: u32,  // rounded to 5min
    pub is_fullscreen: bool,
    pub mode: AppMode,
    pub time_of_day: TimeOfDay,
    pub privacy_level: PrivacyLevel,
    pub sanitized_at: DateTime<utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum TimeOfDay {
    EarlyMorning,  // 04:00-07:59
    Morning,       // 08:00-11:59
    Afternoon,     // 12:00-17:59
    Evening,       // 18:00-21:59
    Night,         // 22:00-03:59
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrivacyLevel {
    Normal,
    Private,    // Sensitive context, AI should be conservative
    Restricted, // Block AI entirely
}
```

### **4.4. AppMode**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AppMode {
    Normal,
    Focus,
    Gaming,
    Meeting,
    Watching,
    Idle,
    Private,
}
```

### **4.5. TypeScript types**

```typescript
export type AppCategory =
  | "developer_tool"
  | "browser"
  | "game"
  | "media"
  | "communication"
  | "office"
  | "design"
  | "terminal"
  | "file_manager"
  | "system"
  | "unknown";

export type AppMode =
  | "normal"
  | "focus"
  | "gaming"
  | "meeting"
  | "watching"
  | "idle"
  | "private";

export type TimeOfDay =
  | "early_morning"
  | "morning"
  | "afternoon"
  | "evening"
  | "night";

export interface SanitizedDesktopContext {
  app_category: AppCategory;
  session_duration_minutes: number;
  is_fullscreen: boolean;
  mode: AppMode;
  time_of_day: TimeOfDay;
  privacy_level: "normal" | "private" | "restricted";
  sanitized_at: string;
}

export interface AwarenessSnapshot {
  current_mode: AppMode;
  app_category: AppCategory;
  is_fullscreen: boolean;
  idle_seconds: number;
  session_duration_minutes: number;
  monitor_index: number;
  updated_at: string;
}
```

---

## **5. Foreground Window Detection**

### **5.1. Win32 API**

Sử dụng:

```text
- GetForegroundWindow() → HWND
- GetWindowThreadProcessId(hwnd) → PID
- QueryFullProcessImageNameW(handle) → path
- GetWindowTextW(hwnd) → title (CHỈ DÙNG NỘI BỘ)
```

### **5.2. Detection flow**

```text
Awareness tick
    ↓
GetForegroundWindow()
    ↓
If HWND == 0 → record "no_foreground"
    ↓
GetWindowThreadProcessId → PID
    ↓
OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)
    ↓
QueryFullProcessImageNameW → full path
    ↓
Extract executable name (e.g., "Code.exe")
    ↓
Build RawSensorReading
    ↓
[Optional] Read window title for classifier hints
    ↓
Pass to ContextClassifier
    ↓
DROP raw reading (do not persist)
```

### **5.3. Process name extraction**

```rust
pub(crate) fn extract_process_name(path: &amp;str) -&gt; Option<string> {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}
```

### **5.4. Edge cases**

| **Trường hợp** | **Xử lý** |
|---|---|
| HWND = 0 | `app_category = Unknown`, `is_fullscreen = false` |
| OpenProcess fail (UAC) | Skip path, dùng window class name |
| Path không có executable | `app_category = Unknown` |
| Process exited giữa lúc query | Skip tick, dùng reading trước |
| Multiple HWND same PID | Lấy foreground HWND (Win32 đã handle) |

---

## **6. Idle Detection**

### **6.1. Win32 API**

```text
- GetLastInputInfo(&amp;LASTINPUTINFO) → ticks
- GetTickCount() → current ticks
- idle_ms = current_ticks - last_input_ticks
```

### **6.2. Idle thresholds**

| **Threshold** | **Giá trị** | **Mode trigger** |
|---|---|---|
| **Active** | &lt; 60s | Normal/Focus |
| **Short idle** | 60s - 5min | Stay in current |
| **Medium idle** | 5min - 15min | Hint toward Idle |
| **Long idle** | &gt; 15min | Transition to Idle |

### **6.3. Activity level computation**

```rust
pub fn compute_activity_level(idle_seconds: u64) -&gt; ActivityLevel {
    match idle_seconds {
        0..=10 =&gt; ActivityLevel::High,
        11..=60 =&gt; ActivityLevel::Medium,
        61..=300 =&gt; ActivityLevel::Low,
        _ =&gt; ActivityLevel::Idle,
    }
}
```

### **6.4. Edge cases**

| **Trường hợp** | **Xử lý** |
|---|---|
| User watching video (no input) | Cross-check fullscreen + media category → Watching mode |
| User in voice call (no input) | Cross-check communication category → Meeting mode |
| Locked screen | OS event `WTS_SESSION_LOCK` → suspend awareness |
| Resume from sleep | Reset session_duration, recompute |

---

## **7. Fullscreen Detection**

### **7.1. Detection logic**

```rust
pub fn is_window_fullscreen(hwnd: HWND, monitor_rect: RECT) -&gt; bool {
    let mut window_rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &amp;mut window_rect) }.is_err() {
        return false;
    }

    window_rect.left == monitor_rect.left
        &amp;&amp; window_rect.top == monitor_rect.top
        &amp;&amp; window_rect.right == monitor_rect.right
        &amp;&amp; window_rect.bottom == monitor_rect.bottom
}
```

### **7.2. Fullscreen hints**

```text
- Window rect == monitor rect → fullscreen candidate
- Style không có WS_CAPTION → likely fullscreen
- Style có WS_POPUP và rect = monitor → exclusive fullscreen (game)
- Browser fullscreen video: rect = monitor but process = browser → Watching
```

### **7.3. Fullscreen + Category matrix**

| **Fullscreen** | **Category** | **Suggested Mode** |
|---|---|---|
| Yes | Game | Gaming |
| Yes | Media | Watching |
| Yes | Browser (video heuristic) | Watching |
| Yes | Communication (Zoom share) | Meeting |
| Yes | Other | Focus (conservative) |
| No | Game | Normal (windowed) |
| No | Communication | Meeting (if active call) |

---

## **8. App Category Classification**

### **8.1. Classification strategy**

```text
1. Lookup process name in registry (exact match).
2. If no match → lookup partial match (substring).
3. If no match → use window class name hints.
4. If still no match → Unknown.
5. Return (category, confidence).
```

### **8.2. Confidence scoring**

| **Match type** | **Confidence** |
|---|---|
| Exact process name | 1.0 |
| Substring process name | 0.8 |
| Window class match | 0.6 |
| Path hint (e.g., contains "Steam") | 0.5 |
| Unknown | 0.0 |

### **8.3. Classifier code**

```rust
pub struct AppClassifier {
    registry: Arc<appcategoryregistry>,
}

impl AppClassifier {
    pub fn classify(&amp;self, raw: &amp;RawSensorReading) -&gt; (AppCategory, f32) {
        let process_name = match &amp;raw.foreground_process_name {
            Some(n) =&gt; n.to_lowercase(),
            None =&gt; return (AppCategory::Unknown, 0.0),
        };

        // 1. Exact match
        if let Some(cat) = self.registry.exact_match(&amp;process_name) {
            return (cat, 1.0);
        }

        // 2. Substring match
        if let Some(cat) = self.registry.substring_match(&amp;process_name) {
            return (cat, 0.8);
        }

        // 3. Path-based heuristic
        if let Some(path) = &amp;raw.foreground_path {
            if let Some(cat) = self.registry.path_hint(path) {
                return (cat, 0.5);
            }
        }

        (AppCategory::Unknown, 0.0)
    }
}
```

### **8.4. Classification examples**

| **Process** | **Category** | **Confidence** |
|---|---|---|
| `Code.exe` | DeveloperTool | 1.0 |
| `idea64.exe` | DeveloperTool | 1.0 |
| `chrome.exe` | Browser | 1.0 |
| `firefox.exe` | Browser | 1.0 |
| `Discord.exe` | Communication | 1.0 |
| `Teams.exe` | Communication | 1.0 |
| `Zoom.exe` | Communication | 1.0 |
| `notepad.exe` | Office | 0.8 |
| `WINWORD.EXE` | Office | 1.0 |
| `figma.exe` | Design | 1.0 |
| `cmd.exe` | Terminal | 1.0 |
| `wt.exe` | Terminal | 1.0 |
| `explorer.exe` | FileManager | 1.0 |
| `League of Legends.exe` | Game | 1.0 |
| `unknown_app.exe` | Unknown | 0.0 |

---

## **9. Mode State Machine**

### **9.1. Mode definitions**

| **Mode** | **Trigger** | **AI behavior** | **Interruption** |
|---|---|---|---|
| **Normal** | Default | Full | Allowed |
| **Focus** | DeveloperTool + Office + 30min+ session | Conservative | Low only |
| **Gaming** | Fullscreen + Game category | Minimal | None |
| **Meeting** | Communication + active (camera/mic indicator) | Minimal | None |
| **Watching** | Fullscreen + Media/Browser video | Minimal | None |
| **Idle** | idle_seconds &gt; 15min | Suspended | None |
| **Private** | User toggle | Suspended | None |

### **9.2. State machine diagram**

```text
                  ┌──────────────┐
                  │   Normal     │
                  └──────┬───────┘
                         │
       ┌─────────────────┼─────────────────────┐
       │                 │                     │
       ↓                 ↓                     ↓
┌──────────┐      ┌──────────┐          ┌──────────┐
│  Focus   │      │ Gaming   │          │ Meeting  │
└────┬─────┘      └────┬─────┘          └────┬─────┘
     │                 │                     │
     │                 │                     │
     ↓                 ↓                     ↓
┌──────────┐      ┌──────────┐          ┌──────────┐
│ Watching │ ←──→ │  Idle    │ ←──→     │ Private  │
└──────────┘      └──────────┘          └──────────┘
       ↑                                       ↑
       └───────────────────────────────────────┘
            (any mode can switch to Private)
```

### **9.3. Transition rules**

```text
Normal → Focus
  Condition: app_category in {DeveloperTool, Office, Design}
             AND session_duration &gt;= 30min
             AND no fullscreen
  Hysteresis: 60s

Normal → Gaming
  Condition: app_category == Game AND is_fullscreen
  Hysteresis: 10s

Normal → Meeting
  Condition: app_category == Communication
             AND (audio_active OR camera_active heuristic)
  Hysteresis: 15s

Normal → Watching
  Condition: is_fullscreen
             AND app_category in {Media, Browser-with-video}
  Hysteresis: 20s

Any → Idle
  Condition: idle_seconds &gt; 15min
  Hysteresis: immediate (no debounce)

Any → Private
  Condition: User toggle
  Hysteresis: immediate

Idle → previous_mode
  Condition: input detected
  Hysteresis: 5s

Private → Normal
  Condition: User toggle off
  Hysteresis: immediate

Focus → Normal
  Condition: app_category changed for &gt; 60s
  Hysteresis: 60s
```

### **9.4. Hysteresis implementation**

```rust
pub struct ModeHysteresis {
    candidate_mode: Option<appmode>,
    candidate_since: Option<instant>,
    required_duration: HashMap&lt;(AppMode, AppMode), Duration&gt;,
}

impl ModeHysteresis {
    pub fn evaluate(
        &amp;mut self,
        current: AppMode,
        proposed: AppMode,
        now: Instant,
    ) -&gt; Option<appmode> {
        if proposed == current {
            self.candidate_mode = None;
            return None;
        }

        let required = self.required_duration
            .get(&amp;(current, proposed))
            .copied()
            .unwrap_or(Duration::from_secs(30));

        match self.candidate_mode {
            Some(c) if c == proposed =&gt; {
                let since = self.candidate_since.unwrap();
                if now.duration_since(since) &gt;= required {
                    self.candidate_mode = None;
                    Some(proposed)
                } else {
                    None
                }
            }
            _ =&gt; {
                self.candidate_mode = Some(proposed);
                self.candidate_since = Some(now);
                None
            }
        }
    }
}
```

---

## **10. Context Classifier**

### **10.1. Trách nhiệm**

Context Classifier nhận `RawSensorReading`, output `ClassifiedContext` và đề xuất mode.

```rust
pub struct ContextClassifier {
    app_classifier: Arc<appclassifier>,
    session_tracker: SessionTracker,
    mode_evaluator: ModeEvaluator,
}

impl ContextClassifier {
    pub fn classify(&amp;mut self, raw: &amp;RawSensorReading) -&gt; ClassificationOutput {
        // 1. App category
        let (category, confidence) = self.app_classifier.classify(raw);

        // 2. Session tracking
        let session_duration = self.session_tracker.track(&amp;category, raw.captured_at);

        // 3. Activity level
        let idle_seconds = (raw.captured_at.timestamp_millis() as u64)
            .saturating_sub(raw.last_input_at_ms) / 1000;
        let activity_level = compute_activity_level(idle_seconds);

        // 4. Proposed mode
        let proposed_mode = self.mode_evaluator.propose(
            category,
            raw.is_fullscreen,
            session_duration,
            idle_seconds,
        );

        let classified = ClassifiedContext {
            app_category: category,
            category_confidence: confidence,
            session_duration_seconds: session_duration,
            idle_seconds,
            is_fullscreen: raw.is_fullscreen,
            monitor_index: raw.monitor_index,
            input_activity_level: activity_level,
            classified_at: raw.captured_at,
        };

        ClassificationOutput {
            classified,
            proposed_mode,
        }
    }
}

pub struct ClassificationOutput {
    pub classified: ClassifiedContext,
    pub proposed_mode: AppMode,
}
```

### **10.2. Session tracking**

Session = thời gian liên tục cùng app category.

```rust
pub struct SessionTracker {
    current_category: Option<appcategory>,
    session_started_at: Option<datetime<utc>&gt;,
}

impl SessionTracker {
    pub fn track(&amp;mut self, category: &amp;AppCategory, now: DateTime<utc>) -&gt; u64 {
        match self.current_category {
            Some(c) if c == *category =&gt; {
                let started = self.session_started_at.unwrap();
                (now - started).num_seconds().max(0) as u64
            }
            _ =&gt; {
                self.current_category = Some(*category);
                self.session_started_at = Some(now);
                0
            }
        }
    }

    pub fn reset(&amp;mut self) {
        self.current_category = None;
        self.session_started_at = None;
    }
}
```

### **10.3. Mode evaluator**

```rust
pub struct ModeEvaluator;

impl ModeEvaluator {
    pub fn propose(
        &amp;self,
        category: AppCategory,
        is_fullscreen: bool,
        session_seconds: u64,
        idle_seconds: u64,
    ) -&gt; AppMode {
        if idle_seconds &gt; 900 {
            return AppMode::Idle;
        }

        if is_fullscreen {
            return match category {
                AppCategory::Game =&gt; AppMode::Gaming,
                AppCategory::Media =&gt; AppMode::Watching,
                AppCategory::Communication =&gt; AppMode::Meeting,
                _ =&gt; AppMode::Focus,
            };
        }

        if matches!(category, AppCategory::Communication) {
            return AppMode::Meeting;
        }

        if matches!(
            category,
            AppCategory::DeveloperTool | AppCategory::Office | AppCategory::Design
        ) &amp;&amp; session_seconds &gt;= 1800 {
            return AppMode::Focus;
        }

        AppMode::Normal
    }
}
```

---

## **11. Context Sanitizer**

### **11.1. Sanitization rules**

| **Raw field** | **Output** | **Method** |
|---|---|---|
| `process_name` | `app_category` | Lookup registry |
| `window_title` | ❌ DROPPED | Never exposed |
| `pid` | ❌ DROPPED | Never exposed |
| `path` | ❌ DROPPED | Never exposed |
| `session_duration_seconds` | `session_duration_minutes` | Round to 5min |
| `idle_seconds` | ❌ DROPPED (use mode) | Indirect via mode |
| `is_fullscreen` | `is_fullscreen` | Pass-through |
| `monitor_index` | ❌ DROPPED | Never exposed |

### **11.2. Sanitizer**

```rust
pub struct ContextSanitizer;

impl ContextSanitizer {
    pub fn sanitize(
        &amp;self,
        classified: &amp;ClassifiedContext,
        mode: AppMode,
        privacy_settings: &amp;PrivacySettings,
    ) -&gt; Option<sanitizeddesktopcontext> {
        // Private mode: return None (no context to AI)
        if privacy_settings.private_mode {
            return None;
        }

        // Restricted privacy: return minimal
        let privacy_level = if privacy_settings.restricted_mode {
            PrivacyLevel::Restricted
        } else if privacy_settings.private_mode {
            PrivacyLevel::Private
        } else {
            PrivacyLevel::Normal
        };

        if privacy_level == PrivacyLevel::Restricted {
            return None;
        }

        let session_minutes = round_to_bucket(
            classified.session_duration_seconds / 60,
            5,
        );

        Some(SanitizedDesktopContext {
            app_category: classified.app_category,
            session_duration_minutes: session_minutes as u32,
            is_fullscreen: classified.is_fullscreen,
            mode,
            time_of_day: compute_time_of_day(Local::now()),
            privacy_level,
            sanitized_at: Utc::now(),
        })
    }
}

fn round_to_bucket(value: u64, bucket: u64) -&gt; u64 {
    (value / bucket) * bucket
}

fn compute_time_of_day(now: DateTime<local>) -&gt; TimeOfDay {
    let hour = now.hour();
    match hour {
        4..=7 =&gt; TimeOfDay::EarlyMorning,
        8..=11 =&gt; TimeOfDay::Morning,
        12..=17 =&gt; TimeOfDay::Afternoon,
        18..=21 =&gt; TimeOfDay::Evening,
        _ =&gt; TimeOfDay::Night,
    }
}
```

### **11.3. Sanitizer test cases**

| **Input** | **Output** |
|---|---|
| `Code.exe`, title=`secrets.ts`, 45min, focus | `developer_tool`, 45min rounded, focus |
| `chrome.exe`, title=`Banking - Login`, 5min | `browser`, 5min, normal |
| `League of Legends.exe`, fullscreen, 90min | `game`, 90min, gaming |
| `Zoom.exe`, 30min | `communication`, 30min, meeting |
| Any input + Private Mode ON | `None` |

---

## **12. Polling Strategy**

### **12.1. Adaptive polling**

```text
- Active (input &lt; 60s): poll every 2s
- Short idle (60s-5min): poll every 5s
- Medium idle (5min-15min): poll every 15s
- Long idle (&gt; 15min): poll every 60s
- Fullscreen game/video: poll every 10s (giảm load)
- Private mode: poll every 30s (chỉ check exit private)
```

### **12.2. Polling scheduler**

```rust
pub struct AdaptivePoller {
    base_interval: Duration,
    current_interval: Duration,
    last_activity_level: ActivityLevel,
}

impl AdaptivePoller {
    pub fn next_interval(&amp;mut self, level: ActivityLevel, mode: AppMode) -&gt; Duration {
        let interval = match (level, mode) {
            (_, AppMode::Private) =&gt; Duration::from_secs(30),
            (_, AppMode::Idle) =&gt; Duration::from_secs(60),
            (_, AppMode::Gaming | AppMode::Watching) =&gt; Duration::from_secs(10),
            (ActivityLevel::Idle, _) =&gt; Duration::from_secs(15),
            (ActivityLevel::Low, _) =&gt; Duration::from_secs(5),
            (ActivityLevel::Medium, _) =&gt; Duration::from_secs(3),
            (ActivityLevel::High, _) =&gt; Duration::from_secs(2),
        };

        self.current_interval = interval;
        self.last_activity_level = level;
        interval
    }
}
```

### **12.3. Polling loop**

```rust
pub async fn run_awareness_loop(manager: Arc<awarenessmanager>) {
    let mut poller = AdaptivePoller::new();

    loop {
        let result = manager.tick().await;

        let next_interval = match result {
            Ok(snapshot) =&gt; poller.next_interval(
                snapshot.activity_level,
                snapshot.mode,
            ),
            Err(e) =&gt; {
                tracing::warn!("awareness tick failed: {}", e);
                Duration::from_secs(10)
            }
        };

        tokio::time::sleep(next_interval).await;
    }
}
```

### **12.4. CPU budget**

```text
Target: &lt; 0.5% CPU on idle, &lt; 1% under active load.

Measurement:
  - Win32 API calls per tick: ~5 (GetForegroundWindow, GetLastInputInfo, etc.)
  - Each call: ~50-200μs
  - Total per tick: ~1ms
  - At 2s interval: 0.05% CPU
  - At 60s interval (idle): 0.0017% CPU
```

---

## **13. Event System**

### **13.1. Awareness events**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AwarenessEvent {
    ModeChanged {
        from: AppMode,
        to: AppMode,
        at: DateTime<utc>,
    },
    AppCategoryChanged {
        from: AppCategory,
        to: AppCategory,
        at: DateTime<utc>,
    },
    IdleStarted {
        at: DateTime<utc>,
    },
    IdleEnded {
        idle_duration_seconds: u64,
        at: DateTime<utc>,
    },
    FullscreenEntered {
        category: AppCategory,
        at: DateTime<utc>,
    },
    FullscreenExited {
        at: DateTime<utc>,
    },
    SessionMilestone {
        category: AppCategory,
        duration_minutes: u32,  // 45, 90, 120...
        at: DateTime<utc>,
    },
    PrivateModeToggled {
        enabled: bool,
        at: DateTime<utc>,
    },
}
```

### **13.2. Event bus**

```rust
pub struct AwarenessEventBus {
    sender: broadcast::Sender<awarenessevent>,
}

impl AwarenessEventBus {
    pub fn new() -&gt; Self {
        let (sender, _) = broadcast::channel(128);
        Self { sender }
    }

    pub fn subscribe(&amp;self) -&gt; broadcast::Receiver<awarenessevent> {
        self.sender.subscribe()
    }

    pub fn emit(&amp;self, event: AwarenessEvent) {
        let _ = self.sender.send(event);
    }
}
```

### **13.3. Subscribers**

| **Subscriber** | **Event quan tâm** | **Hành động** |
|---|---|---|
| **ProactivityController** | ModeChanged, SessionMilestone | Quyết định proactive trigger |
| **AIOrchestrator** | ModeChanged | Update context for next prompt |
| **OverlayWindow** | FullscreenEntered, ModeChanged | Auto-hide, adjust z-order |
| **AnimationDirector** | ModeChanged | Switch idle variant (calm in Focus) |
| **StateManager** | ModeChanged | Apply mode-aware mutation policy |
| **AuditLogger** | All | Log to debug |

### **13.4. Session milestones**

```text
Khi session_duration đạt:
- 45 minutes → emit SessionMilestone(45)
- 90 minutes → emit SessionMilestone(90)
- 120 minutes → emit SessionMilestone(120)
- Every 60 minutes after → emit SessionMilestone(N)

ProactivityController dùng milestone để trigger gợi ý nghỉ.
```

---

## **14. Multi-Monitor Awareness**

### **14.1. Trách nhiệm**

```text
- Biết overlay đang ở monitor nào.
- Biết foreground window ở monitor nào.
- Phát hiện DPI change khi user kéo cửa sổ giữa monitors.
- Phát hiện monitor add/remove (plug/unplug).
```

### **14.2. Monitor info**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorInfo {
    pub index: u8,
    pub name: String,
    pub bounds: MonitorBounds,
    pub dpi_scale: f32,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct MonitorBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}
```

### **14.3. Monitor change detection**

```text
Listen to Win32 event:
  - WM_DISPLAYCHANGE
  - WM_DPICHANGED

On event:
  1. Re-enumerate monitors.
  2. Compare with previous list.
  3. Emit MonitorsChanged event.
  4. OverlayWindow re-anchor if needed.
```

### **14.4. Same-monitor heuristic**

Khi overlay và foreground window cùng monitor:
- Có thể auto-hide overlay (tránh che).
- Có thể move overlay sang monitor khác (nếu user setting).

---

## **15. App Categories Registry**

### **15.1. Registry file**

`assets/awareness/app_categories.json`:

```json
{
  "version": 1,
  "exact_match": {
    "code.exe": "developer_tool",
    "code - insiders.exe": "developer_tool",
    "idea64.exe": "developer_tool",
    "pycharm64.exe": "developer_tool",
    "webstorm64.exe": "developer_tool",
    "rider64.exe": "developer_tool",
    "devenv.exe": "developer_tool",
    "sublime_text.exe": "developer_tool",

    "chrome.exe": "browser",
    "firefox.exe": "browser",
    "msedge.exe": "browser",
    "brave.exe": "browser",
    "opera.exe": "browser",

    "discord.exe": "communication",
    "teams.exe": "communication",
    "zoom.exe": "communication",
    "slack.exe": "communication",
    "skype.exe": "communication",

    "winword.exe": "office",
    "excel.exe": "office",
    "powerpnt.exe": "office",
    "outlook.exe": "office",
    "notepad.exe": "office",
    "notepad++.exe": "office",

    "figma.exe": "design",
    "photoshop.exe": "design",
    "illustrator.exe": "design",
    "blender.exe": "design",

    "cmd.exe": "terminal",
    "powershell.exe": "terminal",
    "pwsh.exe": "terminal",
    "wt.exe": "terminal",
    "alacritty.exe": "terminal",

    "explorer.exe": "file_manager",

    "spotify.exe": "media",
    "vlc.exe": "media",
    "potplayer.exe": "media",
    "mpc-hc.exe": "media",

    "leagueclient.exe": "game",
    "league of legends.exe": "game",
    "valorant.exe": "game",
    "steam.exe": "game",
    "epicgameslauncher.exe": "game"
  },
  "substring_match": [
    { "pattern": "minecraft", "category": "game" },
    { "pattern": "wow", "category": "game" },
    { "pattern": "dota", "category": "game" },
    { "pattern": "csgo", "category": "game" },
    { "pattern": "valheim", "category": "game" }
  ],
  "path_hints": [
    { "pattern": "steamapps", "category": "game" },
    { "pattern": "epic games", "category": "game" },
    { "pattern": "riot games", "category": "game" }
  ]
}
```

### **15.2. Registry loader**

```rust
pub struct AppCategoryRegistry {
    exact: HashMap<string, appcategory="">,
    substring: Vec&lt;(String, AppCategory)&gt;,
    path_hints: Vec&lt;(String, AppCategory)&gt;,
}

impl AppCategoryRegistry {
    pub fn load_from_file(path: &amp;Path) -&gt; Result<self> {
        let content = std::fs::read_to_string(path)?;
        let raw: serde_json::Value = serde_json::from_str(&amp;content)?;
        // Parse and build maps
        Ok(Self {
            exact: parse_exact(&amp;raw)?,
            substring: parse_substring(&amp;raw)?,
            path_hints: parse_path_hints(&amp;raw)?,
        })
    }

    pub fn exact_match(&amp;self, process: &amp;str) -&gt; Option<appcategory> {
        self.exact.get(process).copied()
    }

    pub fn substring_match(&amp;self, process: &amp;str) -&gt; Option<appcategory> {
        self.substring.iter()
            .find(|(pattern, _)| process.contains(pattern))
            .map(|(_, cat)| *cat)
    }

    pub fn path_hint(&amp;self, path: &amp;str) -&gt; Option<appcategory> {
        let lower = path.to_lowercase();
        self.path_hints.iter()
            .find(|(pattern, _)| lower.contains(pattern))
            .map(|(_, cat)| *cat)
    }
}
```

### **15.3. User extensions**

User có thể thêm mapping riêng trong `user_data/awareness/custom_categories.json`:

```json
{
  "exact_match": {
    "my_custom_app.exe": "developer_tool"
  }
}
```

Registry merge built-in + user, user override built-in.

---

## **16. Privacy Integration**

### **16.1. Privacy settings ảnh hưởng awareness**

```rust
pub struct PrivacySettings {
    pub private_mode: bool,           // Suspend awareness output
    pub restricted_mode: bool,        // No context to AI at all
    pub allow_fullscreen_detection: bool,
    pub allow_idle_detection: bool,
    pub allow_app_category_export: bool,
}
```

### **16.2. Behavior matrix**

| **Setting** | **Effect** |
|---|---|
| `private_mode = true` | Sanitizer returns `None`. Awareness vẫn chạy nhưng không export. |
| `restricted_mode = true` | Không gửi context ra AI dù mode nào. |
| `allow_fullscreen_detection = false` | `is_fullscreen` luôn `false` trong sanitized. |
| `allow_idle_detection = false` | `idle_seconds` không dùng để propose Idle mode. |
| `allow_app_category_export = false` | `app_category` luôn `Unknown` trong sanitized. |

### **16.3. Private mode entry/exit**

```text
Entry (User toggles ON):
  1. Emit PrivateModeToggled(true).
  2. Mode → Private.
  3. Sanitizer stops emitting context.
  4. Polling rate giảm xuống 30s.
  5. State mutation guard chặn relationship changes.

Exit (User toggles OFF):
  1. Emit PrivateModeToggled(false).
  2. Resume normal polling.
  3. Re-classify current foreground.
  4. Transition to appropriate mode.
```

---

## **17. Backend: AwarenessManager**

### **17.1. Module trách nhiệm**

```rust
pub struct AwarenessManager {
    sensor: Arc<platformsensor>,
    classifier: Arc<mutex<contextclassifier>&gt;,
    sanitizer: Arc<contextsanitizer>,
    hysteresis: Arc<mutex<modehysteresis>&gt;,
    poller: Arc<mutex<adaptivepoller>&gt;,
    event_bus: Arc<awarenesseventbus>,
    current_state: Arc<rwlock<awarenessstate>&gt;,
    privacy: Arc<rwlock<privacysettings>&gt;,
    audit: Arc<awarenessauditlogger>,
}

#[derive(Debug, Clone)]
pub struct AwarenessState {
    pub current_mode: AppMode,
    pub last_classified: Option<classifiedcontext>,
    pub last_sanitized: Option<sanitizeddesktopcontext>,
    pub last_milestone_at: HashMap<u32, datetime<utc="">&gt;,
}
```

### **17.2. Public methods**

```rust
impl AwarenessManager {
    pub async fn init(config: AwarenessConfig) -&gt; Result<self>;

    // Lifecycle
    pub async fn start(&amp;self) -&gt; Result&lt;()&gt;;
    pub async fn stop(&amp;self) -&gt; Result&lt;()&gt;;

    // Core tick
    pub async fn tick(&amp;self) -&gt; Result<awarenesssnapshot>;

    // Read API
    pub async fn current_mode(&amp;self) -&gt; AppMode;
    pub async fn current_snapshot(&amp;self) -&gt; AwarenessSnapshot;
    pub async fn sanitized_context(&amp;self) -&gt; Option<sanitizeddesktopcontext>;

    // Privacy
    pub async fn set_private_mode(&amp;self, enabled: bool) -&gt; Result&lt;()&gt;;
    pub async fn update_privacy_settings(&amp;self, settings: PrivacySettings) -&gt; Result&lt;()&gt;;

    // Subscription
    pub fn subscribe_events(&amp;self) -&gt; broadcast::Receiver<awarenessevent>;

    // Debug
    pub async fn dump_debug(&amp;self) -&gt; Result<awarenessdebugdump>;
}
```

### **17.3. Main tick flow**

```rust
pub async fn tick(&amp;self) -&gt; Result<awarenesssnapshot> {
    let privacy = self.privacy.read().await.clone();

    // 1. Read raw sensors
    let raw = self.sensor.read().await?;

    // 2. Classify
    let mut classifier = self.classifier.lock().await;
    let classification = classifier.classify(&amp;raw);
    drop(classifier);

    // 3. Mode hysteresis
    let current_mode = self.current_state.read().await.current_mode;
    let mut hysteresis = self.hysteresis.lock().await;
    let new_mode = hysteresis.evaluate(
        current_mode,
        classification.proposed_mode,
        Instant::now(),
    );
    drop(hysteresis);

    let effective_mode = new_mode.unwrap_or(current_mode);

    // 4. Sanitize
    let sanitized = self.sanitizer.sanitize(
        &amp;classification.classified,
        effective_mode,
        &amp;privacy,
    );

    // 5. Update state
    let mut state = self.current_state.write().await;
    let mode_changed = state.current_mode != effective_mode;
    let category_changed = state.last_classified
        .as_ref()
        .map(|c| c.app_category != classification.classified.app_category)
        .unwrap_or(true);

    state.current_mode = effective_mode;
    state.last_classified = Some(classification.classified.clone());
    state.last_sanitized = sanitized.clone();
    drop(state);

    // 6. Emit events
    if mode_changed {
        self.event_bus.emit(AwarenessEvent::ModeChanged {
            from: current_mode,
            to: effective_mode,
            at: Utc::now(),
        });
        self.audit.log_mode_change(current_mode, effective_mode).await?;
    }

    if category_changed {
        self.event_bus.emit(AwarenessEvent::AppCategoryChanged {
            from: AppCategory::Unknown,  // simplified
            to: classification.classified.app_category,
            at: Utc::now(),
        });
    }

    // 7. Check session milestones
    self.check_session_milestones(&amp;classification.classified).await;

    // 8. Build snapshot
    Ok(AwarenessSnapshot {
        current_mode: effective_mode,
        app_category: classification.classified.app_category,
        is_fullscreen: classification.classified.is_fullscreen,
        idle_seconds: classification.classified.idle_seconds,
        session_duration_minutes: (classification.classified.session_duration_seconds / 60) as u32,
        monitor_index: classification.classified.monitor_index,
        activity_level: classification.classified.input_activity_level,
        updated_at: Utc::now(),
    })
}
```

### **17.4. Session milestone check**

```rust
async fn check_session_milestones(&amp;self, classified: &amp;ClassifiedContext) {
    let minutes = (classified.session_duration_seconds / 60) as u32;
    let milestones = [45u32, 90, 120, 180, 240];

    let mut state = self.current_state.write().await;
    for &amp;milestone in &amp;milestones {
        if minutes &gt;= milestone {
            let already_emitted = state.last_milestone_at
                .get(&amp;milestone)
                .map(|t| (Utc::now() - *t).num_minutes() &lt; 60)
                .unwrap_or(false);

            if !already_emitted {
                state.last_milestone_at.insert(milestone, Utc::now());
                self.event_bus.emit(AwarenessEvent::SessionMilestone {
                    category: classified.app_category,
                    duration_minutes: milestone,
                    at: Utc::now(),
                });
            }
        }
    }
}
```

---

## **18. Platform Adapter (Windows)**

### **18.1. PlatformSensor trait**

```rust
#[async_trait::async_trait]
pub trait PlatformSensor: Send + Sync {
    async fn read(&amp;self) -&gt; Result<rawsensorreading>;
    async fn list_monitors(&amp;self) -&gt; Result<vec<monitorinfo>&gt;;
    async fn supports_fullscreen_detection(&amp;self) -&gt; bool;
}
```

### **18.2. Windows implementation**

```rust
pub struct WindowsSensor {
    process_name_cache: Mutex<lrucache<u32, string="">&gt;,
}

#[async_trait::async_trait]
impl PlatformSensor for WindowsSensor {
    async fn read(&amp;self) -&gt; Result<rawsensorreading> {
        tokio::task::spawn_blocking(|| {
            let hwnd = unsafe { GetForegroundWindow() };
            if hwnd.0 == 0 {
                return Ok(RawSensorReading::empty());
            }

            let mut pid: u32 = 0;
            unsafe { GetWindowThreadProcessId(hwnd, Some(&amp;mut pid)); }

            let process_name = get_process_name(pid).ok();
            let path = get_process_path(pid).ok();
            let title = get_window_title(hwnd).ok();
            let last_input = get_last_input_time_ms()?;
            let is_fullscreen = check_fullscreen(hwnd)?;
            let monitor_index = get_monitor_index(hwnd)?;

            Ok(RawSensorReading {
                foreground_process_name: process_name,
                foreground_window_title: title,
                foreground_pid: Some(pid),
                foreground_path: path,
                last_input_at_ms: last_input,
                is_fullscreen,
                monitor_index,
                captured_at: Utc::now(),
            })
        }).await?
    }

    async fn list_monitors(&amp;self) -&gt; Result<vec<monitorinfo>&gt; {
        tokio::task::spawn_blocking(|| {
            enumerate_monitors()
        }).await?
    }

    async fn supports_fullscreen_detection(&amp;self) -&gt; bool {
        true
    }
}
```

### **18.3. Win32 helpers**

```rust
fn get_last_input_time_ms() -&gt; Result<u64> {
    let mut lii = LASTINPUTINFO {
        cbSize: std::mem::size_of::<lastinputinfo>() as u32,
        dwTime: 0,
    };

    let success = unsafe { GetLastInputInfo(&amp;mut lii) };
    if !success.as_bool() {
        return Err(anyhow!("GetLastInputInfo failed"));
    }

    let tick_count = unsafe { GetTickCount() };
    let idle_ms = tick_count.saturating_sub(lii.dwTime) as u64;
    let now_ms = chrono::Utc::now().timestamp_millis() as u64;

    Ok(now_ms.saturating_sub(idle_ms))
}

fn check_fullscreen(hwnd: HWND) -&gt; Result<bool> {
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
    let mut mi = MONITORINFO {
        cbSize: std::mem::size_of::<monitorinfo>() as u32,
        ..Default::default()
    };

    if !unsafe { GetMonitorInfoW(monitor, &amp;mut mi) }.as_bool() {
        return Ok(false);
    }

    let mut window_rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &amp;mut window_rect) }.is_err() {
        return Ok(false);
    }

    Ok(window_rect.left == mi.rcMonitor.left
        &amp;&amp; window_rect.top == mi.rcMonitor.top
        &amp;&amp; window_rect.right == mi.rcMonitor.right
        &amp;&amp; window_rect.bottom == mi.rcMonitor.bottom)
}
```

### **18.4. Future platforms**

```text
- macOS: NSWorkspace.frontmostApplication, CGEventSourceSecondsSinceLastEventType
- Linux: X11 _NET_ACTIVE_WINDOW or Wayland (limited)

Để mở rộng: implement `PlatformSensor` cho mỗi platform.
Logic chính (classifier, sanitizer, mode evaluator) không đổi.
```

---

## **19. IPC Contract**

### **19.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `awareness_get_snapshot` | `{}` | `AwarenessSnapshot` |
| `awareness_get_sanitized_context` | `{}` | `SanitizedDesktopContext \| null` |
| `awareness_get_current_mode` | `{}` | `AppMode` |
| `awareness_set_private_mode` | `{ enabled: boolean }` | `void` |
| `awareness_update_privacy` | `PrivacySettings` | `void` |
| `awareness_dump_debug` | `{}` | `AwarenessDebugDump` (debug only) |
| `awareness_list_monitors` | `{}` | `MonitorInfo[]` |

### **19.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `awareness_mode_changed` | `{ from, to, at }` | UI react theo mode |
| `awareness_idle_started` | `{ at }` | Overlay có thể dim |
| `awareness_idle_ended` | `{ idle_duration_seconds, at }` | Welcome back |
| `awareness_fullscreen_entered` | `{ category, at }` | Auto-hide overlay |
| `awareness_fullscreen_exited` | `{ at }` | Restore overlay |
| `awareness_session_milestone` | `{ category, duration_minutes, at }` | Proactive trigger |
| `awareness_private_mode_toggled` | `{ enabled, at }` | UI indicator |

### **19.3. TypeScript IPC types**

```typescript
export interface AwarenessSnapshot {
  current_mode: AppMode;
  app_category: AppCategory;
  is_fullscreen: boolean;
  idle_seconds: number;
  session_duration_minutes: number;
  monitor_index: number;
  activity_level: "idle" | "low" | "medium" | "high";
  updated_at: string;
}

export interface PrivacySettings {
  private_mode: boolean;
  restricted_mode: boolean;
  allow_fullscreen_detection: boolean;
  allow_idle_detection: boolean;
  allow_app_category_export: boolean;
}

export interface ModeChangedEvent {
  from: AppMode;
  to: AppMode;
  at: string;
}

export interface SessionMilestoneEvent {
  category: AppCategory;
  duration_minutes: number;
  at: string;
}
```

---

## **20. Frontend Integration**

### **20.1. Awareness store (Zustand)**

```typescript
import { create } from "zustand";

interface AwarenessStore {
  snapshot: AwarenessSnapshot | null;
  privateMode: boolean;

  refresh: () =&gt; Promise<void>;
  togglePrivateMode: () =&gt; Promise<void>;

  onModeChanged: (event: ModeChangedEvent) =&gt; void;
  onFullscreenEntered: (category: AppCategory) =&gt; void;
  onFullscreenExited: () =&gt; void;
  onSessionMilestone: (event: SessionMilestoneEvent) =&gt; void;
}

export const useAwarenessStore = create<awarenessstore>((set, get) =&gt; ({
  snapshot: null,
  privateMode: false,

  refresh: async () =&gt; {
    const snapshot = await invoke<awarenesssnapshot>("awareness_get_snapshot");
    set({ snapshot });
  },

  togglePrivateMode: async () =&gt; {
    const next = !get().privateMode;
    await invoke("awareness_set_private_mode", { enabled: next });
    set({ privateMode: next });
  },

  onModeChanged: (event) =&gt; {
    set((state) =&gt; ({
      snapshot: state.snapshot
        ? { ...state.snapshot, current_mode: event.to }
        : null,
    }));
  },

  onFullscreenEntered: (category) =&gt; {
    console.log("fullscreen entered", category);
  },

  onFullscreenExited: () =&gt; {
    console.log("fullscreen exited");
  },

  onSessionMilestone: (event) =&gt; {
    console.log("session milestone", event);
  },
}));
```

### **20.2. Event listener setup**

```typescript
export async function setupAwarenessListeners() {
  await listen<modechangedevent>("awareness_mode_changed", (event) =&gt; {
    useAwarenessStore.getState().onModeChanged(event.payload);
  });

  await listen&lt;{ category: AppCategory; at: string }&gt;(
    "awareness_fullscreen_entered",
    (event) =&gt; {
      useAwarenessStore.getState().onFullscreenEntered(event.payload.category);
    }
  );

  await listen("awareness_fullscreen_exited", () =&gt; {
    useAwarenessStore.getState().onFullscreenExited();
  });

  await listen<sessionmilestoneevent>(
    "awareness_session_milestone",
    (event) =&gt; {
      useAwarenessStore.getState().onSessionMilestone(event.payload);
    }
  );
}
```

### **20.3. UI components**

```text
- ModeIndicator: hiển thị icon mode hiện tại (Focus, Gaming...)
- PrivateModeToggle: switch trong settings hoặc radial menu
- SessionTimer: hiển thị session duration (chỉ in debug)
- AwarenessDebugPanel: hiển thị raw snapshot (chỉ dev mode)
```

---

## **21. Logging &amp; Audit**

### **21.1. Audit log schema**

```sql
CREATE TABLE awareness_audit_log (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    from_mode TEXT,
    to_mode TEXT,
    app_category TEXT,
    duration_minutes INTEGER,
    created_at DATETIME NOT NULL
);

CREATE INDEX idx_awareness_audit_created ON awareness_audit_log(created_at);
```

### **21.2. Log levels**

| **Level** | **Loại event** |
|---|---|
| **TRACE** | Mỗi tick (only if debug flag) |
| **DEBUG** | Classification result |
| **INFO** | Mode change, session milestone, private mode toggle |
| **WARN** | Sensor read fail, classifier confidence &lt; 0.3 |
| **ERROR** | Platform adapter crash, registry load fail |

### **21.3. Privacy**

```text
- Audit log KHÔNG bao giờ lưu:
  - window_title
  - process path
  - pid
  - command line
- Chỉ lưu: app_category, mode, duration.
- Rotation: giữ 7 ngày.
- User có thể clear log từ settings.
```

---

## **22. Error Handling**

### **22.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum AwarenessError {
    #[error("Platform sensor unavailable: {0}")]
    SensorUnavailable(String),

    #[error("Win32 API failed: {0}")]
    Win32Failed(String),

    #[error("Registry load failed: {0}")]
    RegistryLoadFailed(String),

    #[error("Classification failed: {0}")]
    ClassificationFailed(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Process access denied")]
    ProcessAccessDenied,
}
```

### **22.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Sensor unavailable | Fallback Normal mode, retry mỗi 30s |
| Win32 API fail | Skip tick, log warn, retry next |
| Registry load fail | Use built-in defaults, alert in settings |
| Process access denied | Mark category Unknown, không retry process |
| Permission denied | Disable awareness, switch to manual mode |
| Adapter crash | Restart adapter, fallback Normal mode |

### **22.3. Crash recovery**

```text
On app start:
  1. Load registry (default + user).
  2. Init platform sensor.
  3. Test sensor.read() one time.
  4. If sensor fail → Awareness disabled, UI alert.
  5. Else → start polling loop.
  6. Recover from previous mode if saved.
```

---

## **23. Performance Considerations**

### **23.1. CPU budget**

```text
Target: &lt; 0.5% CPU idle, &lt; 1% active.

Optimizations:
  - Adaptive polling (giảm tần suất khi idle).
  - Cache process name by PID (avoid repeated OpenProcess).
  - spawn_blocking để không block tokio runtime.
  - Skip classification nếu raw không đổi (cheap PID check).
```

### **23.2. Memory footprint**

```text
- Registry: ~10KB (loaded once).
- LRU cache (PID → name): max 256 entries, ~16KB.
- Current snapshot: ~500 bytes.
- Event channel buffer: 128 events × ~200 bytes = ~25KB.
- Total: ~60KB.
```

### **23.3. Latency targets**

| **Operation** | **Target** |
|---|---|
| `sensor.read()` | &lt; 5ms |
| `classifier.classify()` | &lt; 100μs |
| `sanitizer.sanitize()` | &lt; 50μs |
| Full tick | &lt; 10ms |
| Event emit | &lt; 50μs |

### **23.4. Battery considerations**

```text
- Trên laptop: tăng poll interval khi battery &lt; 20%.
- Pause polling khi system suspend.
- Resume khi WM_POWERBROADCAST resume event.
```

---

## **24. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── awareness/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── classifier.rs
│               ├── sanitizer.rs
│               ├── mode_evaluator.rs
│               ├── hysteresis.rs
│               ├── poller.rs
│               ├── session_tracker.rs
│               ├── registry.rs
│               ├── events.rs
│               ├── audit.rs
│               ├── errors.rs
│               └── platform/
│                   ├── mod.rs
│                   ├── windows.rs
│                   ├── macos.rs (future)
│                   └── linux.rs (future)
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── awareness_commands.rs
│
├── src/
│   ├── overlay/
│   │   └── stores/
│   │       └── awarenessStore.ts
│   │
│   ├── settings/
│   │   └── pages/
│   │       ├── Privacy.tsx
│   │       └── AwarenessDebug.tsx
│   │
│   └── shared/
│       └── types/
│           └── awareness.ts
│
├── assets/
│   └── awareness/
│       └── app_categories.json
│
└── docs/
    └── desktop-awareness-system.md
```

---

## **25. Implementation Checklist**

### **25.1. P0 Core**

- [ ] Define `RawSensorReading`, `ClassifiedContext`, `SanitizedDesktopContext`.
- [ ] Define `AppCategory`, `AppMode`, `ActivityLevel`, `TimeOfDay`.
- [ ] Implement `WindowsSensor` (PlatformSensor trait).
- [ ] Implement `GetForegroundWindow`, `GetLastInputInfo` calls.
- [ ] Implement fullscreen detection (rect comparison).
- [ ] Implement `AppCategoryRegistry` loader.
- [ ] Implement `AppClassifier` (exact + substring + path hints).
- [ ] Implement `SessionTracker`.
- [ ] Implement `ModeEvaluator`.
- [ ] Implement `ContextClassifier` (full pipeline).
- [ ] Implement `ContextSanitizer`.
- [ ] Implement `AwarenessManager::tick`.

### **25.2. P0 Mode Machine**

- [ ] Implement `ModeHysteresis`.
- [ ] Define transition durations matrix.
- [ ] Test all transition paths.
- [ ] Idle mode entry/exit.
- [ ] Private mode entry/exit.

### **25.3. P0 Polling**

- [ ] Implement `AdaptivePoller`.
- [ ] Implement awareness loop.
- [ ] CPU usage benchmark.

### **25.4. P0 Events**

- [ ] Implement `AwarenessEventBus`.
- [ ] Emit `ModeChanged`.
- [ ] Emit `SessionMilestone` (45, 90, 120).
- [ ] Emit `FullscreenEntered/Exited`.
- [ ] Emit `IdleStarted/Ended`.
- [ ] Wire frontend listeners.

### **25.5. P0 Privacy**

- [ ] Implement `PrivacySettings` integration.
- [ ] Private mode suspends sanitizer output.
- [ ] Restricted mode blocks AI context.
- [ ] Audit log redacts sensitive fields.

### **25.6. P1 Multi-Monitor**

- [ ] Implement `enumerate_monitors`.
- [ ] Detect `WM_DISPLAYCHANGE`.
- [ ] Emit `MonitorsChanged`.
- [ ] DPI change handling.

### **25.7. P1 Frontend**

- [ ] Awareness store (Zustand).
- [ ] Privacy settings UI.
- [ ] Mode indicator component.
- [ ] Awareness debug panel (dev only).

### **25.8. P1 User Extensions**

- [ ] Custom categories JSON loader.
- [ ] UI to add custom mapping.
- [ ] Merge built-in + user.

### **25.9. P2 Polish**

- [ ] macOS adapter (future).
- [ ] Linux adapter (future).
- [ ] Battery-aware polling.
- [ ] Meeting detection (audio/camera heuristic).
- [ ] Browser-with-video heuristic.
- [ ] Performance benchmarks (CPU, memory).

---

## **26. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Foreground Window** | Cửa sổ đang active (có focus) trên desktop. |
| **Raw Sensor Reading** | Dữ liệu thô từ OS, không bao giờ rời module. |
| **Classified Context** | Context đã phân loại, dùng nội bộ subsystem. |
| **Sanitized Context** | Context đã làm sạch, có thể gửi AI. |
| **App Category** | Phân loại app (developer_tool, browser, game...). |
| **AppMode** | Chế độ tổng thể (Normal, Focus, Gaming, Meeting...). |
| **Hysteresis** | Cơ chế chống flip mode quá nhanh. |
| **Adaptive Polling** | Polling rate thay đổi theo activity level. |
| **Session Milestone** | Mốc thời gian liên tục cùng category (45, 90, 120 phút). |
| **Activity Level** | Mức độ tương tác (Idle, Low, Medium, High). |
| **Time of Day** | Buổi trong ngày (early_morning, morning, afternoon, evening, night). |
| **Privacy Level** | Mức privacy (normal, private, restricted). |

---

# **Phụ lục A: Flow chuẩn một awareness tick**

```text
AwarenessLoop trigger (adaptive interval)
       ↓
PlatformSensor.read()
       ↓
RawSensorReading (in memory only)
       ↓
ContextClassifier.classify(raw)
       ↓
  ├─ AppClassifier → (category, confidence)
  ├─ SessionTracker → session_duration_seconds
  ├─ compute_activity_level → ActivityLevel
  └─ ModeEvaluator → proposed_mode
       ↓
ClassificationOutput { classified, proposed_mode }
       ↓
ModeHysteresis.evaluate(current, proposed, now)
       ↓
effective_mode (current or new)
       ↓
ContextSanitizer.sanitize(classified, effective_mode, privacy)
       ↓
SanitizedDesktopContext (or None if private)
       ↓
Update AwarenessState
       ↓
If mode changed → emit ModeChanged
If category changed → emit AppCategoryChanged
Check session milestones → emit SessionMilestone if any
       ↓
Build AwarenessSnapshot
       ↓
AdaptivePoller.next_interval(activity, mode)
       ↓
sleep(next_interval)
       ↓
Loop
```

---

# **Phụ lục B: Flow mode transition**

```text
Current mode: Normal
User opens VS Code, starts coding
       ↓
Tick 1 (t=0):
  category = developer_tool
  session = 0s
  proposed = Normal (session &lt; 30min)
  effective = Normal
       ↓
... (continued coding for 30 minutes) ...
       ↓
Tick N (t=30min):
  category = developer_tool
  session = 1800s
  proposed = Focus (session &gt;= 30min)
       ↓
ModeHysteresis:
  candidate = Focus
  candidate_since = now
  required = 60s
  not enough time → return None
       ↓
effective = Normal (still)
       ↓
Tick N+1 (t=30min + 60s):
  proposed = Focus
  candidate = Focus (still)
  elapsed = 60s &gt;= 60s required
  → return Some(Focus)
       ↓
effective = Focus
mode_changed = true
       ↓
Emit ModeChanged { from: Normal, to: Focus }
       ↓
Subscribers react:
  - AnimationDirector: switch to calm idle variant
  - AIOrchestrator: update next prompt context
  - ProactivityController: reduce proactive frequency
  - StateManager: apply focus mode policy
       ↓
... (user opens YouTube fullscreen) ...
       ↓
Tick M:
  category = browser
  is_fullscreen = true
  proposed = Watching
       ↓
ModeHysteresis: candidate Watching, required 20s
       ↓
After 20s in fullscreen browser:
  effective = Watching
       ↓
Emit ModeChanged { from: Focus, to: Watching }
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. AwarenessSnapshot mẫu**

```json
{
  "current_mode": "focus",
  "app_category": "developer_tool",
  "is_fullscreen": false,
  "idle_seconds": 5,
  "session_duration_minutes": 47,
  "monitor_index": 0,
  "activity_level": "high",
  "updated_at": "2026-05-26T22:00:00Z"
}
```

## **C.2. SanitizedDesktopContext mẫu**

```json
{
  "app_category": "developer_tool",
  "session_duration_minutes": 45,
  "is_fullscreen": false,
  "mode": "focus",
  "time_of_day": "night",
  "privacy_level": "normal",
  "sanitized_at": "2026-05-26T22:00:00Z"
}
```

## **C.3. ModeChanged event mẫu**

```json
{
  "type": "mode_changed",
  "from": "normal",
  "to": "focus",
  "at": "2026-05-26T22:00:00Z"
}
```

## **C.4. SessionMilestone event mẫu**

```json
{
  "type": "session_milestone",
  "category": "developer_tool",
  "duration_minutes": 45,
  "at": "2026-05-26T22:00:00Z"
}
```

## **C.5. FullscreenEntered event mẫu**

```json
{
  "type": "fullscreen_entered",
  "category": "game",
  "at": "2026-05-26T22:30:00Z"
}
```

## **C.6. PrivacySettings mẫu**

```json
{
  "private_mode": false,
  "restricted_mode": false,
  "allow_fullscreen_detection": true,
  "allow_idle_detection": true,
  "allow_app_category_export": true
}
```

## **C.7. App category registry mẫu (rút gọn)**

```json
{
  "version": 1,
  "exact_match": {
    "code.exe": "developer_tool",
    "chrome.exe": "browser",
    "discord.exe": "communication",
    "league of legends.exe": "game"
  },
  "substring_match": [
    { "pattern": "minecraft", "category": "game" }
  ],
  "path_hints": [
    { "pattern": "steamapps", "category": "game" }
  ]
}
```

---

**Tài liệu này là source of truth cho Desktop Awareness System. Mọi subsystem cần đọc desktop context phải tuân thủ nguyên tắc: raw data không rời module, mọi context AI nhận đều đã sanitize, mode change phải qua hysteresis, polling phải adaptive theo activity, private mode phải được tôn trọng tuyệt đối.**

---