# **Chiro-Pet Privacy System**

&gt; Tài liệu thiết kế chính thức cho **Privacy System** của **Chiro-Pet**.  
&gt; Hệ thống này là lớp **bảo vệ dữ liệu và quyền riêng tư** cho toàn bộ app: desktop context, AI request, memory, logs, API key, settings, export/delete data.
&gt;
&gt; **Nguyên tắc lõi:** Privacy System phải mặc định **an toàn, tối thiểu hóa dữ liệu, dễ kiểm soát và có thể xóa sạch**. Không subsystem nào được gửi dữ liệu nhạy cảm ra ngoài hoặc lưu memory nhạy cảm nếu chưa đi qua **PrivacyPolicy**, **Sanitizer**, **ConsentManager** và **SensitiveDataGuard**.

---

## **Mục lục**

1. [Mục tiêu &amp; Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Privacy Layers](#3-privacy-layers)
4. [Threat Model](#4-threat-model)
5. [Permission Model](#5-permission-model)
6. [First-Run Consent Flow](#6-first-run-consent-flow)
7. [Privacy Modes](#7-privacy-modes)
8. [Context Sanitizer](#8-context-sanitizer)
9. [AI Privacy Guard](#9-ai-privacy-guard)
10. [Memory Privacy Guard](#10-memory-privacy-guard)
11. [Sensitive Data Detection](#11-sensitive-data-detection)
12. [Encrypted Storage](#12-encrypted-storage)
13. [API Key Handling](#13-api-key-handling)
14. [Logging &amp; Audit Privacy](#14-logging--audit-privacy)
15. [Data Export](#15-data-export)
16. [Data Delete](#16-data-delete)
17. [Private Mode Integration](#17-private-mode-integration)
18. [Quiet Mode Integration](#18-quiet-mode-integration)
19. [Streamer Mode](#19-streamer-mode)
20. [Backend: PrivacyManager](#20-backend-privacymanager)
21. [IPC Contract](#21-ipc-contract)
22. [Frontend Privacy UI](#22-frontend-privacy-ui)
23. [Subsystem Integration Matrix](#23-subsystem-integration-matrix)
24. [Error Handling](#24-error-handling)
25. [File Structure](#25-file-structure)
26. [Implementation Checklist](#26-implementation-checklist)
27. [Glossary](#27-glossary)
28. [Phụ lục A: Flow AI request với privacy guard](#phụ-lục-a-flow-ai-request-với-privacy-guard)
29. [Phụ lục B: Flow memory proposal với sensitive data](#phụ-lục-b-flow-memory-proposal-với-sensitive-data)
30. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)

---

## **1. Mục tiêu &amp; Phạm vi**

### **1.1. Mục tiêu**

Privacy System của **Chiro-Pet** phải:

- Quản lý **permissions** cho desktop awareness, AI, memory, notification, logs.
- Cung cấp **first-run consent flow** rõ ràng.
- Hỗ trợ các mode:
  - **Normal Mode**
  - **Private Mode**
  - **Quiet Mode**
  - **Streamer Mode**
  - **Restricted Mode**
- Đảm bảo desktop context gửi AI luôn là **sanitized context**.
- Không gửi dữ liệu nhạy cảm như:
  - window title raw
  - file path
  - process path
  - clipboard
  - screenshot
  - password
  - token
  - API key
  - private note
- Kiểm soát memory write:
  - auto-save memory thường
  - require approval cho memory nhạy cảm
  - reject secret/password/token
- Mã hóa dữ liệu nhạy cảm local:
  - API key
  - provider credentials
  - optional sensitive memory
- Cho phép user:
  - export data
  - delete data
  - clear logs
  - reset privacy permissions
- Ghi audit events về privacy mà không ghi raw sensitive data.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Permission model.
- Consent flow.
- Private/Quiet/Streamer/Restricted modes.
- Context sanitizer rules.
- AI privacy guard.
- Memory privacy guard.
- Sensitive data detection.
- Encrypted storage.
- Export/delete data.
- IPC và frontend UI privacy.

Tài liệu này **không** mô tả chi tiết:

- Cách foreground window được detect.
- Cách AI prompt được build.
- Cách memory ranking hoạt động.
- Cách overlay window render.

Các phần đó thuộc subsystem riêng, Privacy System chỉ định nghĩa **policy và guard**.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Privacy by default** | Nếu chưa có consent, không gửi context desktop ra AI. |
| **2** | **Data minimization** | Chỉ thu thập và gửi dữ liệu tối thiểu cần thiết. |
| **3** | **No raw desktop export** | Window title, PID, path, command line không rời Desktop Awareness. |
| **4** | **Local-first** | Dữ liệu user lưu local, không sync cloud. |
| **5** | **Explicit consent** | AI, memory write, notifications, context awareness phải có consent riêng. |
| **6** | **Mode overrides all** | Private/Restricted mode được ưu tiên hơn mọi subsystem. |
| **7** | **Secrets never saved** | Password, API key, token không được lưu memory/log/prompt. |
| **8** | **Auditable but redacted** | Có audit privacy event, nhưng không ghi dữ liệu thô. |
| **9** | **User can delete** | User có thể xóa logs, memory, state, AI history. |
| **10** | **Fail closed** | Nếu privacy guard lỗi, chặn request thay vì cho qua. |

### **2.2. Anti-pattern cần tránh**

- ❌ Gửi raw window title vào AI.
- ❌ Lưu API key dạng plain text.
- ❌ Lưu password/token trong memory.
- ❌ Log toàn bộ prompt khi debug mà không redact.
- ❌ Cho AI tự quyết định memory nhạy cảm có được lưu không.
- ❌ Private Mode chỉ ẩn UI nhưng vẫn gửi context.
- ❌ Cho overlay hiện bubble trong Meeting/Streamer Mode.
- ❌ Export thiếu metadata version.
- ❌ Delete chỉ xóa UI nhưng database vẫn còn dữ liệu.
- ❌ Không có way để reset permissions.

---

## **3. Privacy Layers**

Privacy System chia thành **4 lớp**.

### **3.1. Layer 1: Collection Control**

Kiểm soát app được phép **thu thập gì**.

```text
- desktop awareness enabled?
- idle detection enabled?
- fullscreen detection enabled?
- app category detection enabled?
- memory write enabled?
- AI enabled?
- logging enabled?
```

### **3.2. Layer 2: Sanitization**

Làm sạch dữ liệu trước khi dùng hoặc gửi đi.

```text
Raw desktop data
  ↓
Sanitizer
  ↓
Classified + sanitized context
```

Loại bỏ:

```text
- window title
- PID
- process path
- file path
- clipboard
- command line
- screenshot
```

### **3.3. Layer 3: Policy Guard**

Kiểm tra mode và permission trước mỗi action.

```text
AI request?
  ↓
AIPrivacyGuard
  ↓
Allow / Block / StripContext / FallbackLocal
```

### **3.4. Layer 4: Storage Protection**

Bảo vệ dữ liệu đã lưu.

```text
- API key encrypted
- sensitive memory optional encrypted
- logs redacted
- export user-controlled
- delete hard/soft policy
```

---

## **4. Threat Model**

### **4.1. Rủi ro cần phòng**

| **Rủi ro** | **Ví dụ** | **Mitigation** |
|---|---|---|
| **Prompt leakage** | Window title chứa tên file bí mật | Không gửi raw title |
| **Secret persistence** | User paste API key vào chat | Detect và reject memory/log |
| **Shoulder surfing** | Bubble hiện nội dung riêng tư khi share screen | Streamer/Private Mode |
| **Unwanted AI context** | AI biết user đang mở app nào | Permission + sanitizer |
| **Local credential exposure** | API key trong settings file | Encrypt bằng OS keychain |
| **Debug log leak** | Prompt log chứa thông tin nhạy cảm | Redaction + opt-in debug |
| **Stale data retention** | Logs tồn tại mãi | Retention + clear all |
| **Mode bypass** | Subsystem vẫn notify trong Meeting | Central PrivacyPolicy |

### **4.2. Không nằm trong phạm vi**

```text
- Malware đã có quyền đọc user data folder.
- OS-level keylogger.
- AI provider policy bên ngoài app.
- Network MITM nếu HTTPS bị compromise.
- User tự copy dữ liệu nhạy cảm vào prompt và gửi đi.
```

Tuy vậy, app vẫn cố gắng **cảnh báo và giảm thiểu rủi ro**.

---

## **5. Permission Model**

### **5.1. Permission enum**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum PrivacyPermission {
    AiChat,
    AiUseSanitizedDesktopContext,
    DesktopAwareness,
    IdleDetection,
    FullscreenDetection,
    AppCategoryDetection,
    MemoryRead,
    MemoryWrite,
    SensitiveMemoryWrite,
    Notifications,
    DebugLogging,
    PromptLogging,
    UsageAuditLogging,
}
```

### **5.2. Permission state**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PermissionState {
    Granted,
    Denied,
    AskEveryTime,
}
```

### **5.3. PrivacySettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacySettings {
    pub schema_version: u32,

    pub permissions: HashMap<privacypermission, permissionstate="">,

    pub private_mode: bool,
    pub quiet_mode: bool,
    pub streamer_mode: bool,
    pub restricted_mode: bool,

    pub allow_ai_in_private_mode: bool,
    pub allow_memory_read_in_private_mode: bool,
    pub allow_memory_write_in_private_mode: bool,

    pub redact_debug_logs: bool,
    pub encrypt_sensitive_memory: bool,

    pub audit_log_retention_days: u32,
    pub ai_history_retention_days: u32,

    pub updated_at: DateTime<utc>,
}
```

### **5.4. Default settings**

```rust
impl Default for PrivacySettings {
    fn default() -&gt; Self {
        let mut permissions = HashMap::new();

        permissions.insert(PrivacyPermission::AiChat, PermissionState::Granted);
        permissions.insert(PrivacyPermission::AiUseSanitizedDesktopContext, PermissionState::AskEveryTime);
        permissions.insert(PrivacyPermission::DesktopAwareness, PermissionState::Granted);
        permissions.insert(PrivacyPermission::IdleDetection, PermissionState::Granted);
        permissions.insert(PrivacyPermission::FullscreenDetection, PermissionState::Granted);
        permissions.insert(PrivacyPermission::AppCategoryDetection, PermissionState::Granted);
        permissions.insert(PrivacyPermission::MemoryRead, PermissionState::Granted);
        permissions.insert(PrivacyPermission::MemoryWrite, PermissionState::AskEveryTime);
        permissions.insert(PrivacyPermission::SensitiveMemoryWrite, PermissionState::AskEveryTime);
        permissions.insert(PrivacyPermission::Notifications, PermissionState::Denied);
        permissions.insert(PrivacyPermission::DebugLogging, PermissionState::Denied);
        permissions.insert(PrivacyPermission::PromptLogging, PermissionState::Denied);
        permissions.insert(PrivacyPermission::UsageAuditLogging, PermissionState::Granted);

        Self {
            schema_version: 1,
            permissions,
            private_mode: false,
            quiet_mode: false,
            streamer_mode: false,
            restricted_mode: false,
            allow_ai_in_private_mode: false,
            allow_memory_read_in_private_mode: false,
            allow_memory_write_in_private_mode: false,
            redact_debug_logs: true,
            encrypt_sensitive_memory: true,
            audit_log_retention_days: 30,
            ai_history_retention_days: 30,
            updated_at: Utc::now(),
        }
    }
}
```

### **5.5. Permission matrix**

| **Feature** | **Permission cần** |
|---|---|
| Chat với AI | `AiChat` |
| Gửi desktop context cho AI | `AiUseSanitizedDesktopContext` |
| Detect foreground app category | `DesktopAwareness` + `AppCategoryDetection` |
| Detect idle | `DesktopAwareness` + `IdleDetection` |
| Detect fullscreen | `DesktopAwareness` + `FullscreenDetection` |
| Đọc memory vào prompt | `MemoryRead` |
| Ghi memory thường | `MemoryWrite` |
| Ghi memory nhạy cảm | `SensitiveMemoryWrite` |
| Hiện OS notification | `Notifications` |
| Ghi debug log | `DebugLogging` |
| Ghi prompt log | `PromptLogging` |

---

## **6. First-Run Consent Flow**

### **6.1. Mục tiêu**

Lần chạy đầu tiên phải giải thích rõ:

```text
- App chạy local.
- AI provider bên ngoài có thể nhận message nếu bật AI.
- Desktop awareness chỉ gửi category đã sanitize, không gửi window title/file path.
- Memory là local, có thể xóa.
- API key được mã hóa.
```

### **6.2. Consent steps**

```text
Step 1: Welcome
  ↓
Step 2: AI usage consent
  ↓
Step 3: Desktop awareness consent
  ↓
Step 4: Memory consent
  ↓
Step 5: Notification consent
  ↓
Step 6: Privacy mode shortcuts
  ↓
Finish → save PrivacySettings
```

### **6.3. ConsentResult**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentResult {
    pub ai_chat: PermissionState,
    pub ai_use_desktop_context: PermissionState,
    pub desktop_awareness: PermissionState,
    pub memory_write: PermissionState,
    pub notifications: PermissionState,
    pub completed_at: DateTime<utc>,
}
```

### **6.4. Consent rule**

```text
Nếu user skip consent:
  - AiChat = Granted nếu API key configured
  - AiUseSanitizedDesktopContext = Denied
  - MemoryWrite = AskEveryTime
  - Notifications = Denied
```

Quan điểm thẳng: **không nên mặc định gửi desktop context cho AI**. Dù đã sanitize, đây vẫn là dữ liệu hành vi.

---

## **7. Privacy Modes**

### **7.1. Mode overview**

| **Mode** | **Mục đích** | **AI** | **Memory** | **Desktop context** | **Bubble/Notification** |
|---|---|---|---|---|---|
| **Normal** | Dùng bình thường | Cho phép | Theo permission | Sanitized | Cho phép |
| **Private** | Không để lại dấu vết ngữ cảnh | Block mặc định | Block mặc định | Không gửi | Không proactive |
| **Quiet** | Không làm phiền | Cho phép direct chat | Cho phép | Sanitized | Không proactive |
| **Streamer** | Share screen an toàn | Cho phép direct chat | Hạn chế | Không gửi hoặc minimal | Ẩn nội dung nhạy cảm |
| **Restricted** | Bảo mật tối đa | Block | Block | Không gửi | Không |

### **7.2. Private Mode**

Private Mode là mode mạnh nhất cho sinh hoạt cá nhân.

```text
Private Mode ON:
- Không gửi desktop context cho AI.
- Không proactive AI.
- Không ghi memory.
- Không patch relationship state.
- Không hiện notification.
- Bubble chỉ hiện nếu user direct chat và setting cho phép.
- Audit chỉ ghi event toggle, không ghi content.
```

Default:

```text
allow_ai_in_private_mode = false
allow_memory_read_in_private_mode = false
allow_memory_write_in_private_mode = false
```

### **7.3. Quiet Mode**

Quiet Mode không phải privacy tuyệt đối, chỉ giảm làm phiền.

```text
Quiet Mode ON:
- Direct chat vẫn hoạt động.
- AI vẫn có thể dùng sanitized context nếu permission cho phép.
- Không proactive check-in.
- Không OS notification.
- Bubble chỉ hiện khi user chủ động.
```

### **7.4. Streamer Mode**

Streamer Mode dùng khi share màn hình hoặc record video.

```text
Streamer Mode ON:
- Không hiển thị sensitive bubble.
- Không hiện pending memory toast có nội dung riêng tư.
- Không hiện API key/settings sensitive.
- Có thể thay bubble content bằng placeholder:
  "Em có phản hồi riêng tư. Mở chat để xem nhé."
- Không gửi desktop context cho AI mặc định.
```

### **7.5. Restricted Mode**

Restricted Mode là kill-switch.

```text
Restricted Mode ON:
- Block AI request.
- Block memory read/write.
- Block desktop context export.
- Block notifications.
- Overlay vẫn hiện nhưng chỉ dùng local animation/template.
```

---

## **8. Context Sanitizer**

### **8.1. Input raw fields**

Privacy System không nhận raw fields trực tiếp từ OS, nhưng định nghĩa rule cho Desktop Awareness.

```text
Raw fields:
- process_name
- window_title
- pid
- process_path
- command_line
- file_path
- clipboard
- screenshot
- idle_seconds
- fullscreen
```

### **8.2. Sanitized output**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SanitizedDesktopContext {
    pub app_category: AppCategory,
    pub session_duration_minutes: u32,
    pub is_fullscreen: bool,
    pub mode: AppMode,
    pub time_of_day: TimeOfDay,
    pub privacy_level: PrivacyLevel,
    pub sanitized_at: DateTime<utc>,
}
```

### **8.3. Sanitizer rules**

| **Raw / Internal Field** | **Gửi AI?** | **Output** |
|---|---|---|
| Process name | Không | `app_category` |
| Window title | Không bao giờ | Dropped |
| PID | Không bao giờ | Dropped |
| Process path | Không bao giờ | Dropped |
| Command line | Không bao giờ | Dropped |
| File path | Không bao giờ | Dropped |
| Clipboard | Không hỗ trợ | Dropped |
| Screenshot | Không hỗ trợ | Dropped |
| Exact idle seconds | Không | Dùng `mode=idle` |
| Session duration exact | Không | Rounded 5 phút |
| Fullscreen | Có | Boolean |
| Time | Có | Bucket `morning/night` |

### **8.4. Privacy-aware sanitizer**

```rust
pub struct PrivacyAwareSanitizer;

impl PrivacyAwareSanitizer {
    pub fn sanitize_for_ai(
        &amp;self,
        context: Option<sanitizeddesktopcontext>,
        settings: &amp;PrivacySettings,
    ) -&gt; Option<sanitizeddesktopcontext> {
        if settings.restricted_mode {
            return None;
        }

        if settings.private_mode {
            return None;
        }

        if settings.streamer_mode {
            return None;
        }

        if !has_permission(
            settings,
            PrivacyPermission::AiUseSanitizedDesktopContext,
        ) {
            return None;
        }

        let mut ctx = context?;

        if !has_permission(settings, PrivacyPermission::AppCategoryDetection) {
            ctx.app_category = AppCategory::Unknown;
        }

        Some(ctx)
    }
}
```

---

## **9. AI Privacy Guard**

### **9.1. Trách nhiệm**

AI Privacy Guard quyết định request AI có được gửi không và context nào được đưa vào prompt.

```text
AIInteractionRequest
  ↓
AIPrivacyGuard
  ↓
Decision:
  - AllowFull
  - AllowWithoutDesktopContext
  - AllowWithoutMemory
  - BlockUseFallback
  - BlockSilent
```

### **9.2. Decision enum**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AIPrivacyDecision {
    AllowFull,
    AllowWithoutDesktopContext,
    AllowWithoutMemory,
    AllowMinimal,
    BlockUseFallback { reason: String },
    BlockSilent { reason: String },
}
```

### **9.3. Guard rules**

| **Condition** | **Decision** |
|---|---|
| `restricted_mode = true` | `BlockUseFallback` |
| `private_mode = true` + `allow_ai_in_private_mode = false` | `BlockUseFallback` |
| `private_mode = true` + AI allowed | `AllowMinimal` |
| `quiet_mode = true` + proactive request | `BlockSilent` |
| `streamer_mode = true` + proactive request | `BlockSilent` |
| `AiChat = Denied` | `BlockUseFallback` |
| `MemoryRead = Denied` | Strip memory |
| `AiUseSanitizedDesktopContext = Denied` | Strip desktop context |

### **9.4. Pseudocode**

```rust
pub struct AIPrivacyGuard;

impl AIPrivacyGuard {
    pub fn evaluate(
        &amp;self,
        req: &amp;AIInteractionRequest,
        settings: &amp;PrivacySettings,
    ) -&gt; AIPrivacyDecision {
        if settings.restricted_mode {
            return AIPrivacyDecision::BlockUseFallback {
                reason: "restricted_mode".into(),
            };
        }

        if settings.private_mode &amp;&amp; !settings.allow_ai_in_private_mode {
            return AIPrivacyDecision::BlockUseFallback {
                reason: "private_mode_blocks_ai".into(),
            };
        }

        if matches!(
            req.interaction_type,
            InteractionType::ProactiveCheckin | InteractionType::FocusMilestone
        ) &amp;&amp; (settings.quiet_mode || settings.streamer_mode || settings.private_mode) {
            return AIPrivacyDecision::BlockSilent {
                reason: "mode_blocks_proactive".into(),
            };
        }

        if !has_permission(settings, PrivacyPermission::AiChat) {
            return AIPrivacyDecision::BlockUseFallback {
                reason: "ai_chat_permission_denied".into(),
            };
        }

        if settings.private_mode {
            return AIPrivacyDecision::AllowMinimal;
        }

        let desktop_allowed = has_permission(
            settings,
            PrivacyPermission::AiUseSanitizedDesktopContext,
        );

        let memory_allowed = has_permission(
            settings,
            PrivacyPermission::MemoryRead,
        );

        match (desktop_allowed, memory_allowed) {
            (true, true) =&gt; AIPrivacyDecision::AllowFull,
            (false, true) =&gt; AIPrivacyDecision::AllowWithoutDesktopContext,
            (true, false) =&gt; AIPrivacyDecision::AllowWithoutMemory,
            (false, false) =&gt; AIPrivacyDecision::AllowMinimal,
        }
    }
}
```

### **9.5. Prompt redaction**

Ngay cả prompt đã build cũng phải đi qua redaction trước khi log.

```rust
pub fn redact_prompt_for_log(prompt: &amp;str) -&gt; String {
    let mut s = prompt.to_string();
    s = redact_api_keys(&amp;s);
    s = redact_tokens(&amp;s);
    s = redact_password_like(&amp;s);
    s = redact_file_paths(&amp;s);
    s
}
```

---

## **10. Memory Privacy Guard**

### **10.1. Trách nhiệm**

Memory Privacy Guard kiểm soát AI/user có được đọc hoặc ghi memory không.

```text
MemoryOperationCandidate
  ↓
MemoryPrivacyGuard
  ↓
Decision:
  - Save
  - SaveEncrypted
  - PendingApproval
  - Reject
```

### **10.2. Decision enum**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MemoryPrivacyDecision {
    Save,
    SaveEncrypted,
    PendingApproval { reason: String },
    Reject { reason: String },
}
```

### **10.3. Memory sensitivity**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SensitivityLevel {
    Public,
    Personal,
    Sensitive,
    Secret,
}
```

### **10.4. Sensitivity examples**

| **Level** | **Ví dụ** | **Policy** |
|---|---|---|
| **Public** | User thích câu trả lời ngắn | Save nếu permission |
| **Personal** | User làm dev buổi tối | Save hoặc ask |
| **Sensitive** | Sức khỏe, tài chính, quan hệ cá nhân | Pending approval |
| **Secret** | Password, API key, token, private key | Reject |

### **10.5. Guard rules**

```rust
pub struct MemoryPrivacyGuard {
    detector: SensitiveDataDetector,
}

impl MemoryPrivacyGuard {
    pub fn evaluate(
        &amp;self,
        candidate: &amp;MemoryOperationCandidate,
        settings: &amp;PrivacySettings,
    ) -&gt; MemoryPrivacyDecision {
        if settings.restricted_mode {
            return MemoryPrivacyDecision::Reject {
                reason: "restricted_mode".into(),
            };
        }

        if settings.private_mode &amp;&amp; !settings.allow_memory_write_in_private_mode {
            return MemoryPrivacyDecision::Reject {
                reason: "private_mode_blocks_memory_write".into(),
            };
        }

        if !has_permission(settings, PrivacyPermission::MemoryWrite) {
            return MemoryPrivacyDecision::PendingApproval {
                reason: "memory_write_requires_approval".into(),
            };
        }

        let sensitivity = self.detector.classify(&amp;candidate.content);

        match sensitivity {
            SensitivityLevel::Secret =&gt; MemoryPrivacyDecision::Reject {
                reason: "secret_detected".into(),
            },
            SensitivityLevel::Sensitive =&gt; {
                if !has_permission(settings, PrivacyPermission::SensitiveMemoryWrite) {
                    MemoryPrivacyDecision::PendingApproval {
                        reason: "sensitive_memory_requires_approval".into(),
                    }
                } else if settings.encrypt_sensitive_memory {
                    MemoryPrivacyDecision::SaveEncrypted
                } else {
                    MemoryPrivacyDecision::Save
                }
            }
            SensitivityLevel::Personal | SensitivityLevel::Public =&gt; {
                MemoryPrivacyDecision::Save
            }
        }
    }
}
```

---

## **11. Sensitive Data Detection**

### **11.1. Detector goals**

Detect rõ các loại secret không được lưu hoặc log.

```text
- API keys
- Bearer tokens
- JWT
- password-like text
- private keys
- credit card-like numbers
- email/phone optional sensitivity
- file paths
```

### **11.2. SensitiveDataDetector**

```rust
pub struct SensitiveDataDetector {
    patterns: Vec<sensitivepattern>,
}

pub struct SensitivePattern {
    pub name: String,
    pub regex: Regex,
    pub sensitivity: SensitivityLevel,
}
```

### **11.3. Pattern examples**

```rust
pub fn default_patterns() -&gt; Vec<sensitivepattern> {
    vec![
        SensitivePattern {
            name: "openai_api_key".into(),
            regex: Regex::new(r"sk-[A-Za-z0-9_\-]{20,}").unwrap(),
            sensitivity: SensitivityLevel::Secret,
        },
        SensitivePattern {
            name: "jwt".into(),
            regex: Regex::new(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+").unwrap(),
            sensitivity: SensitivityLevel::Secret,
        },
        SensitivePattern {
            name: "bearer_token".into(),
            regex: Regex::new(r"(?i)bearer\s+[A-Za-z0-9_\-\.]{20,}").unwrap(),
            sensitivity: SensitivityLevel::Secret,
        },
        SensitivePattern {
            name: "private_key".into(),
            regex: Regex::new(r"-----BEGIN [A-Z ]*PRIVATE KEY-----").unwrap(),
            sensitivity: SensitivityLevel::Secret,
        },
        SensitivePattern {
            name: "password_assignment".into(),
            regex: Regex::new(r"(?i)(password|passwd|pwd)\s*[:=]\s*\S+").unwrap(),
            sensitivity: SensitivityLevel::Secret,
        },
        SensitivePattern {
            name: "windows_path".into(),
            regex: Regex::new(r"[A-Za-z]:\\[^\s]+").unwrap(),
            sensitivity: SensitivityLevel::Sensitive,
        },
    ]
}
```

### **11.4. Classification**

```rust
impl SensitiveDataDetector {
    pub fn classify(&amp;self, text: &amp;str) -&gt; SensitivityLevel {
        let mut max_level = SensitivityLevel::Public;

        for pattern in &amp;self.patterns {
            if pattern.regex.is_match(text) {
                max_level = max_sensitivity(max_level, pattern.sensitivity);
            }
        }

        max_level
    }

    pub fn redact(&amp;self, text: &amp;str) -&gt; String {
        let mut out = text.to_string();

        for pattern in &amp;self.patterns {
            out = pattern.regex
                .replace_all(&amp;out, format!("[REDACTED:{}]", pattern.name))
                .to_string();
        }

        out
    }
}
```

### **11.5. False positive policy**

```text
- Secret detected → reject, không hỏi lại.
- Sensitive detected → pending approval.
- Personal detected → tùy memory permission.
- Nếu user explicitly says "remember this password" → vẫn reject.
```

Quan điểm mạnh: **password/token không bao giờ được memory hóa**. Nếu user cần vault, đó là sản phẩm khác.

---

## **12. Encrypted Storage**

### **12.1. What to encrypt**

| **Data** | **Encrypt?** |
|---|---|
| API key | Bắt buộc |
| Provider credentials | Bắt buộc |
| Sensitive memory | Tùy setting, default có |
| Normal memory | Không bắt buộc |
| Settings | Không, trừ secret fields |
| Logs | Không, nhưng redacted |
| Export file | Optional password encryption P2 |

### **12.2. Encryption backend**

Trên Windows:

```text
Preferred:
- Windows DPAPI via CryptProtectData / CryptUnprotectData

Alternative:
- keyring crate
- tauri-plugin-stronghold nếu cần vault mạnh hơn
```

### **12.3. EncryptedValue**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedValue {
    pub schema_version: u32,
    pub backend: EncryptionBackend,
    pub ciphertext_base64: String,
    pub created_at: DateTime<utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EncryptionBackend {
    WindowsDpapi,
    Keyring,
    Stronghold,
}
```

### **12.4. EncryptionService**

```rust
#[async_trait::async_trait]
pub trait EncryptionService: Send + Sync {
    async fn encrypt_string(&amp;self, plaintext: &amp;str) -&gt; Result<encryptedvalue>;
    async fn decrypt_string(&amp;self, encrypted: &amp;EncryptedValue) -&gt; Result<string>;
}
```

### **12.5. Windows DPAPI implementation sketch**

```rust
pub struct WindowsDpapiEncryption;

#[async_trait::async_trait]
impl EncryptionService for WindowsDpapiEncryption {
    async fn encrypt_string(&amp;self, plaintext: &amp;str) -&gt; Result<encryptedvalue> {
        let bytes = plaintext.as_bytes().to_vec();

        let encrypted = tokio::task::spawn_blocking(move || {
            dpapi_encrypt(&amp;bytes)
        }).await??;

        Ok(EncryptedValue {
            schema_version: 1,
            backend: EncryptionBackend::WindowsDpapi,
            ciphertext_base64: base64::encode(encrypted),
            created_at: Utc::now(),
        })
    }

    async fn decrypt_string(&amp;self, encrypted: &amp;EncryptedValue) -&gt; Result<string> {
        let bytes = base64::decode(&amp;encrypted.ciphertext_base64)?;
        let decrypted = tokio::task::spawn_blocking(move || {
            dpapi_decrypt(&amp;bytes)
        }).await??;

        Ok(String::from_utf8(decrypted)?)
    }
}
```

---

## **13. API Key Handling**

### **13.1. Rules**

```text
- API key never stored plain.
- API key never logged.
- API key never sent to frontend after save.
- Frontend only knows has_api_key: true/false.
- Test connection uses decrypted key in memory only.
- On update, old key overwritten.
- On delete, encrypted value removed.
```

### **13.2. Safe config**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderConfigSafe {
    pub base_url: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub timeout_seconds: u64,
    pub has_api_key: bool,
}
```

### **13.3. Stored config**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderConfigStored {
    pub base_url: String,
    pub api_key_encrypted: Option<encryptedvalue>,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub timeout_seconds: u64,
    pub updated_at: DateTime<utc>,
}
```

### **13.4. API key update flow**

```text
Frontend sends new API key
  ↓
Rust receives plain key in memory
  ↓
Validate non-empty
  ↓
Encrypt with EncryptionService
  ↓
Store encrypted value
  ↓
Drop plain key variable
  ↓
Return AIProviderConfigSafe
```

---

## **14. Logging &amp; Audit Privacy**

### **14.1. Log categories**

| **Log type** | **Default** | **Content** |
|---|---|---|
| App logs | On | Errors, lifecycle |
| Usage audit | On | Mode toggles, permission changes |
| AI request log | On minimal | tokens, status, no raw prompt |
| Prompt log | Off | Redacted prompt if enabled |
| Raw response log | Off | Redacted if enabled |
| Desktop raw log | Never | Forbidden |

### **14.2. Forbidden log content**

```text
Không bao giờ log:
- API key
- bearer token
- password
- raw window title
- file path
- clipboard
- screenshot
- command line
- raw prompt nếu prompt logging off
```

### **14.3. Privacy audit schema**

```sql
CREATE TABLE privacy_audit_log (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    permission TEXT,
    old_state TEXT,
    new_state TEXT,
    mode TEXT,
    reason TEXT,
    created_at DATETIME NOT NULL
);

CREATE INDEX idx_privacy_audit_created ON privacy_audit_log(created_at);
```

### **14.4. Audit events**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PrivacyAuditEvent {
    PermissionChanged {
        permission: PrivacyPermission,
        old_state: PermissionState,
        new_state: PermissionState,
    },
    ModeToggled {
        mode: PrivacyMode,
        enabled: bool,
    },
    AIRequestBlocked {
        reason: String,
    },
    MemoryWriteBlocked {
        reason: String,
    },
    SensitiveDataDetected {
        category: String,
        action: String, // redacted|rejected|pending
    },
    DataExported {
        scope: ExportScope,
    },
    DataDeleted {
        scope: DeleteScope,
    },
}
```

### **14.5. Retention**

```text
Default:
- privacy_audit_log: 30 ngày
- ai_request_log: 30 ngày
- prompt logs: 7 ngày nếu enabled
- app error logs: 14 ngày
```

---

## **15. Data Export**

### **15.1. Export scopes**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportScope {
    SettingsOnly,
    Characters,
    Memories,
    State,
    AiHistory,
    Logs,
    All,
}
```

### **15.2. Export package**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyExportPackage {
    pub export_version: u32,
    pub exported_at: DateTime<utc>,
    pub app_version: String,
    pub scopes: Vec<exportscope>,
    pub settings: Option<serde_json::value>,
    pub characters: Option<serde_json::value>,
    pub memories: Option<serde_json::value>,
    pub state: Option<serde_json::value>,
    pub ai_history: Option<serde_json::value>,
    pub logs: Option<serde_json::value>,
}
```

### **15.3. Export rules**

```text
- API key không export mặc định.
- Nếu user chọn export credentials, cảnh báo mạnh.
- Logs export đã redacted.
- Sensitive encrypted memory export giữ encrypted form nếu setting bật.
- Export file format: JSON.
```

### **15.4. Export flow**

```text
User chooses scope
  ↓
PrivacyManager validates permission
  ↓
Collect data from stores
  ↓
Redact logs
  ↓
Remove API key by default
  ↓
Build PrivacyExportPackage
  ↓
Save JSON file
  ↓
Audit DataExported
```

---

## **16. Data Delete**

### **16.1. Delete scopes**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeleteScope {
    AiHistory,
    Memories,
    CharacterStates,
    Logs,
    Settings,
    ProviderCredentials,
    Everything,
}
```

### **16.2. Delete policy**

| **Scope** | **Behavior** |
|---|---|
| **AI history** | Hard delete chat/history rows |
| **Memories** | Hard delete memory rows + embeddings |
| **Character states** | Reset or hard delete state |
| **Logs** | Hard delete audit/app logs |
| **Settings** | Reset to defaults |
| **Provider credentials** | Delete encrypted API key |
| **Everything** | Full wipe user data folder except app binary |

### **16.3. Delete confirmation**

```text
Memory delete: confirm once.
Everything: type "DELETE" confirmation.
Provider credentials: confirm once.
Settings reset: confirm once.
```

### **16.4. Delete flow**

```rust
pub async fn delete_data(
    &amp;self,
    scope: DeleteScope,
    confirmation: DeleteConfirmation,
) -&gt; Result<deleteresult> {
    self.validate_delete_confirmation(scope, confirmation)?;

    match scope {
        DeleteScope::AiHistory =&gt; self.ai_store.delete_all_history().await?,
        DeleteScope::Memories =&gt; self.memory_store.delete_all().await?,
        DeleteScope::CharacterStates =&gt; self.state_store.delete_all().await?,
        DeleteScope::Logs =&gt; self.log_store.delete_all().await?,
        DeleteScope::Settings =&gt; self.settings_store.reset_to_default().await?,
        DeleteScope::ProviderCredentials =&gt; self.provider_store.delete_credentials().await?,
        DeleteScope::Everything =&gt; self.full_wipe().await?,
    }

    self.audit.log(PrivacyAuditEvent::DataDeleted { scope }).await?;

    Ok(DeleteResult {
        scope,
        deleted_at: Utc::now(),
        success: true,
    })
}
```

### **16.5. Full wipe**

```text
Full wipe order:
1. Stop AI requests.
2. Stop awareness loop.
3. Hide overlay.
4. Flush stores.
5. Delete SQLite database.
6. Delete logs folder.
7. Delete cache folder.
8. Delete encrypted provider config.
9. Recreate default settings.
10. Restart app recommended.
```

---

## **17. Private Mode Integration**

### **17.1. Global private mode flag**

Private Mode nằm trong `PrivacySettings`, nhưng phải broadcast event cho toàn app.

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivacyModeChangedEvent {
    pub mode: PrivacyMode,
    pub enabled: bool,
    pub changed_at: DateTime<utc>,
}
```

### **17.2. Subsystem behavior**

| **Subsystem** | **Private Mode behavior** |
|---|---|
| **AIInteraction** | Block AI mặc định hoặc minimal nếu user allow |
| **MemorySystem** | Block read/write mặc định |
| **StateSystem** | Block relationship mutation |
| **DesktopAwareness** | Sanitizer returns None |
| **OverlayWindow** | Hide bubble/proactive UI |
| **BehaviorOrchestrator** | Stop proactive triggers |
| **Logging** | Minimal audit only |

### **17.3. Toggle flow**

```text
User toggles Private Mode
  ↓
PrivacyManager.set_private_mode(true)
  ↓
Update settings
  ↓
Emit privacy_mode_changed
  ↓
Subsystems react:
  - Awareness strips context
  - AI blocks proactive
  - Memory blocks write
  - Overlay hides sensitive UI
  ↓
Audit ModeToggled(private, true)
```

---

## **18. Quiet Mode Integration**

### **18.1. Quiet mode rules**

```text
Quiet Mode:
- Không proactive.
- Không OS notification.
- Không focus milestone bubble.
- Direct chat vẫn hoạt động.
- Memory và AI vẫn theo permission bình thường.
```

### **18.2. Use case**

Quiet Mode phù hợp khi user đang làm việc nhưng không cần privacy tuyệt đối.

```text
Private Mode = không muốn app biết/ghi/gửi.
Quiet Mode = không muốn app làm phiền.
```

### **18.3. Guard**

```rust
pub fn blocks_proactive(settings: &amp;PrivacySettings) -&gt; bool {
    settings.quiet_mode
        || settings.private_mode
        || settings.streamer_mode
        || settings.restricted_mode
}
```

---

## **19. Streamer Mode**

### **19.1. Streamer mode rules**

```text
Streamer Mode:
- Không hiện nội dung private trong bubble/toast.
- Không mở chat panel tự động.
- Không hiện memory approval content trên overlay.
- Settings sensitive fields masked.
- Không gửi desktop context AI mặc định.
- Có thể dùng template response an toàn.
```

### **19.2. UI masking**

```typescript
export function maskForStreamerMode(text: string): string {
  if (!usePrivacyStore.getState().streamerMode) return text;
  return "Nội dung riêng tư đã được ẩn.";
}
```

### **19.3. Bubble behavior**

| **Message type** | **Streamer Mode behavior** |
|---|---|
| Casual safe | Show |
| Memory approval | Hide content, show placeholder |
| AI response to private chat | Show inside chat only |
| Notification | Block |
| Error | Show generic |

---

## **20. Backend: PrivacyManager**

### **20.1. Module trách nhiệm**

```rust
pub struct PrivacyManager {
    settings_store: Arc<privacysettingsstore>,
    audit: Arc<privacyauditlogger>,
    detector: Arc<sensitivedatadetector>,
    encryption: Arc<dyn encryptionservice="">,
    event_bus: Arc<privacyeventbus>,
}
```

### **20.2. Public methods**

```rust
impl PrivacyManager {
    pub async fn init() -&gt; Result<self>;

    // Settings
    pub async fn get_settings(&amp;self) -&gt; Result<privacysettings>;
    pub async fn update_settings(&amp;self, patch: PrivacySettingsPatch) -&gt; Result<privacysettings>;
    pub async fn reset_settings(&amp;self) -&gt; Result<privacysettings>;

    // Permissions
    pub async fn get_permission(&amp;self, permission: PrivacyPermission) -&gt; Result<permissionstate>;
    pub async fn set_permission(
        &amp;self,
        permission: PrivacyPermission,
        state: PermissionState,
    ) -&gt; Result&lt;()&gt;;

    pub async fn has_permission(&amp;self, permission: PrivacyPermission) -&gt; Result<bool>;

    // Modes
    pub async fn set_private_mode(&amp;self, enabled: bool) -&gt; Result&lt;()&gt;;
    pub async fn set_quiet_mode(&amp;self, enabled: bool) -&gt; Result&lt;()&gt;;
    pub async fn set_streamer_mode(&amp;self, enabled: bool) -&gt; Result&lt;()&gt;;
    pub async fn set_restricted_mode(&amp;self, enabled: bool) -&gt; Result&lt;()&gt;;

    // Guards
    pub async fn evaluate_ai_request(
        &amp;self,
        req: &amp;AIInteractionRequest,
    ) -&gt; Result<aiprivacydecision>;

    pub async fn evaluate_memory_operation(
        &amp;self,
        candidate: &amp;MemoryOperationCandidate,
    ) -&gt; Result<memoryprivacydecision>;

    pub async fn sanitize_text_for_log(&amp;self, text: &amp;str) -&gt; Result<string>;
    pub async fn classify_sensitivity(&amp;self, text: &amp;str) -&gt; Result<sensitivitylevel>;

    // Encryption
    pub async fn encrypt_secret(&amp;self, plaintext: &amp;str) -&gt; Result<encryptedvalue>;
    pub async fn decrypt_secret(&amp;self, encrypted: &amp;EncryptedValue) -&gt; Result<string>;

    // Export/Delete
    pub async fn export_data(&amp;self, scope: ExportScope) -&gt; Result<privacyexportpackage>;
    pub async fn delete_data(
        &amp;self,
        scope: DeleteScope,
        confirmation: DeleteConfirmation,
    ) -&gt; Result<deleteresult>;

    // Events
    pub fn subscribe_events(&amp;self) -&gt; broadcast::Receiver<privacyevent>;
}
```

### **20.3. Privacy events**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PrivacyEvent {
    PermissionChanged {
        permission: PrivacyPermission,
        old_state: PermissionState,
        new_state: PermissionState,
    },
    ModeChanged {
        mode: PrivacyMode,
        enabled: bool,
    },
    SensitiveDataDetected {
        sensitivity: SensitivityLevel,
        action: String,
    },
    DataExported {
        scope: ExportScope,
    },
    DataDeleted {
        scope: DeleteScope,
    },
}
```

### **20.4. PrivacyMode enum**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrivacyMode {
    Private,
    Quiet,
    Streamer,
    Restricted,
}
```

---

## **21. IPC Contract**

### **21.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `privacy_get_settings` | `{}` | `PrivacySettings` |
| `privacy_update_settings` | `PrivacySettingsPatch` | `PrivacySettings` |
| `privacy_reset_settings` | `{}` | `PrivacySettings` |
| `privacy_get_permission` | `{ permission }` | `PermissionState` |
| `privacy_set_permission` | `{ permission, state }` | `void` |
| `privacy_set_private_mode` | `{ enabled }` | `void` |
| `privacy_set_quiet_mode` | `{ enabled }` | `void` |
| `privacy_set_streamer_mode` | `{ enabled }` | `void` |
| `privacy_set_restricted_mode` | `{ enabled }` | `void` |
| `privacy_classify_text` | `{ text }` | `SensitivityLevel` |
| `privacy_sanitize_text` | `{ text }` | `string` |
| `privacy_export_data` | `{ scope }` | `PrivacyExportPackage` |
| `privacy_delete_data` | `{ scope, confirmation }` | `DeleteResult` |
| `privacy_clear_logs` | `{}` | `void` |

### **21.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `privacy_permission_changed` | `{ permission, old_state, new_state }` | Settings sync |
| `privacy_mode_changed` | `{ mode, enabled }` | UI mode indicator |
| `privacy_sensitive_data_detected` | `{ sensitivity, action }` | Warning toast |
| `privacy_data_exported` | `{ scope }` | Export completed |
| `privacy_data_deleted` | `{ scope }` | Delete completed |

### **21.3. TypeScript types**

```typescript
export type PrivacyPermission =
  | "ai_chat"
  | "ai_use_sanitized_desktop_context"
  | "desktop_awareness"
  | "idle_detection"
  | "fullscreen_detection"
  | "app_category_detection"
  | "memory_read"
  | "memory_write"
  | "sensitive_memory_write"
  | "notifications"
  | "debug_logging"
  | "prompt_logging"
  | "usage_audit_logging";

export type PermissionState =
  | "granted"
  | "denied"
  | "ask_every_time";

export type PrivacyMode =
  | "private"
  | "quiet"
  | "streamer"
  | "restricted";

export type SensitivityLevel =
  | "public"
  | "personal"
  | "sensitive"
  | "secret";

export interface PrivacySettings {
  schema_version: number;
  permissions: Record<privacypermission, permissionstate="">;
  private_mode: boolean;
  quiet_mode: boolean;
  streamer_mode: boolean;
  restricted_mode: boolean;
  allow_ai_in_private_mode: boolean;
  allow_memory_read_in_private_mode: boolean;
  allow_memory_write_in_private_mode: boolean;
  redact_debug_logs: boolean;
  encrypt_sensitive_memory: boolean;
  audit_log_retention_days: number;
  ai_history_retention_days: number;
  updated_at: string;
}
```

---

## **22. Frontend Privacy UI**

### **22.1. Settings sections**

```text
Privacy Settings
├─ Privacy Modes
│  ├─ Private Mode
│  ├─ Quiet Mode
│  ├─ Streamer Mode
│  └─ Restricted Mode
│
├─ AI Privacy
│  ├─ Allow AI chat
│  ├─ Allow sanitized desktop context
│  ├─ Allow AI in Private Mode
│  └─ Prompt logging
│
├─ Memory Privacy
│  ├─ Allow memory read
│  ├─ Allow memory write
│  ├─ Require approval for sensitive memory
│  └─ Encrypt sensitive memory
│
├─ Desktop Awareness
│  ├─ Enable awareness
│  ├─ App category detection
│  ├─ Idle detection
│  └─ Fullscreen detection
│
├─ Data Management
│  ├─ Export data
│  ├─ Delete memories
│  ├─ Clear AI history
│  ├─ Clear logs
│  └─ Full reset
```

### **22.2. Privacy store**

```typescript
import { create } from "zustand";

interface PrivacyStore {
  settings: PrivacySettings | null;

  refresh: () =&gt; Promise<void>;
  setMode: (mode: PrivacyMode, enabled: boolean) =&gt; Promise<void>;
  setPermission: (
    permission: PrivacyPermission,
    state: PermissionState,
  ) =&gt; Promise<void>;
}

export const usePrivacyStore = create<privacystore>((set, get) =&gt; ({
  settings: null,

  refresh: async () =&gt; {
    const settings = await invoke<privacysettings>("privacy_get_settings");
    set({ settings });
  },

  setMode: async (mode, enabled) =&gt; {
    const command = {
      private: "privacy_set_private_mode",
      quiet: "privacy_set_quiet_mode",
      streamer: "privacy_set_streamer_mode",
      restricted: "privacy_set_restricted_mode",
    }[mode];

    await invoke(command, { enabled });
    await get().refresh();
  },

  setPermission: async (permission, state) =&gt; {
    await invoke("privacy_set_permission", { permission, state });
    await get().refresh();
  },
}));
```

### **22.3. Mode indicator**

```text
Overlay small icon:
- Private Mode: lock icon
- Quiet Mode: moon icon
- Streamer Mode: broadcast icon
- Restricted Mode: shield icon
```

Không nên hiện quá nhiều chữ trên overlay. Chỉ icon nhỏ, hover mới giải thích.

---

## **23. Subsystem Integration Matrix**

| **Subsystem** | **Privacy dependency** | **Required behavior** |
|---|---|---|
| **AIInteraction** | `AIPrivacyGuard` | Check before provider call |
| **MemorySystem** | `MemoryPrivacyGuard` | Check before read/write |
| **DesktopAwareness** | `PrivacyAwareSanitizer` | Strip context by mode |
| **StateSystem** | `PrivacySettings` | Block relationship change in Private |
| **OverlayWindow** | `PrivacyEvent` | Hide sensitive bubble/toast |
| **BehaviorOrchestrator** | `blocks_proactive` | Stop proactive in privacy modes |
| **SettingsSystem** | `EncryptedStorage` | Never expose API key |
| **LoggingSystem** | `SensitiveDataDetector` | Redact before persist |

---

## **24. Error Handling**

### **24.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum PrivacyError {
    #[error("Permission denied: {0:?}")]
    PermissionDenied(PrivacyPermission),

    #[error("Privacy mode blocks action: {0}")]
    ModeBlocked(String),

    #[error("Sensitive data detected: {0}")]
    SensitiveDataDetected(String),

    #[error("Encryption failed: {0}")]
    EncryptionFailed(String),

    #[error("Decryption failed: {0}")]
    DecryptionFailed(String),

    #[error("Export failed: {0}")]
    ExportFailed(String),

    #[error("Delete failed: {0}")]
    DeleteFailed(String),

    #[error("Invalid delete confirmation")]
    InvalidDeleteConfirmation,

    #[error("Settings persistence failed: {0}")]
    SettingsPersistenceFailed(String),
}
```

### **24.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Permission denied | Block action, optional prompt user |
| Private mode blocks AI | Use local fallback |
| Sensitive secret detected | Reject memory/log |
| Encryption fail | Refuse save secret |
| Decryption fail | Ask user to re-enter API key |
| Export fail | Keep data unchanged, show error |
| Delete fail | Stop and report partial result |
| Settings save fail | Keep in memory, retry |

### **24.3. Fail-closed policy**

```text
Nếu PrivacyManager unavailable:
- AI request: block
- Memory write: block
- Desktop context export: block
- Notification: block
- Local animation/template: allow
```

---

## **25. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── privacy/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── settings.rs
│               ├── permissions.rs
│               ├── modes.rs
│               ├── ai_guard.rs
│               ├── memory_guard.rs
│               ├── sanitizer.rs
│               ├── detector.rs
│               ├── encryption.rs
│               ├── export.rs
│               ├── delete.rs
│               ├── audit.rs
│               ├── events.rs
│               └── errors.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── privacy_commands.rs
│
├── src/
│   ├── settings/
│   │   └── pages/
│   │       └── Privacy.tsx
│   │
│   ├── overlay/
│   │   └── components/
│   │       ├── PrivacyModeIndicator.tsx
│   │       └── SensitiveContentMask.tsx
│   │
│   └── shared/
│       └── types/
│           └── privacy.ts
│
└── docs/
    └── privacy-system.md
```

---

## **26. Implementation Checklist**

### **26.1. P0 Core**

- [ ] Define `PrivacySettings`.
- [ ] Define `PrivacyPermission`.
- [ ] Define `PermissionState`.
- [ ] Define privacy modes.
- [ ] Implement `PrivacySettingsStore`.
- [ ] Implement `PrivacyManager`.
- [ ] Implement permission check helper.
- [ ] Implement privacy event bus.
- [ ] Implement privacy audit log.

### **26.2. P0 AI Guard**

- [ ] Implement `AIPrivacyGuard`.
- [ ] Block AI in Restricted Mode.
- [ ] Block AI in Private Mode by default.
- [ ] Strip desktop context if permission denied.
- [ ] Strip memory if permission denied.
- [ ] Block proactive in Quiet/Private/Streamer/Restricted.

### **26.3. P0 Memory Guard**

- [ ] Implement `MemoryPrivacyGuard`.
- [ ] Define `SensitivityLevel`.
- [ ] Reject secret memory.
- [ ] Pending approval for sensitive memory.
- [ ] Block memory write in Private Mode by default.

### **26.4. P0 Sensitive Data Detection**

- [ ] Implement regex detector.
- [ ] Detect API keys.
- [ ] Detect bearer tokens.
- [ ] Detect JWT.
- [ ] Detect private keys.
- [ ] Detect password-like strings.
- [ ] Redact logs before persist.

### **26.5. P0 Encryption**

- [ ] Implement `EncryptedValue`.
- [ ] Implement `EncryptionService`.
- [ ] Implement Windows DPAPI backend.
- [ ] Store API key encrypted.
- [ ] Return only safe provider config to frontend.

### **26.6. P0 Frontend**

- [ ] Privacy settings page.
- [ ] Private Mode toggle.
- [ ] Quiet Mode toggle.
- [ ] Streamer Mode toggle.
- [ ] Restricted Mode toggle.
- [ ] Permission controls.
- [ ] Privacy mode indicator on overlay.

### **26.7. P1 Consent**

- [ ] First-run consent wizard.
- [ ] Save consent result.
- [ ] Allow reset consent.
- [ ] AskEveryTime prompt for memory write.

### **26.8. P1 Export/Delete**

- [ ] Implement `privacy_export_data`.
- [ ] Implement `privacy_delete_data`.
- [ ] Export settings/memory/state/history/logs.
- [ ] Full wipe with confirmation.
- [ ] Clear logs button.

### **26.9. P2 Polish**

- [ ] Password-protected export file.
- [ ] Better sensitive text classifier.
- [ ] Privacy report dashboard.
- [ ] Per-character privacy settings.
- [ ] Temporary private session timer.
- [ ] Auto-enable Streamer Mode when screen sharing detected.

---

## **27. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **PrivacyManager** | Module trung tâm quản lý permission, mode và privacy guards. |
| **PrivacyPermission** | Quyền riêng lẻ cho AI, memory, awareness, logging. |
| **Private Mode** | Mode chặn AI context, memory write, proactive và relationship update mặc định. |
| **Quiet Mode** | Mode không làm phiền, nhưng không chặn privacy toàn phần. |
| **Streamer Mode** | Mode ẩn nội dung nhạy cảm trên overlay khi share screen. |
| **Restricted Mode** | Kill-switch bảo mật tối đa. |
| **Sanitized Context** | Context đã loại bỏ raw title/path/PID trước khi gửi AI. |
| **SensitiveDataDetector** | Bộ phát hiện secret và dữ liệu nhạy cảm. |
| **MemoryPrivacyGuard** | Guard quyết định memory có được lưu không. |
| **AIPrivacyGuard** | Guard quyết định AI request có được gửi không. |
| **EncryptedValue** | Cấu trúc lưu dữ liệu đã mã hóa. |
| **DPAPI** | Windows Data Protection API dùng để encrypt local secret. |
| **Fail closed** | Khi lỗi guard, chặn action thay vì cho qua. |

---

# **Phụ lục A: Flow AI request với privacy guard**

```text
User / Proactive trigger
       ↓
AIOrchestrator receives AIInteractionRequest
       ↓
PrivacyManager.evaluate_ai_request(req)
       ↓
Decision:
  ├─ BlockUseFallback
  │    ↓
  │  TemplateFallbackEngine
  │    ↓
  │  No provider call
  │
  ├─ BlockSilent
  │    ↓
  │  Return silent result
  │
  ├─ AllowMinimal
  │    ↓
  │  Build prompt without desktop context and without memory
  │
  ├─ AllowWithoutDesktopContext
  │    ↓
  │  Build prompt with character + memory only
  │
  ├─ AllowWithoutMemory
  │    ↓
  │  Build prompt with character + sanitized desktop context only
  │
  └─ AllowFull
       ↓
     Build normal prompt
       ↓
PromptBuilder builds messages
       ↓
SensitiveDataDetector redacts prompt for debug log
       ↓
Provider call
       ↓
AI response
       ↓
AI response validation
       ↓
MemoryPrivacyGuard evaluates memory ops
       ↓
StateManager applies only privacy-safe state delta
       ↓
Overlay shows bubble only if mode allows
```

---

# **Phụ lục B: Flow memory proposal với sensitive data**

```text
AI response contains memory_operations[]
       ↓
MemoryManager builds MemoryOperationCandidate
       ↓
MemoryPrivacyGuard.evaluate(candidate)
       ↓
SensitiveDataDetector.classify(content)
       ↓
Decision:
  ├─ Secret
  │    ↓
  │  Reject immediately
  │    ↓
  │  Audit SensitiveDataDetected(action=rejected)
  │
  ├─ Sensitive
  │    ↓
  │  PendingApproval
  │    ↓
  │  If user approves:
  │     - SaveEncrypted if setting enabled
  │     - Else Save
  │
  ├─ Personal
  │    ↓
  │  Save or PendingApproval depending permission
  │
  └─ Public
       ↓
     Save if MemoryWrite granted
       ↓
Audit memory operation result
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. PrivacySettings mẫu**

```json
{
  "schema_version": 1,
  "permissions": {
    "ai_chat": "granted",
    "ai_use_sanitized_desktop_context": "ask_every_time",
    "desktop_awareness": "granted",
    "idle_detection": "granted",
    "fullscreen_detection": "granted",
    "app_category_detection": "granted",
    "memory_read": "granted",
    "memory_write": "ask_every_time",
    "sensitive_memory_write": "ask_every_time",
    "notifications": "denied",
    "debug_logging": "denied",
    "prompt_logging": "denied",
    "usage_audit_logging": "granted"
  },
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
  "updated_at": "2026-05-26T23:32:00Z"
}
```

## **C.2. AIPrivacyDecision mẫu**

```json
{
  "decision": "allow_without_desktop_context",
  "reason": "desktop_context_permission_denied"
}
```

## **C.3. MemoryPrivacyDecision mẫu**

```json
{
  "decision": "pending_approval",
  "reason": "sensitive_memory_requires_approval",
  "sensitivity": "sensitive"
}
```

## **C.4. Privacy audit event mẫu**

```json
{
  "type": "mode_toggled",
  "mode": "private",
  "enabled": true,
  "created_at": "2026-05-26T23:32:00Z"
}
```

## **C.5. EncryptedValue mẫu**

```json
{
  "schema_version": 1,
  "backend": "windows_dpapi",
  "ciphertext_base64": "BASE64_ENCRYPTED_VALUE",
  "created_at": "2026-05-26T23:32:00Z"
}
```

## **C.6. Export package mẫu**

```json
{
  "export_version": 1,
  "exported_at": "2026-05-26T23:32:00Z",
  "app_version": "0.1.0",
  "scopes": ["settings_only"],
  "settings": {
    "privacy": {
      "private_mode": false,
      "quiet_mode": false,
      "streamer_mode": false
    }
  },
  "characters": null,
  "memories": null,
  "state": null,
  "ai_history": null,
  "logs": null
}
```

---

**Tài liệu này là source of truth cho Privacy System. Mọi subsystem phải tuân thủ nguyên tắc: permission check trước action, private/restricted mode override tất cả, desktop context phải sanitize, secret không bao giờ được memory hóa hoặc log, API key phải encrypt, user luôn có quyền export và delete dữ liệu.**

---