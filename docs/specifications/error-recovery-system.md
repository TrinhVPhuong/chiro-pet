# **Chiro-Pet Error Recovery System**

> Tài liệu thiết kế chính thức cho **Error Recovery System** của **Chiro-Pet**.  
> Hệ thống này định nghĩa cách app phát hiện, cô lập, ghi nhận, phục hồi và fallback khi xảy ra lỗi ở các subsystem như **Overlay**, **AI**, **Asset**, **State**, **Settings**, **Memory**, **SQLite**, **Renderer**, **Hotkey** và **Desktop Awareness**.
>
> **Nguyên tắc lõi:** App không được crash chỉ vì một subsystem lỗi. Mọi lỗi phải đi qua **Error Boundary**, **Recovery Policy**, **Fallback Strategy**, **Audit Logger** và **User-facing Reporter**. Nếu không thể phục hồi an toàn, app phải **fail safe**, **giữ dữ liệu**, **giảm tính năng**, rồi cho user cách sửa.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Error Recovery Architecture](#3-error-recovery-architecture)
4. [Error Taxonomy](#4-error-taxonomy)
5. [Severity Model](#5-severity-model)
6. [Recovery Modes](#6-recovery-modes)
7. [Global Error Boundary](#7-global-error-boundary)
8. [Crash Recovery](#8-crash-recovery)
9. [Settings Recovery](#9-settings-recovery)
10. [Database Recovery](#10-database-recovery)
11. [Asset Recovery](#11-asset-recovery)
12. [Renderer Recovery](#12-renderer-recovery)
13. [AI Provider Recovery](#13-ai-provider-recovery)
14. [Overlay Window Recovery](#14-overlay-window-recovery)
15. [State & Memory Recovery](#15-state--memory-recovery)
16. [Desktop Awareness Recovery](#16-desktop-awareness-recovery)
17. [Hotkey Recovery](#17-hotkey-recovery)
18. [Backup & Restore System](#18-backup--restore-system)
19. [Diagnostic System](#19-diagnostic-system)
20. [User-facing Error Reporting](#20-user-facing-error-reporting)
21. [Recovery Policy Engine](#21-recovery-policy-engine)
22. [Backend: ErrorRecoveryManager](#22-backend-errorrecoverymanager)
23. [IPC Contract](#23-ipc-contract)
24. [Frontend Recovery UI](#24-frontend-recovery-ui)
25. [Logging & Audit](#25-logging--audit)
26. [Performance Considerations](#26-performance-considerations)
27. [File Structure](#27-file-structure)
28. [Implementation Checklist](#28-implementation-checklist)
29. [Glossary](#29-glossary)
30. [Phụ lục A: Flow app startup recovery](#phụ-lục-a-flow-app-startup-recovery)
31. [Phụ lục B: Flow asset load failure](#phụ-lục-b-flow-asset-load-failure)
32. [Phụ lục C: Flow AI provider failure](#phụ-lục-c-flow-ai-provider-failure)
33. [Phụ lục D: JSON mẫu](#phụ-lục-d-json-mẫu)
34. [Tổng kết tài liệu đã tổng hợp và còn lại](#34-tổng-kết-tài-liệu-đã-tổng-hợp-và-còn-lại)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Error Recovery System của **Chiro-Pet** phải:

- Ngăn lỗi đơn lẻ làm crash toàn app.
- Phân loại lỗi theo subsystem, severity và recoverability.
- Tự động phục hồi các lỗi phổ biến:
  - settings corrupt
  - SQLite locked/corrupt nhẹ
  - asset missing/corrupt
  - VRM load fail
  - AI provider timeout/down/auth fail
  - overlay window lost/out-of-screen
  - hotkey register fail
  - awareness sensor fail
- Có fallback an toàn:
  - default settings
  - default bundled model
  - default animation
  - local template response
  - normal mode
  - disabled subsystem
- Ghi audit log đủ để debug nhưng không leak dữ liệu nhạy cảm.
- Cung cấp diagnostics để user/dev kiểm tra tình trạng app.
- Cho phép user:
  - repair data
  - restore backup
  - reset subsystem
  - export diagnostic bundle
  - full safe reset nếu cần
- Đảm bảo privacy khi lỗi:
  - không dump raw prompt
  - không dump API key
  - không dump raw desktop title/path

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Error taxonomy.
- Recovery policy.
- Crash recovery.
- Backup and restore.
- Settings recovery.
- Database recovery.
- Asset recovery.
- Renderer recovery.
- AI provider recovery.
- Overlay recovery.
- State/Memory recovery.
- Desktop awareness recovery.
- Hotkey recovery.
- Diagnostic and user-facing error UI.
- IPC contract.

Tài liệu này không mô tả chi tiết:

- Nội bộ từng subsystem.
- UI settings đầy đủ.
- Telemetry/debug dashboard chi tiết.
- Shader/render quality recovery nâng cao.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Fail safe** | Nếu không chắc, chặn action nguy hiểm và dùng fallback an toàn. |
| **2** | **Subsystem isolation** | Một subsystem lỗi không được kéo sập toàn app. |
| **3** | **Recover before reset** | Thử repair hoặc fallback trước khi reset dữ liệu. |
| **4** | **Never lose user data silently** | Trước khi repair/reset phải backup dữ liệu cũ nếu có thể. |
| **5** | **User-visible when needed** | Lỗi nghiêm trọng phải báo rõ, không im lặng hoàn toàn. |
| **6** | **Privacy-safe diagnostics** | Diagnostic bundle phải redact secret và raw context. |
| **7** | **Default fallback exists** | Model, animation, settings, prompt template phải có default. |
| **8** | **Retry bounded** | Retry có giới hạn, tránh loop vô hạn. |
| **9** | **Circuit breaker for repeated failure** | Subsystem lỗi liên tục thì tạm disable. |
| **10** | **Audit every recovery action** | Mọi repair/reset/fallback phải có log. |

### **2.2. Anti-pattern cần tránh**

- ❌ Panic trực tiếp ở core subsystem.
- ❌ Reset database khi chưa backup.
- ❌ Lặp retry AI provider vô hạn.
- ❌ Renderer load model lỗi rồi blank screen mãi.
- ❌ Overlay ngoài màn hình mà không tự kéo về primary monitor.
- ❌ Lỗi hotkey làm app không khởi động.
- ❌ Ghi API key hoặc prompt raw vào diagnostic.
- ❌ Nuốt lỗi nghiêm trọng mà không có log.
- ❌ Một event lỗi làm chết event loop.
- ❌ Không có đường manual repair cho user.

---

## **3. Error Recovery Architecture**

```text
┌──────────────────────────────────────────────────────────────┐
│                       ERROR SOURCES                           │
│                                                              │
│  AI / Asset / Renderer / Overlay / SQLite / Settings          │
│  State / Memory / Awareness / Hotkey / IPC / Frontend         │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                    ERROR BOUNDARY LAYER                       │
│                                                              │
│  - panic hook                                                 │
│  - subsystem result mapping                                   │
│  - frontend error boundary                                   │
│  - IPC error normalization                                   │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                 ERROR RECOVERY MANAGER                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Error Classifier                                       │  │
│  │ - subsystem                                            │  │
│  │ - severity                                             │  │
│  │ - recoverability                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Recovery Policy Engine                                 │  │
│  │ - retry                                                │  │
│  │ - fallback                                             │  │
│  │ - repair                                               │  │
│  │ - disable subsystem                                    │  │
│  │ - request user action                                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Recovery Executor                                      │  │
│  │ - backup                                               │  │
│  │ - restore                                              │  │
│  │ - reset                                                │  │
│  │ - reload                                               │  │
│  │ - safe mode                                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Diagnostics + Audit                                    │  │
│  │ - logs                                                 │  │
│  │ - health report                                        │  │
│  │ - diagnostic bundle                                    │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                       USER / UI                               │
│  - toast warning                                              │
│  - repair dialog                                              │
│  - diagnostics panel                                          │
│  - safe reset                                                 │
└──────────────────────────────────────────────────────────────┘
```

---

## **4. Error Taxonomy**

### **4.1. ErrorSubsystem**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ErrorSubsystem {
    App,
    Ipc,
    Settings,
    Database,
    Character,
    State,
    Memory,
    Ai,
    Asset,
    Animation,
    Renderer,
    Overlay,
    Awareness,
    Privacy,
    Behavior,
    Hotkey,
    FileSystem,
    Network,
    Unknown,
}
```

### **4.2. ErrorCategory**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCategory {
    Validation,
    Permission,
    PrivacyBlocked,
    NotFound,
    Corruption,
    Timeout,
    Network,
    Auth,
    RateLimit,
    ProviderUnavailable,
    FileMissing,
    FileUnreadable,
    ParseFailed,
    RuntimeLoadFailed,
    ResourceExhausted,
    PlatformApiFailed,
    Panic,
    Unknown,
}
```

### **4.3. Recoverability**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Recoverability {
    AutoRecoverable,
    UserActionRequired,
    RequiresRestart,
    RequiresReset,
    Fatal,
}
```

### **4.4. ErrorRecord**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorRecord {
    pub error_id: String,
    pub subsystem: ErrorSubsystem,
    pub category: ErrorCategory,
    pub severity: ErrorSeverity,
    pub recoverability: Recoverability,

    pub code: String,
    pub message: String,
    pub safe_details: Option<serde_json::value>,

    pub source_context: ErrorSourceContext,
    pub occurred_at: DateTime<utc>,

    pub recovery_attempted: bool,
    pub recovery_status: Option<recoverystatus>,
    pub user_visible: bool,
}
```

### **4.5. ErrorSourceContext**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorSourceContext {
    pub request_id: Option<string>,
    pub character_id: Option<string>,
    pub asset_id: Option<string>,
    pub command_name: Option<string>,
    pub operation: Option<string>,
}
```

---

## **5. Severity Model**

### **5.1. ErrorSeverity**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum ErrorSeverity {
    Trace,
    Info,
    Warning,
    Error,
    Critical,
    Fatal,
}
```

### **5.2. Severity meaning**

| **Severity** | **Ý nghĩa** | **Ví dụ** | **User visible?** |
|---|---|---|---|
| **Trace** | Debug rất nhỏ | Retry internal | Không |
| **Info** | Event recovery bình thường | Fallback template dùng | Không hoặc debug |
| **Warning** | Có vấn đề nhưng app chạy | Hotkey conflict | Có trong settings |
| **Error** | Feature lỗi | AI provider timeout | Có nếu user đang dùng |
| **Critical** | Subsystem quan trọng lỗi | DB locked lâu, renderer fail | Có |
| **Fatal** | App không thể tiếp tục | DB không mở được + backup fail | Có, cần safe mode |

### **5.3. Severity policy**

```text
Trace/Info:
  - log only

Warning:
  - log
  - optional toast/settings warning

Error:
  - log
  - user visible if action failed
  - fallback if possible

Critical:
  - log
  - show recovery dialog
  - disable broken subsystem if needed

Fatal:
  - enter safe mode or quit gracefully
  - preserve data
  - show diagnostics
```

---

## **6. Recovery Modes**

### **6.1. AppRecoveryMode**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AppRecoveryMode {
    Normal,
    Degraded,
    SafeMode,
    RepairMode,
    FatalBlocked,
}
```

### **6.2. Mode meaning**

| **Mode** | **Ý nghĩa** | **Behavior** |
|---|---|---|
| **Normal** | App chạy đầy đủ | All enabled |
| **Degraded** | Một số subsystem bị disable | App vẫn dùng được |
| **SafeMode** | Chỉ bật UI/settings/repair | Không AI/proactive/awareness |
| **RepairMode** | Đang repair data | Chặn mutation/write |
| **FatalBlocked** | Không thể chạy | Chỉ hiển thị lỗi/diagnostic |

### **6.3. Enter degraded mode**

Khi lỗi lặp lại nhưng app vẫn chạy:

```text
- AI provider fail liên tục → disable AI, dùng fallback template
- Asset load fail → dùng default model
- Awareness fail → force mode Normal
- Hotkey fail → disable hotkeys
```

### **6.4. Enter safe mode**

Khi có lỗi nghiêm trọng ở storage hoặc renderer:

```text
- settings corrupt + backup fail
- database open fail
- migration fail không repair được
- renderer crash nhiều lần
```

Safe Mode chỉ bật:

```text
- Settings UI
- Diagnostics UI
- Data export
- Repair/reset commands
- Minimal overlay disabled by default
```

---

## **7. Global Error Boundary**

### **7.1. Rust panic hook**

```rust
pub fn install_panic_hook(recovery: Arc<errorrecoverymanager>) {
    std::panic::set_hook(Box::new(move |info| {
        let message = info.to_string();

        let record = ErrorRecord {
            error_id: Uuid::new_v4().to_string(),
            subsystem: ErrorSubsystem::App,
            category: ErrorCategory::Panic,
            severity: ErrorSeverity::Fatal,
            recoverability: Recoverability::RequiresRestart,
            code: "app.panic".into(),
            message: sanitize_error_message(&message),
            safe_details: None,
            source_context: ErrorSourceContext::default(),
            occurred_at: Utc::now(),
            recovery_attempted: false,
            recovery_status: None,
            user_visible: true,
        };

        recovery.record_panic_sync(record);
    }));
}
```

### **7.2. Tokio task boundary**

Mọi background task phải bọc lỗi:

```rust
pub async fn spawn_recoverable_task<f>(
    name: &'static str,
    recovery: Arc<errorrecoverymanager>,
    fut: F,
)
where
    F: Future<output =="" result<()="">> + Send + 'static,
{
    tokio::spawn(async move {
        if let Err(e) = fut.await {
            recovery
                .handle_error(ErrorInput::from_task_error(name, e))
                .await;
        }
    });
}
```

### **7.3. IPC boundary**

IPC command không được panic:

```rust
pub async fn map_ipc_error<t>(
    result: Result<t>,
    subsystem: ErrorSubsystem,
) -> Result<t, ipcerror=""> {
    match result {
        Ok(v) => Ok(v),
        Err(e) => {
            let err = classify_domain_error(e, subsystem);
            Err(IpcError::from_error_record(err))
        }
    }
}
```

### **7.4. Frontend React error boundary**

```tsx
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <errorboundary fallbackrender="{({" error,="" reseterrorboundary="" })=""> (
        <recoveryscreen error="{error}" onretry="{resetErrorBoundary}">
      )}
      onError={(error, info) => {
        recoveryIpc.reportFrontendError({
          message: String(error),
          component_stack: info.componentStack ?? null,
        });
      }}
    >
      {children}
    </recoveryscreen></errorboundary>
  );
}
```

---

## **8. Crash Recovery**

### **8.1. Crash marker**

Khi app start thành công, ghi marker:

```json
{
  "session_id": "sess_001",
  "started_at": "2026-05-27T02:00:00Z",
  "clean_shutdown": false,
  "last_heartbeat_at": "2026-05-27T02:01:00Z"
}
```

Khi shutdown sạch:

```json
{
  "clean_shutdown": true
}
```

### **8.2. Crash detection on startup**

```text
App startup
  ↓
Read last session marker
  ↓
If clean_shutdown=false:
  - previous crash suspected
  - run crash recovery flow
  - show optional "Recovered from crash" notice
```

### **8.3. Crash recovery flow**

```text
Previous crash detected
  ↓
Flush/close stale locks if any
  ↓
Run database integrity check
  ↓
Validate settings file
  ↓
Validate active character and state
  ↓
Validate active model asset exists
  ↓
If critical issue:
    enter SafeMode
  else:
    continue Normal/Degraded
  ↓
Write new session marker
```

### **8.4. Heartbeat**

```rust
pub struct CrashHeartbeat {
    marker_path: PathBuf,
    interval: Duration,
}

impl CrashHeartbeat {
    pub async fn run(&self) {
        let mut ticker = tokio::time::interval(self.interval);

        loop {
            ticker.tick().await;
            let _ = self.update_heartbeat().await;
        }
    }
}
```

Default:

```text
heartbeat_interval = 30s
```

---

## **9. Settings Recovery**

### **9.1. Failure cases**

| **Case** | **Recovery** |
|---|---|
| settings file missing | Create default |
| JSON parse fail | Backup corrupt, load backup |
| backup parse fail | Use default |
| validation fail | Try auto-fix, else default |
| migration fail | Backup old, use default |
| credential decrypt fail | Clear credential flag, ask re-enter API key |

### **9.2. Settings recovery flow**

```text
Load app_settings.json
  ↓
Parse success?
  ├─ No:
  │   backup as app_settings.corrupt.<timestamp>.json
  │   try app_settings.backup.json
  │
  └─ Yes:
      run migration
      validate
  ↓
If valid:
  use settings
  ↓
If invalid:
  auto-fix safe fields
  ↓
If still invalid:
  use defaults
```

### **9.3. Auto-fix rules**

| **Invalid field** | **Auto-fix** |
|---|---|
| `overlay.scale` out of range | Clamp `0.5..3.0` |
| `ai.temperature` out of range | Clamp `0.0..2.0` |
| `animation.target_fps` invalid | Set `60` |
| `behavior.daily_greeting_hour` invalid | Set `8` |
| Missing section | Insert default section |
| Unknown extra field | Ignore |

### **9.4. Settings repair result**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingsRepairResult {
    pub used_backup: bool,
    pub used_defaults: bool,
    pub corrupt_backup_path: Option<string>,
    pub fixed_fields: Vec<string>,
    pub warnings: Vec<string>,
}
```

---

## **10. Database Recovery**

### **10.1. SQLite failure cases**

| **Case** | **Recovery** |
|---|---|
| database file missing | Create new |
| schema version old | Run migration |
| migration fail | Backup DB, create new if allowed |
| database locked | Retry with backoff |
| integrity check fail | Backup, try `.recover`, else safe reset |
| WAL corruption | Checkpoint, rebuild WAL |
| disk full | Stop writes, show critical warning |

### **10.2. Database health check**

```sql
PRAGMA integrity_check;
PRAGMA quick_check;
PRAGMA foreign_key_check;
```

### **10.3. Startup DB recovery**

```text
Open SQLite
  ↓
If open fail:
  - check file exists
  - check permissions
  - try read-only open for export
  ↓
Run quick_check
  ↓
If quick_check ok:
  continue
  ↓
If fail:
  backup database
  try sqlite recover
  ↓
If recover success:
  use recovered DB
  ↓
Else:
  enter SafeMode
```

### **10.4. SQLite retry policy**

```rust
pub struct DbRetryPolicy {
    pub max_attempts: u8,
    pub initial_delay_ms: u64,
    pub max_delay_ms: u64,
}

impl Default for DbRetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            initial_delay_ms: 50,
            max_delay_ms: 1000,
        }
    }
}
```

### **10.5. Safe DB backup**

```rust
pub async fn backup_database(db_path: &Path, backup_dir: &Path) -> Result<pathbuf> {
    let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("chiro_pet_backup_{}.sqlite", timestamp));

    tokio::fs::copy(db_path, &backup_path).await?;

    Ok(backup_path)
}
```

### **10.6. DB recovery policy**

```text
MVP policy:
- Never auto-delete corrupt DB.
- Always backup before repair.
- If repair fails, enter SafeMode and offer:
  1. Export readable data
  2. Restore backup
  3. Reset database
```

---

## **11. Asset Recovery**

### **11.1. Asset failure cases**

| **Case** | **Recovery** |
|---|---|
| asset file missing | Mark asset missing, fallback bundled |
| asset invalid | Disable asset, fallback bundled |
| thumbnail missing | Regenerate or use default thumbnail |
| active model load fail | Keep old model, else default model |
| active animation missing | Use default idle/talking animation |
| bundled asset missing | Show install integrity warning |
| dependency points to deleted asset | Repair dependency to default |

### **11.2. Asset health check**

```rust
pub async fn validate_asset_registry(&self) -> AssetRegistryHealth {
    // For each non-deleted asset:
    // - file exists
    // - path inside asset root
    // - hash optional verify
    // - validation status valid
    // - dependency owner exists
}
```

### **11.3. Active model recovery**

```text
Character active model asset_id
  ↓
AssetManager.get_asset
  ↓
If missing/invalid:
  - mark character model unhealthy
  - set runtime fallback to bundled_model_default
  - do not overwrite character profile automatically
  - show repair suggestion
```

### **11.4. Animation fallback chain**

```text
Requested animation
  ↓
If missing:
  role fallback
  ↓
If role fallback missing:
  bundled default role animation
  ↓
If still missing:
  procedural idle only
```

### **11.5. Asset repair actions**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AssetRepairAction {
    RevalidateAsset { asset_id: String },
    RegenerateThumbnail { asset_id: String },
    ReplaceMissingWithDefault { owner_type: String, owner_id: String },
    MarkAssetDeleted { asset_id: String },
    RebuildAssetRegistry,
}
```

---

## **12. Renderer Recovery**

### **12.1. Renderer failure cases**

| **Case** | **Recovery** |
|---|---|
| VRM load exception | Keep old model, fallback default |
| WebGL context lost | Try restore context |
| shader compile fail | Use basic material |
| animation mixer error | Stop animation, fallback idle |
| out of memory | Dispose unused assets, reduce quality |
| render loop crash | Restart renderer component |

### **12.2. WebGL context lost handling**

```typescript
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();

  recoveryIpc.reportRendererError({
    code: "renderer.webgl_context_lost",
    severity: "critical",
  });

  rendererState.setContextLost(true);
});

canvas.addEventListener("webglcontextrestored", async () => {
  await reloadRendererResources();
  rendererState.setContextLost(false);
});
```

### **12.3. Renderer fallback quality**

```text
Quality fallback ladder:
1. Full VRM + MToon + spring bones + procedural
2. VRM + basic MToon, no expensive effects
3. VRM + MeshBasicMaterial
4. Static pose only
5. Hide overlay and show repair UI
```

### **12.4. Model swap recovery**

```typescript
async function safeLoadVrm(assetId: string) {
  const old = currentVrm;

  try {
    const resolved = await assetIpc.resolve(assetId);
    const next = await loadVrm(resolved.file_url);

    await swapModel(next);
    return { ok: true };
  } catch (err) {
    reportRuntimeAssetError(assetId, err);

    if (old) {
      keepCurrentModel();
    } else {
      await loadBundledDefaultModel();
    }

    return { ok: false };
  }
}
```

---

## **13. AI Provider Recovery**

### **13.1. AI failure cases**

| **Case** | **Recovery** |
|---|---|
| timeout | Retry once, then fallback template |
| 429 rate limit | No immediate retry, cooldown |
| 401/403 auth | Disable provider, ask user to check API key |
| 5xx provider error | Retry once, circuit breaker |
| invalid JSON response | Retry with repair prompt once |
| schema invalid | Fallback template |
| budget exceeded | Budget fallback |
| network unavailable | Offline fallback |

### **13.2. Circuit breaker**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerState {
    pub subsystem: ErrorSubsystem,
    pub failure_count: u32,
    pub opened_until: Option<datetime<utc>>,
    pub last_failure_at: Option<datetime<utc>>,
}
```

### **13.3. AI circuit policy**

```text
- 3 consecutive provider failures → open circuit 5 minutes.
- 401/403 → open until config changed.
- 429 → open 1 minute or provider retry-after.
- success → reset failure count.
```

### **13.4. Fallback hierarchy**

```text
AI request fails
  ↓
If direct chat:
  - local error bubble
  - allow retry
  ↓
If proactive:
  - silent or local template
  ↓
If focus reminder:
  - local template if mode allows
  ↓
If emotional support:
  - safe template, no fake deep answer
```

### **13.5. AI recovery result**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiRecoveryResult {
    pub used_retry: bool,
    pub used_fallback: bool,
    pub circuit_opened: bool,
    pub user_action_required: bool,
    pub reason: String,
}
```

---

## **14. Overlay Window Recovery**

### **14.1. Overlay failure cases**

| **Case** | **Recovery** |
|---|---|
| window creation fail | Retry once with default config |
| transparent style fail | Continue non-transparent warning |
| position off-screen | Move to primary monitor |
| DPI query fail | Assume scale 1.0 |
| click-through stuck on | Reset click-through false on hotkey/settings |
| topmost fail | Continue visible non-topmost |
| bubble window fail | Disable bubble, main overlay continues |

### **14.2. Off-screen recovery**

```rust
pub async fn recover_overlay_position(&self) -> Result<()> {
    let pos = self.overlay.get_position().await?;
    let monitors = self.overlay.list_monitors().await?;

    if !position_inside_any_monitor(pos, &monitors) {
        let primary = monitors.iter()
            .find(|m| m.is_primary)
            .ok_or_else(|| anyhow!("no primary monitor"))?;

        let safe_pos = compute_safe_default_position(primary);
        self.overlay.move_to(safe_pos).await?;
    }

    Ok(())
}
```

### **14.3. Click-through emergency reset**

MVP nên có command và hotkey-safe path:

```text
If overlay becomes unclickable:
  - Settings button can call overlay_set_click_through(false)
  - Hotkey can toggle overlay hidden/shown
  - On app start, reset click-through to safe default
```

### **14.4. Overlay safe mode**

```text
Overlay Safe Mode:
- Disable click-through dynamic
- Disable bubble sub-window
- Use default anchor primary monitor
- No always-on-top refresh
- Renderer still allowed if stable
```

---

## **15. State & Memory Recovery**

### **15.1. State failure cases**

| **Case** | **Recovery** |
|---|---|
| active state missing | Init default state |
| state invalid range | Clamp fields |
| daily counter corrupt | Reset counters |
| migration fail | Backup raw, init default state |
| persist fail | Keep cache, retry write |
| cache miss | Reload from store |

### **15.2. State auto-fix**

| **Field** | **Fix** |
|---|---|
| mood outside `-3..3` | Clamp |
| energy outside `-3..3` | Clamp |
| affinity outside `0..100` | Clamp |
| trust outside `0..100` | Clamp |
| last_reset_date invalid | Set today |
| updated_at missing | Set now |

### **15.3. Memory failure cases**

| **Case** | **Recovery** |
|---|---|
| memory row invalid | Skip row, report warning |
| sensitivity missing | Reclassify |
| encrypted memory decrypt fail | Mark locked, ask user action |
| embedding missing | Rebuild if embedding used |
| duplicate memory | Merge candidate |
| proposal corrupt | Reject proposal safely |

### **15.4. Memory safe mode**

If memory subsystem unhealthy:

```text
- AI prompt excludes memory.
- Memory writes disabled.
- Existing memory not deleted.
- User can export/repair from diagnostics.
```

### **15.5. State recovery result**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateRecoveryResult {
    pub character_id: String,
    pub fixed_fields: Vec<string>,
    pub reset_counters: bool,
    pub used_default_state: bool,
}
```

---

## **16. Desktop Awareness Recovery**

### **16.1. Awareness failure cases**

| **Case** | **Recovery** |
|---|---|
| Win32 foreground query fail | Skip tick |
| process access denied | Category Unknown |
| monitor query fail | Use primary/default |
| fullscreen detection fail | Treat as false |
| registry load fail | Use built-in defaults |
| repeated sensor fail | Disable awareness, mode Normal |

### **16.2. Awareness fallback mode**

```text
If awareness unavailable:
- AppMode = Normal
- SanitizedDesktopContext = None or minimal
- Proactivity should be conservative
- No focus milestone triggers
```

### **16.3. Repeated failure policy**

```text
- 1 to 2 failures: log warning
- 3 consecutive failures: increase polling interval
- 5 consecutive failures: disable awareness for session
- user can retry from settings
```

### **16.4. Awareness recovery result**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AwarenessRecoveryResult {
    pub disabled_for_session: bool,
    pub fallback_mode: AppMode,
    pub reason: String,
}
```

---

## **17. Hotkey Recovery**

### **17.1. Hotkey failure cases**

| **Case** | **Recovery** |
|---|---|
| accelerator invalid | Disable binding, show warning |
| internal duplicate | Keep first, disable duplicate |
| OS registration fail | Mark conflict |
| unregister fail | Retry on shutdown |
| action unknown | Block dispatch |
| settings hotkey corrupt | Merge defaults |

### **17.2. Startup hotkey recovery**

```text
Load hotkey settings
  ↓
Merge defaults
  ↓
Validate each binding
  ↓
If invalid:
  - disable binding
  - record conflict
  ↓
Try register global
  ↓
If fail:
  - mark registration_failed
  - continue app startup
```

### **17.3. Hotkey recovery policy**

```text
Hotkey system must never block app startup.
If all hotkeys fail:
  - app continues
  - settings shows warning
  - user can reset hotkeys
```

---

## **18. Backup & Restore System**

### **18.1. Backup targets**

| **Target** | **When backup** |
|---|---|
| Settings | Before import/reset/migration |
| SQLite DB | Before migration/repair/full reset |
| Character profiles | Before bulk import/delete |
| Memories | Before memory repair/delete |
| Assets registry | Before rebuild |
| Hotkeys | Before reset defaults |

### **18.2. Backup layout**

```text
user_data/
├── backups/
│   ├── settings/
│   │   └── app_settings_20260527_020000.json
│   ├── database/
│   │   └── chiro_pet_20260527_020000.sqlite
│   ├── assets/
│   │   └── asset_registry_20260527_020000.json
│   └── recovery_manifest.json
```

### **18.3. RecoveryManifest**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryManifest {
    pub schema_version: u32,
    pub backups: Vec<backuprecord>,
    pub updated_at: DateTime<utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupRecord {
    pub backup_id: String,
    pub target: BackupTarget,
    pub path: String,
    pub created_at: DateTime<utc>,
    pub reason: String,
    pub size_bytes: u64,
}
```

### **18.4. BackupTarget**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupTarget {
    Settings,
    Database,
    Characters,
    Memories,
    Assets,
    FullUserData,
}
```

### **18.5. Restore flow**

```text
User selects backup
  ↓
Validate backup file exists
  ↓
Validate backup schema/hash if available
  ↓
Backup current data first
  ↓
Stop affected subsystem
  ↓
Restore backup
  ↓
Run health check
  ↓
Restart affected subsystem
  ↓
Report result
```

---

## **19. Diagnostic System**

### **19.1. Diagnostics goals**

Diagnostics giúp trả lời:

```text
- App đang lỗi subsystem nào?
- Có cần repair không?
- User data có an toàn không?
- AI provider có configured không?
- Active model có load được không?
- Overlay có nằm trong monitor không?
```

### **19.2. HealthStatus**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}
```

### **19.3. SubsystemHealth**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubsystemHealth {
    pub subsystem: ErrorSubsystem,
    pub status: HealthStatus,
    pub message: String,
    pub last_checked_at: DateTime<utc>,
    pub issues: Vec<healthissue>,
}
```

### **19.4. HealthIssue**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthIssue {
    pub code: String,
    pub severity: ErrorSeverity,
    pub message: String,
    pub suggested_action: Option<recoveryaction>,
}
```

### **19.5. AppDiagnosticsReport**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppDiagnosticsReport {
    pub generated_at: DateTime<utc>,
    pub app_recovery_mode: AppRecoveryMode,
    pub overall_status: HealthStatus,
    pub subsystems: Vec<subsystemhealth>,
    pub recent_errors: Vec<errorrecord>,
    pub safe_to_continue: bool,
}
```

### **19.6. Diagnostic checks**

| **Subsystem** | **Checks** |
|---|---|
| **Settings** | parse, validate, credential flag |
| **Database** | open, quick_check, migration version |
| **Asset** | active model exists, bundled assets exist |
| **Renderer** | webgl available, last runtime error |
| **AI** | config safe, circuit state, budget |
| **Overlay** | window exists, position visible |
| **Awareness** | sensor available, registry loaded |
| **Hotkey** | bindings valid, conflicts |
| **Privacy** | settings valid, restricted/private state |

---

## **20. User-facing Error Reporting**

### **20.1. Error presentation levels**

| **Level** | **UI** |
|---|---|
| Info | No UI or debug panel |
| Warning | Settings warning badge |
| Error | Toast or inline error |
| Critical | Recovery dialog |
| Fatal | Safe mode screen |

### **20.2. UserErrorMessage**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserErrorMessage {
    pub title: String,
    pub body: String,
    pub severity: ErrorSeverity,
    pub actions: Vec<userrecoveryaction>,
}
```

### **20.3. UserRecoveryAction**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum UserRecoveryAction {
    Retry,
    OpenSettings { section: String },
    UseFallback,
    RestoreBackup { backup_id: Option<string> },
    ResetSubsystem { subsystem: ErrorSubsystem },
    ExportDiagnostics,
    RestartApp,
    Ignore,
}
```

### **20.4. Example messages**

| **Error** | **Message** | **Actions** |
|---|---|---|
| AI auth fail | API key không hợp lệ hoặc hết quyền. | Open AI Settings |
| Asset missing | Model đang dùng không còn tồn tại. Đã dùng model mặc định tạm thời. | Open Assets, Use Default |
| DB corrupt | Database có dấu hiệu lỗi. App đã tạo backup. | Repair, Export, Reset |
| Overlay off-screen | Overlay nằm ngoài màn hình. Đã đưa về màn hình chính. | OK |
| Hotkey conflict | Một số phím tắt không đăng ký được. | Open Hotkeys |

---

## **21. Recovery Policy Engine**

### **21.1. RecoveryAction**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum RecoveryAction {
    None,
    Retry {
        max_attempts: u8,
        delay_ms: u64,
    },
    Fallback {
        fallback_type: FallbackType,
    },
    Repair {
        repair_type: RepairType,
    },
    DisableSubsystem {
        subsystem: ErrorSubsystem,
        until_restart: bool,
    },
    EnterSafeMode {
        reason: String,
    },
    AskUser {
        message: UserErrorMessage,
    },
}
```

### **21.2. FallbackType**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FallbackType {
    DefaultSettings,
    DefaultModel,
    DefaultAnimation,
    LocalAiTemplate,
    NormalAwarenessMode,
    DisableHotkeys,
    HideOverlay,
    MinimalRenderer,
}
```

### **21.3. RepairType**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RepairType {
    RepairSettings,
    RepairDatabase,
    RebuildAssetRegistry,
    ResetOverlayPosition,
    RevalidateAssets,
    RebuildThumbnails,
    ResetHotkeys,
    ClampStateValues,
}
```

### **21.4. Policy table**

| **Error** | **Action** |
|---|---|
| `settings.parse_failed` | Backup corrupt, load backup/default |
| `database.locked` | Retry with backoff |
| `database.corrupt` | Backup, repair, safe mode if fail |
| `asset.file_missing` | Fallback default asset |
| `renderer.webgl_context_lost` | Wait restore, reload resources |
| `ai.timeout` | Retry once, fallback |
| `ai.auth_failed` | Disable AI, ask user |
| `overlay.offscreen` | Reset overlay position |
| `hotkey.registration_failed` | Disable binding |
| `awareness.sensor_failed` | Skip tick, disable after repeated fail |

### **21.5. Policy engine pseudocode**

```rust
pub struct RecoveryPolicyEngine;

impl RecoveryPolicyEngine {
    pub fn decide(&self, error: &ErrorRecord) -> RecoveryAction {
        match (error.subsystem, error.category) {
            (ErrorSubsystem::Settings, ErrorCategory::ParseFailed) => {
                RecoveryAction::Repair {
                    repair_type: RepairType::RepairSettings,
                }
            }

            (ErrorSubsystem::Database, ErrorCategory::Corruption) => {
                RecoveryAction::Repair {
                    repair_type: RepairType::RepairDatabase,
                }
            }

            (ErrorSubsystem::Asset, ErrorCategory::FileMissing) => {
                RecoveryAction::Fallback {
                    fallback_type: FallbackType::DefaultModel,
                }
            }

            (ErrorSubsystem::Ai, ErrorCategory::Timeout) => {
                RecoveryAction::Retry {
                    max_attempts: 1,
                    delay_ms: 500,
                }
            }

            (ErrorSubsystem::Ai, ErrorCategory::Auth) => {
                RecoveryAction::AskUser {
                    message: ai_auth_failed_message(),
                }
            }

            (ErrorSubsystem::Overlay, ErrorCategory::PlatformApiFailed) => {
                RecoveryAction::Fallback {
                    fallback_type: FallbackType::HideOverlay,
                }
            }

            _ => {
                if error.severity >= ErrorSeverity::Critical {
                    RecoveryAction::EnterSafeMode {
                        reason: error.code.clone(),
                    }
                } else {
                    RecoveryAction::None
                }
            }
        }
    }
}
```

---

## **22. Backend: ErrorRecoveryManager**

### **22.1. Module trách nhiệm**

```rust
pub struct ErrorRecoveryManager {
    policy: Arc<recoverypolicyengine>,
    executor: Arc<recoveryexecutor>,
    diagnostics: Arc<diagnosticservice>,
    backup: Arc<backupmanager>,
    audit: Arc<recoveryauditlogger>,
    event_bus: Arc<recoveryeventbus>,

    state: Arc<rwlock<recoveryruntimestate>>,
}
```

### **22.2. RecoveryRuntimeState**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryRuntimeState {
    pub mode: AppRecoveryMode,
    pub disabled_subsystems: Vec<errorsubsystem>,
    pub circuit_breakers: HashMap<errorsubsystem, circuitbreakerstate="">,
    pub recent_errors: Vec<errorrecord>,
    pub last_diagnostics: Option<appdiagnosticsreport>,
}
```

### **22.3. Public methods**

```rust
impl ErrorRecoveryManager {
    pub async fn init(config: ErrorRecoveryConfig) -> Result<self>;

    pub async fn handle_error(&self, input: ErrorInput) -> RecoveryResult;

    pub async fn record_error(&self, error: ErrorRecord) -> Result<()>;

    pub async fn run_startup_recovery(&self) -> Result<startuprecoveryresult>;

    pub async fn run_diagnostics(&self) -> Result<appdiagnosticsreport>;

    pub async fn repair_subsystem(
        &self,
        subsystem: ErrorSubsystem,
    ) -> Result<repairresult>;

    pub async fn reset_subsystem(
        &self,
        subsystem: ErrorSubsystem,
        confirmation: ResetConfirmation,
    ) -> Result<resetresult>;

    pub async fn create_backup(
        &self,
        target: BackupTarget,
        reason: String,
    ) -> Result<backuprecord>;

    pub async fn restore_backup(
        &self,
        backup_id: String,
    ) -> Result<restoreresult>;

    pub async fn export_diagnostics_bundle(&self) -> Result<diagnosticbundle>;

    pub async fn enter_safe_mode(&self, reason: String) -> Result<()>;

    pub async fn exit_safe_mode_if_healthy(&self) -> Result<bool>;

    pub fn subscribe_events(&self) -> broadcast::Receiver<recoveryevent>;
}
```

### **22.4. ErrorInput**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorInput {
    pub subsystem: ErrorSubsystem,
    pub category: ErrorCategory,
    pub code: String,
    pub message: String,
    pub safe_details: Option<serde_json::value>,
    pub source_context: ErrorSourceContext,
}
```

### **22.5. RecoveryResult**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryResult {
    pub error_id: String,
    pub action: RecoveryAction,
    pub status: RecoveryStatus,
    pub user_visible_message: Option<usererrormessage>,
    pub created_at: DateTime<utc>,
}
```

### **22.6. RecoveryStatus**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryStatus {
    NotNeeded,
    Succeeded,
    PartiallySucceeded,
    Failed,
    PendingUserAction,
}
```

### **22.7. Main handle flow**

```rust
pub async fn handle_error(&self, input: ErrorInput) -> RecoveryResult {
    let error = self.classify_error(input);

    let _ = self.record_error(error.clone()).await;

    let action = self.policy.decide(&error);

    let status = self.executor
        .execute(action.clone(), &error)
        .await
        .unwrap_or(RecoveryStatus::Failed);

    let message = build_user_message_if_needed(&error, &action, status);

    let result = RecoveryResult {
        error_id: error.error_id.clone(),
        action,
        status,
        user_visible_message: message,
        created_at: Utc::now(),
    };

    self.event_bus.emit(RecoveryEvent::RecoveryCompleted {
        result: result.clone(),
    });

    result
}
```

---

## **23. IPC Contract**

### **23.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `recovery_get_status` | `{}` | `RecoveryRuntimeState` |
| `recovery_get_recent_errors` | `{ limit: number }` | `ErrorRecord[]` |
| `recovery_run_diagnostics` | `{}` | `AppDiagnosticsReport` |
| `recovery_repair_subsystem` | `{ subsystem: ErrorSubsystem }` | `RepairResult` |
| `recovery_reset_subsystem` | `{ subsystem: ErrorSubsystem, confirmation: ResetConfirmation }` | `ResetResult` |
| `recovery_create_backup` | `{ target: BackupTarget, reason: string }` | `BackupRecord` |
| `recovery_list_backups` | `{}` | `BackupRecord[]` |
| `recovery_restore_backup` | `{ backup_id: string }` | `RestoreResult` |
| `recovery_export_diagnostics` | `{}` | `DiagnosticBundle` |
| `recovery_enter_safe_mode` | `{ reason: string }` | `void` |
| `recovery_exit_safe_mode` | `{}` | `{ exited: boolean }` |
| `recovery_report_frontend_error` | `FrontendErrorReport` | `void` |

### **23.2. Rust → Frontend events**

| **Event** | **Payload** |
|---|---|
| `recovery_error_recorded` | `ErrorRecord` |
| `recovery_started` | `{ error_id: string, action: RecoveryAction }` |
| `recovery_completed` | `RecoveryResult` |
| `recovery_mode_changed` | `{ from: AppRecoveryMode, to: AppRecoveryMode, reason: string }` |
| `recovery_diagnostics_updated` | `AppDiagnosticsReport` |
| `recovery_backup_created` | `BackupRecord` |
| `recovery_user_action_required` | `UserErrorMessage` |

### **23.3. TypeScript types**

```typescript
export type ErrorSubsystem =
  | "app"
  | "ipc"
  | "settings"
  | "database"
  | "character"
  | "state"
  | "memory"
  | "ai"
  | "asset"
  | "animation"
  | "renderer"
  | "overlay"
  | "awareness"
  | "privacy"
  | "behavior"
  | "hotkey"
  | "file_system"
  | "network"
  | "unknown";

export type AppRecoveryMode =
  | "normal"
  | "degraded"
  | "safe_mode"
  | "repair_mode"
  | "fatal_blocked";

export type HealthStatus =
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "unknown";

export interface AppDiagnosticsReport {
  generated_at: string;
  app_recovery_mode: AppRecoveryMode;
  overall_status: HealthStatus;
  subsystems: SubsystemHealth[];
  recent_errors: ErrorRecord[];
  safe_to_continue: boolean;
}
```

---

## **24. Frontend Recovery UI**

### **24.1. Recovery UI surfaces**

```text
Settings
└─ Diagnostics & Recovery
   ├─ Overall health
   ├─ Subsystem health list
   ├─ Recent errors
   ├─ Repair actions
   ├─ Backups
   ├─ Export diagnostics
   └─ Safe reset
```

### **24.2. Safe mode screen**

```text
Chiro-Pet started in Safe Mode

Reason:
Database integrity check failed.

Available actions:
[Run Diagnostics]
[Try Repair]
[Restore Backup]
[Export Data]
[Reset Database]
[Restart App]
```

### **24.3. Recovery toast**

```text
⚠ AI provider unavailable.
Using local fallback responses for now.

[Open AI Settings] [Retry]
```

### **24.4. Recovery store**

```typescript
interface RecoveryStore {
  status: RecoveryRuntimeState | null;
  diagnostics: AppDiagnosticsReport | null;
  recentErrors: ErrorRecord[];

  refreshStatus: () => Promise<void>;
  runDiagnostics: () => Promise<void>;
  repairSubsystem: (subsystem: ErrorSubsystem) => Promise<repairresult>;
  exportDiagnostics: () => Promise<diagnosticbundle>;
}

export const useRecoveryStore = create<recoverystore>((set, get) => ({
  status: null,
  diagnostics: null,
  recentErrors: [],

  refreshStatus: async () => {
    const status = await ipcInvoke<record<string, never="">, RecoveryRuntimeState>(
      "recovery_get_status",
      {},
    );
    set({ status });
  },

  runDiagnostics: async () => {
    const diagnostics = await ipcInvoke<record<string, never="">, AppDiagnosticsReport>(
      "recovery_run_diagnostics",
      {},
    );
    set({ diagnostics });
  },

  repairSubsystem: async (subsystem) => {
    return await ipcInvoke<{ subsystem: ErrorSubsystem }, RepairResult>(
      "recovery_repair_subsystem",
      { subsystem },
    );
  },

  exportDiagnostics: async () => {
    return await ipcInvoke<record<string, never="">, DiagnosticBundle>(
      "recovery_export_diagnostics",
      {},
    );
  },
}));
```

---

## **25. Logging & Audit**

### **25.1. Recovery audit schema**

```sql
CREATE TABLE recovery_audit_log (
    id TEXT PRIMARY KEY,
    error_id TEXT,
    subsystem TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    code TEXT NOT NULL,

    recovery_action_json TEXT,
    recovery_status TEXT,
    user_visible INTEGER NOT NULL,

    safe_details_json TEXT,
    created_at DATETIME NOT NULL
);

CREATE INDEX idx_recovery_audit_created ON recovery_audit_log(created_at);
CREATE INDEX idx_recovery_audit_subsystem ON recovery_audit_log(subsystem);
CREATE INDEX idx_recovery_audit_error ON recovery_audit_log(error_id);
```

### **25.2. Forbidden diagnostic content**

Không bao giờ include:

```text
- API key
- bearer token
- password
- private key
- raw AI prompt
- raw window title
- process path
- file path ngoài asset root
- clipboard
- screenshot
```

### **25.3. Diagnostic bundle**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiagnosticBundle {
    pub bundle_version: u32,
    pub generated_at: DateTime<utc>,
    pub app_info: AppInfo,
    pub diagnostics: AppDiagnosticsReport,
    pub recent_recovery_logs: Vec<serde_json::value>,
    pub settings_summary: serde_json::Value,
    pub asset_summary: serde_json::Value,
}
```

### **25.4. Redaction**

```rust
pub fn redact_diagnostic_text(input: &str) -> String {
    let mut s = input.to_string();

    s = redact_api_keys(&s);
    s = redact_tokens(&s);
    s = redact_passwords(&s);
    s = redact_file_paths(&s);

    s
}
```

---

## **26. Performance Considerations**

### **26.1. Runtime overhead**

```text
- Error handling only runs on error path.
- Heartbeat every 30s.
- Diagnostics only on startup or user request.
- Circuit breaker check is O(1).
```

### **26.2. Targets**

| **Operation** | **Target** |
|---|---|
| Classify error | < 100μs |
| Record recovery log | < 5ms |
| Run quick diagnostics | < 100ms |
| Database quick_check | < 1s for normal DB |
| Asset registry health check | < 2s for 100 assets |
| Create settings backup | < 50ms |
| Export diagnostic bundle | < 2s |

### **26.3. Avoid**

```text
- Full DB integrity_check on every startup if DB large.
- Hash all assets on every startup.
- Blocking UI thread during repair.
- Running repair automatically without backup.
```

---

## **27. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── recovery/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── classifier.rs
│               ├── policy.rs
│               ├── executor.rs
│               ├── crash.rs
│               ├── heartbeat.rs
│               ├── diagnostics.rs
│               ├── backup.rs
│               ├── restore.rs
│               ├── repair/
│               │   ├── mod.rs
│               │   ├── settings_repair.rs
│               │   ├── database_repair.rs
│               │   ├── asset_repair.rs
│               │   ├── state_repair.rs
│               │   └── hotkey_repair.rs
│               ├── circuit_breaker.rs
│               ├── audit.rs
│               ├── events.rs
│               └── errors.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── recovery_commands.rs
│
├── src/
│   ├── recovery/
│   │   ├── components/
│   │   │   ├── RecoveryScreen.tsx
│   │   │   ├── DiagnosticsPanel.tsx
│   │   │   ├── SubsystemHealthList.tsx
│   │   │   ├── RecentErrorsTable.tsx
│   │   │   ├── BackupRestorePanel.tsx
│   │   │   └── RecoveryActionDialog.tsx
│   │   └── stores/
│   │       └── recoveryStore.ts
│   │
│   ├── settings/
│   │   └── pages/
│   │       └── Diagnostics.tsx
│   │
│   └── shared/
│       └── types/
│           └── recovery.ts
│
└── docs/
    └── error-recovery-system.md
```

---

## **28. Implementation Checklist**

### **28.1. P0 Core**

- [ ] Define `ErrorRecord`.
- [ ] Define `ErrorSubsystem`.
- [ ] Define `ErrorCategory`.
- [ ] Define `ErrorSeverity`.
- [ ] Define `RecoveryAction`.
- [ ] Define `RecoveryResult`.
- [ ] Implement `ErrorRecoveryManager`.
- [ ] Implement `RecoveryPolicyEngine`.
- [ ] Implement `RecoveryExecutor`.
- [ ] Implement recovery event bus.
- [ ] Implement recovery audit logger.

### **28.2. P0 Startup Recovery**

- [ ] Crash marker file.
- [ ] Heartbeat.
- [ ] Detect unclean shutdown.
- [ ] Run startup diagnostics.
- [ ] Enter degraded/safe mode when needed.

### **28.3. P0 Settings & DB Recovery**

- [ ] Backup corrupt settings.
- [ ] Load backup settings.
- [ ] Use default settings fallback.
- [ ] SQLite open retry.
- [ ] SQLite quick_check.
- [ ] Backup DB before migration/repair.
- [ ] Safe mode on DB fatal fail.

### **28.4. P0 Asset & Renderer Recovery**

- [ ] Active model missing fallback.
- [ ] Default bundled model fallback.
- [ ] Default animation fallback.
- [ ] Renderer reports runtime load errors.
- [ ] WebGL context lost handler.
- [ ] Minimal renderer fallback.

### **28.5. P0 AI Recovery**

- [ ] Retry timeout once.
- [ ] Circuit breaker.
- [ ] Auth failure user action.
- [ ] Provider unavailable fallback.
- [ ] Invalid JSON fallback.
- [ ] Budget fallback.

### **28.6. P1 Overlay, Awareness, Hotkey Recovery**

- [ ] Overlay off-screen recovery.
- [ ] Click-through emergency reset.
- [ ] Awareness repeated failure disable.
- [ ] Hotkey invalid binding disable.
- [ ] Hotkey conflict repair/reset.

### **28.7. P1 Diagnostics UI**

- [ ] Diagnostics settings page.
- [ ] Subsystem health list.
- [ ] Recent error list.
- [ ] Repair buttons.
- [ ] Export diagnostic bundle.
- [ ] Backup restore panel.

### **28.8. P2 Polish**

- [ ] SQLite recover integration.
- [ ] Full user data backup.
- [ ] Automated repair wizard.
- [ ] Recovery simulation tests.
- [ ] Recovery timeline viewer.
- [ ] User-friendly root cause explanation.

---

## **29. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Error Recovery** | Cơ chế phát hiện và phục hồi lỗi. |
| **Fail safe** | Khi lỗi, chọn hành vi an toàn thay vì tiếp tục rủi ro. |
| **Degraded Mode** | App chạy giảm tính năng khi một subsystem lỗi. |
| **Safe Mode** | Mode chỉ bật UI repair/settings/diagnostics. |
| **Circuit Breaker** | Tạm dừng subsystem sau nhiều lỗi liên tiếp. |
| **Diagnostic Report** | Báo cáo sức khỏe app và subsystem. |
| **Recovery Policy** | Quy tắc quyết định retry, fallback, repair hoặc disable. |
| **Fallback** | Phương án thay thế khi tính năng chính lỗi. |
| **Repair** | Hành động sửa dữ liệu/cấu hình/lỗi runtime. |
| **Backup** | Bản sao dữ liệu trước khi repair/reset. |
| **Crash Marker** | File đánh dấu app shutdown sạch hay crash. |

---

# **Phụ lục A: Flow app startup recovery**

```text
App start
  ↓
Install panic hook
  ↓
Read crash marker
  ↓
If previous clean_shutdown=false:
  previous crash suspected
  ↓
Initialize RecoveryManager
  ↓
Run startup diagnostics:
  - settings parse/validate
  - DB open + quick_check
  - active character exists
  - active state valid
  - active model asset exists
  - bundled assets exist
  - overlay position valid
  ↓
If all healthy:
  mode = Normal
  ↓
If non-critical issue:
  mode = Degraded
  apply fallback
  ↓
If critical issue:
  mode = SafeMode
  show RecoveryScreen
  ↓
Start heartbeat
  ↓
Continue app boot
```

---

# **Phụ lục B: Flow asset load failure**

```text
Renderer tries to load active model asset_id
  ↓
Asset resolve succeeds?
  ├─ No:
  │   report error asset.file_missing
  │
  └─ Yes:
      load VRM
      ↓
      load succeeds?
        ├─ Yes:
        │   use model
        │
        └─ No:
            report renderer.runtime_load_failed
  ↓
RecoveryPolicy:
  fallback default model
  ↓
Renderer loads bundled default model
  ↓
If default succeeds:
  app continues degraded
  show warning in asset settings
  ↓
If default fails:
  enter SafeMode or hide overlay
```

---

# **Phụ lục C: Flow AI provider failure**

```text
AIOrchestrator sends request
  ↓
Provider timeout
  ↓
Retry once after 500ms
  ↓
Retry fails
  ↓
RecoveryManager records ai.timeout
  ↓
CircuitBreaker failure_count += 1
  ↓
If failure_count < 3:
  use local fallback template
  ↓
If failure_count >= 3:
  open circuit 5 minutes
  ↓
User sees:
  "AI provider đang lỗi, em dùng phản hồi local tạm thời."
```

---

# **Phụ lục D: JSON mẫu**

## **D.1. ErrorRecord mẫu**

```json
{
  "error_id": "err_018fb7f6_2df8",
  "subsystem": "asset",
  "category": "file_missing",
  "severity": "error",
  "recoverability": "auto_recoverable",
  "code": "asset.file_missing",
  "message": "Asset file is missing",
  "safe_details": {
    "asset_id": "model_018fb7f6_2df8_7f36_b1a2"
  },
  "source_context": {
    "request_id": null,
    "character_id": "mira_default",
    "asset_id": "model_018fb7f6_2df8_7f36_b1a2",
    "command_name": null,
    "operation": "load_active_model"
  },
  "occurred_at": "2026-05-27T02:00:00Z",
  "recovery_attempted": true,
  "recovery_status": "succeeded",
  "user_visible": true
}
```

## **D.2. RecoveryResult mẫu**

```json
{
  "error_id": "err_018fb7f6_2df8",
  "action": {
    "type": "fallback",
    "fallback_type": "default_model"
  },
  "status": "succeeded",
  "user_visible_message": {
    "title": "Model đang dùng bị lỗi",
    "body": "Chiro-Pet đã tạm dùng model mặc định để app tiếp tục chạy.",
    "severity": "warning",
    "actions": [
      {
        "type": "open_settings",
        "section": "assets"
      }
    ]
  },
  "created_at": "2026-05-27T02:00:01Z"
}
```

## **D.3. AppDiagnosticsReport mẫu**

```json
{
  "generated_at": "2026-05-27T02:00:00Z",
  "app_recovery_mode": "degraded",
  "overall_status": "degraded",
  "subsystems": [
    {
      "subsystem": "settings",
      "status": "healthy",
      "message": "Settings loaded successfully",
      "last_checked_at": "2026-05-27T02:00:00Z",
      "issues": []
    },
    {
      "subsystem": "asset",
      "status": "degraded",
      "message": "Active model missing, using default fallback",
      "last_checked_at": "2026-05-27T02:00:00Z",
      "issues": [
        {
          "code": "asset.active_model_missing",
          "severity": "warning",
          "message": "Active character model file is missing",
          "suggested_action": {
            "type": "repair",
            "repair_type": "revalidate_assets"
          }
        }
      ]
    }
  ],
  "recent_errors": [],
  "safe_to_continue": true
}
```

## **D.4. BackupRecord mẫu**

```json
{
  "backup_id": "backup_db_20260527_020000",
  "target": "database",
  "path": "user_data/backups/database/chiro_pet_20260527_020000.sqlite",
  "created_at": "2026-05-27T02:00:00Z",
  "reason": "before_database_repair",
  "size_bytes": 5242880
}
```

## **D.5. RecoveryRuntimeState mẫu**

```json
{
  "mode": "degraded",
  "disabled_subsystems": ["ai"],
  "circuit_breakers": {
    "ai": {
      "subsystem": "ai",
      "failure_count": 3,
      "opened_until": "2026-05-27T02:05:00Z",
      "last_failure_at": "2026-05-27T02:00:00Z"
    }
  },
  "recent_errors": [],
  "last_diagnostics": null
}
```

---