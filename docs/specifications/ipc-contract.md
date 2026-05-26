# **Chiro-Pet IPC Contract**

> Tài liệu thiết kế chính thức cho **IPC Contract** của **Chiro-Pet**.  
> File này là **API reference duy nhất** cho toàn bộ giao tiếp giữa **Frontend** và **Rust backend** trong app Tauri.
>
> **Nguyên tắc lõi:** Frontend không được gọi subsystem nội bộ trực tiếp. Mọi thao tác phải đi qua **Tauri command** đã định nghĩa rõ payload, response, error format và event tương ứng. IPC Contract là **single source of truth** để tránh lệch type giữa Rust và TypeScript.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [IPC Architecture](#3-ipc-architecture)
4. [Naming Convention](#4-naming-convention)
5. [Common Types](#5-common-types)
6. [Error Response Format](#6-error-response-format)
7. [Command Categories](#7-command-categories)
8. [App & System Commands](#8-app--system-commands)
9. [Character Commands](#9-character-commands)
10. [State Commands](#10-state-commands)
11. [Memory Commands](#11-memory-commands)
12. [AI Commands](#12-ai-commands)
13. [Animation Commands](#13-animation-commands)
14. [Asset Commands](#14-asset-commands)
15. [Desktop Awareness Commands](#15-desktop-awareness-commands)
16. [Overlay Window Commands](#16-overlay-window-commands)
17. [Privacy Commands](#17-privacy-commands)
18. [Behavior Commands](#18-behavior-commands)
19. [Settings Commands](#19-settings-commands)
20. [Hotkey Commands](#20-hotkey-commands)
21. [Event Categories](#21-event-categories)
22. [Frontend IPC Client](#22-frontend-ipc-client)
23. [Backend Command Registration](#23-backend-command-registration)
24. [Versioning Strategy](#24-versioning-strategy)
25. [Payload Limits](#25-payload-limits)
26. [Security & Privacy Rules](#26-security--privacy-rules)
27. [Testing Strategy](#27-testing-strategy)
28. [File Structure](#28-file-structure)
29. [Implementation Checklist](#29-implementation-checklist)
30. [Glossary](#30-glossary)
31. [Phụ lục A: Full Command Index](#phụ-lục-a-full-command-index)
32. [Phụ lục B: Full Event Index](#phụ-lục-b-full-event-index)
33. [Phụ lục C: TypeScript IPC mẫu](#phụ-lục-c-typescript-ipc-mẫu)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

IPC Contract của **Chiro-Pet** phải:

- Gom toàn bộ **Tauri commands** vào một tài liệu chuẩn.
- Gom toàn bộ **Rust → Frontend events** vào một tài liệu chuẩn.
- Chuẩn hóa:
  - command name
  - payload shape
  - return type
  - error shape
  - event name
  - event payload
- Giảm lệch type giữa Rust và TypeScript.
- Cho phép AI agent hoặc developer implement frontend/backend độc lập.
- Định nghĩa versioning để thay đổi contract an toàn.
- Định nghĩa payload limits để tránh IPC quá nặng.
- Đảm bảo privacy: không expose raw path/window title/API key.

### **1.2. Phạm vi**

Tài liệu này bao quát IPC cho:

- App/System
- Character
- State
- Memory
- AI
- Animation
- Asset
- Desktop Awareness
- Overlay Window
- Privacy
- Behavior
- Settings
- Hotkey

Tài liệu này không mô tả chi tiết logic nội bộ của từng subsystem. Logic nội bộ nằm trong các system docs tương ứng.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Typed contract** | Mọi command/event phải có type Rust và TypeScript tương ứng. |
| **2** | **No raw internal data** | Không trả raw desktop title, PID, process path, API key. |
| **3** | **Stable command name** | Command đã public không đổi tên tùy tiện. |
| **4** | **Explicit payload** | Không dùng `serde_json::Value` nếu có thể dùng struct rõ ràng. |
| **5** | **Error chuẩn hóa** | Mọi command trả lỗi qua `IpcError`. |
| **6** | **Events are notifications** | Event chỉ để sync UI, không thay thế command query. |
| **7** | **No direct DB access** | Frontend không bao giờ gọi DB layer. |
| **8** | **Payload bounded** | Có giới hạn size cho request/response. |
| **9** | **Backward compatible** | Thêm field optional thay vì phá field cũ. |
| **10** | **Privacy-first** | IPC không được bypass Privacy System. |

### **2.2. Anti-pattern cần tránh**

- ❌ Command trả raw SQLite row.
- ❌ Command trả API key decrypted.
- ❌ Event emit raw AI prompt.
- ❌ Frontend truyền file path rồi renderer load trực tiếp.
- ❌ Dùng event để request dữ liệu lớn.
- ❌ Một command làm quá nhiều việc không rõ trách nhiệm.
- ❌ Dùng `any` trong TypeScript IPC client.
- ❌ Không version payload.
- ❌ Không có error code ổn định.
- ❌ Event spam mỗi frame.

---

## **3. IPC Architecture**

### **3.1. Tổng quan**

```text
┌──────────────────────────────────────────────────────────────┐
│                         FRONTEND                              │
│ React/Svelte/Three.js                                         │
│                                                              │
│  - invoke(command, payload)                                   │
│  - listen(event, handler)                                     │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             │ Tauri IPC
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                       IPC COMMAND LAYER                       │
│ src-tauri/src/ipc/*_commands.rs                               │
│                                                              │
│  - validate payload                                           │
│  - call subsystem manager                                     │
│  - map error to IpcError                                      │
│  - return typed result                                        │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                       CORE SUBSYSTEMS                         │
│ character/state/memory/ai/asset/overlay/...                   │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             │ emit event
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                       EVENT BRIDGE                            │
│ Rust event bus → Tauri app.emit                               │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                         FRONTEND                              │
│ Stores update UI state                                        │
└──────────────────────────────────────────────────────────────┘
```

### **3.2. Command flow**

```text
Frontend invoke
  ↓
Tauri command handler
  ↓
Payload deserialize
  ↓
Permission/privacy validation
  ↓
Subsystem manager call
  ↓
Domain result
  ↓
Map to IPC DTO
  ↓
Return JSON to frontend
```

### **3.3. Event flow**

```text
Subsystem event bus
  ↓
IPC event bridge
  ↓
Sanitize payload
  ↓
app.emit(event_name, payload)
  ↓
Frontend listener
  ↓
Store update
```

---

## **4. Naming Convention**

### **4.1. Command naming**

Format:

```text
{subsystem}_{verb}_{object}
```

Examples:

```text
ai_send_chat
state_get_active
asset_import_model
overlay_set_anchor
privacy_set_private_mode
behavior_get_budget_today
```

### **4.2. Event naming**

Format:

```text
{subsystem}_{event_past_tense}
```

Examples:

```text
state_changed
asset_imported
overlay_hidden
privacy_mode_changed
behavior_decision_made
```

### **4.3. Type naming**

Rust:

```rust
AiSendChatPayload
AiSendChatResult
StateChangedPayload
```

TypeScript:

```typescript
AiSendChatPayload
AiSendChatResult
StateChangedPayload
```

### **4.4. Field naming**

Tất cả payload dùng **snake_case** để đồng bộ Rust serde.

```json
{
  "character_id": "mira_default",
  "created_at": "2026-05-27T00:30:00Z"
}
```

TypeScript có thể giữ snake_case để tránh mapping thừa.

---

## **5. Common Types**

### **5.1. Common scalar types**

```typescript
export type ISODateTime = string;
export type ISODate = string;
export type UUID = string;
export type AssetId = string;
export type CharacterId = string;
export type RequestId = string;
```

### **5.2. Common response wrapper**

Khuyến nghị command Rust trả trực tiếp `Result<t, ipcerror="">`. Frontend wrapper tự normalize.

```rust
pub type IpcResult<t> = Result<t, ipcerror="">;
```

TypeScript client:

```typescript
export type IpcResult<t> = Promise<t>;
```

### **5.3. Pagination**

```typescript
export interface PageRequest {
  limit: number;
  offset: number;
}

export interface PageResult<t> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
```

### **5.4. Sort**

```typescript
export interface SortRequest {
  field: string;
  direction: "asc" | "desc";
}
```

### **5.5. Empty payload**

Dùng object rỗng `{}` thay vì `null`.

```typescript
export type EmptyPayload = Record<string, never="">;
```

---

## **6. Error Response Format**

### **6.1. IpcError**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcError {
    pub code: String,
    pub message: String,
    pub subsystem: String,
    pub details: Option<serde_json::value>,
    pub recoverable: bool,
    pub request_id: Option<string>,
}
```

### **6.2. TypeScript**

```typescript
export interface IpcError {
  code: string;
  message: string;
  subsystem: string;
  details?: unknown | null;
  recoverable: boolean;
  request_id?: string | null;
}
```

### **6.3. Error code convention**

Format:

```text
{subsystem}.{error_name}
```

Examples:

```text
ai.provider_unavailable
privacy.permission_denied
asset.validation_failed
overlay.monitor_not_found
state.no_active_character
```

### **6.4. Common error codes**

| **Code** | **Ý nghĩa** |
|---|---|
| `common.invalid_payload` | Payload deserialize/validate fail |
| `common.not_found` | Resource không tồn tại |
| `common.permission_denied` | Bị chặn bởi permission |
| `common.privacy_blocked` | Bị chặn bởi privacy mode |
| `common.internal_error` | Lỗi không phân loại |
| `common.unsupported` | Feature chưa hỗ trợ |
| `common.timeout` | Operation timeout |
| `common.cancelled` | Operation bị cancel |

### **6.5. Frontend error normalization**

```typescript
export function normalizeIpcError(error: unknown): IpcError {
  if (typeof error === "object" && error && "code" in error) {
    return error as IpcError;
  }

  return {
    code: "common.internal_error",
    message: String(error),
    subsystem: "unknown",
    details: null,
    recoverable: true,
    request_id: null,
  };
}
```

---

## **7. Command Categories**

### **7.1. Danh sách subsystem IPC**

| **Subsystem** | **Prefix** | **File** |
|---|---|---|
| **App/System** | `app_` | `app_commands.rs` |
| **Character** | `character_` | `character_commands.rs` |
| **State** | `state_` | `state_commands.rs` |
| **Memory** | `memory_` | `memory_commands.rs` |
| **AI** | `ai_` | `ai_commands.rs` |
| **Animation** | `animation_` | `animation_commands.rs` |
| **Asset** | `asset_` | `asset_commands.rs` |
| **Awareness** | `awareness_` | `awareness_commands.rs` |
| **Overlay** | `overlay_` | `overlay_commands.rs` |
| **Privacy** | `privacy_` | `privacy_commands.rs` |
| **Behavior** | `behavior_` | `behavior_commands.rs` |
| **Settings** | `settings_` | `settings_commands.rs` |
| **Hotkey** | `hotkey_` | `hotkey_commands.rs` |

---

## **8. App & System Commands**

### **8.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `app_get_info` | `{}` | `AppInfo` |
| `app_get_status` | `{}` | `AppStatus` |
| `app_open_user_data_folder` | `{}` | `void` |
| `app_restart` | `{}` | `void` |
| `app_quit` | `{}` | `void` |
| `app_get_diagnostics` | `{}` | `AppDiagnostics` |

### **8.2. Types**

```typescript
export interface AppInfo {
  app_name: string;
  app_version: string;
  ipc_contract_version: number;
  platform: "windows" | "macos" | "linux";
  tauri_version?: string | null;
}

export interface AppStatus {
  started_at: ISODateTime;
  active_character_id?: string | null;
  overlay_visible: boolean;
  current_mode: string;
  private_mode: boolean;
}

export interface AppDiagnostics {
  database_ok: boolean;
  asset_registry_ok: boolean;
  ai_provider_configured: boolean;
  overlay_window_ok: boolean;
  awareness_enabled: boolean;
  warnings: string[];
}
```

### **8.3. Events**

| **Event** | **Payload** |
|---|---|
| `app_started` | `AppInfo` |
| `app_shutdown_requested` | `{ reason: string }` |
| `app_diagnostics_updated` | `AppDiagnostics` |

---

## **9. Character Commands**

### **9.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `character_list` | `{}` | `CharacterProfile[]` |
| `character_get_active` | `{}` | `CharacterProfile` |
| `character_get_by_id` | `{ character_id: string }` | `CharacterProfile` |
| `character_create` | `CreateCharacterRequest` | `CharacterProfile` |
| `character_update` | `UpdateCharacterRequest` | `CharacterProfile` |
| `character_delete` | `{ character_id: string }` | `void` |
| `character_switch_active` | `{ character_id: string }` | `CharacterProfile` |
| `character_set_model_asset` | `{ character_id, asset_id }` | `CharacterProfile` |
| `character_export` | `{ character_id: string }` | `CharacterExportPackage` |
| `character_import` | `CharacterExportPackage` | `CharacterProfile` |

### **9.2. Core types**

```typescript
export interface CharacterProfile {
  character_id: string;
  schema_version: number;
  name: string;
  display_name: string;
  model_asset_id: string;
  personality: PersonalityTraits;
  identity: CharacterIdentity;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  is_active: boolean;
}

export interface PersonalityTraits {
  warmth: number;
  playfulness: number;
  shyness: number;
  curiosity: number;
  patience: number;
  confidence: number;
  anxiety?: number;
}

export interface CharacterIdentity {
  pronoun_self: string;
  pronoun_user: string;
  speaking_style: string;
  backstory_summary?: string | null;
}

export interface CreateCharacterRequest {
  name: string;
  display_name: string;
  model_asset_id: string;
  personality?: Partial<personalitytraits>;
  identity?: Partial<characteridentity>;
}

export interface UpdateCharacterRequest {
  character_id: string;
  patch: Partial<characterprofile>;
}
```

### **9.3. Events**

| **Event** | **Payload** |
|---|---|
| `character_created` | `CharacterProfile` |
| `character_updated` | `CharacterProfile` |
| `character_deleted` | `{ character_id: string }` |
| `character_active_changed` | `{ from: string \| null, to: string }` |
| `character_model_changed` | `{ character_id: string, asset_id: string }` |

---

## **10. State Commands**

### **10.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `state_get_active` | `{}` | `CharacterState` |
| `state_get_by_id` | `{ character_id: string }` | `CharacterState` |
| `state_get_derived` | `{ character_id: string }` | `DerivedState` |
| `state_force_flush` | `{}` | `void` |
| `state_export_all` | `{}` | `StateExport` |
| `state_import` | `StateExport` | `ImportResult` |
| `state_debug_dump` | `{ character_id: string }` | `string` |
| `state_reset_counters` | `{ character_id: string }` | `void` |

### **10.2. Events**

| **Event** | **Payload** |
|---|---|
| `state_changed` | `StateChangedPayload` |
| `state_milestone` | `MilestoneReachedPayload` |
| `state_daily_reset` | `{ character_id: string, date: string }` |
| `state_character_switched` | `{ from: string \| null, to: string }` |
| `state_import_completed` | `ImportResult` |

### **10.3. Types**

```typescript
export interface EmotionalState {
  mood: number;
  energy: number;
  curiosity: number;
  patience: number;
  confidence: number;
}

export interface RelationshipState {
  affinity: number;
  trust: number;
  familiarity: number;
}

export interface DailyCounters {
  affinity_gained: number;
  trust_gained: number;
  proactive_count: number;
  ai_calls: number;
  interaction_count: number;
}

export interface CharacterState {
  character_id: string;
  schema_version: number;
  emotional: EmotionalState;
  relationship: RelationshipState;
  counters: DailyCounters;
  last_interaction_at?: string | null;
  last_decay_tick_at: string;
  last_reset_date: string;
  updated_at: string;
}

export interface StateChangedPayload {
  character_id: string;
  applied_delta: StateDelta;
  new_state: CharacterState;
}
```

---

## **11. Memory Commands**

### **11.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `memory_list` | `MemoryListRequest` | `PageResult<memoryrecord>` |
| `memory_get` | `{ memory_id: string }` | `MemoryRecord` |
| `memory_create` | `CreateMemoryRequest` | `MemoryRecord` |
| `memory_update` | `UpdateMemoryRequest` | `MemoryRecord` |
| `memory_delete` | `{ memory_id: string }` | `void` |
| `memory_search` | `MemorySearchRequest` | `MemoryRecord[]` |
| `memory_list_pending` | `{}` | `MemoryProposal[]` |
| `memory_approve_proposal` | `{ proposal_id: string }` | `MemoryRecord` |
| `memory_reject_proposal` | `{ proposal_id: string, reason?: string }` | `void` |
| `memory_merge` | `{ source_ids: string[], target_id?: string }` | `MemoryRecord` |
| `memory_export_all` | `{}` | `MemoryExport` |
| `memory_import` | `MemoryExport` | `ImportResult` |

### **11.2. Types**

```typescript
export type MemoryScope = "shared" | "character";
export type MemorySensitivity = "public" | "personal" | "sensitive" | "secret";

export interface MemoryRecord {
  memory_id: string;
  scope: MemoryScope;
  character_id?: string | null;
  type: string;
  content: string;
  importance: number;
  confidence: number;
  sensitivity: MemorySensitivity;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  last_used_at?: ISODateTime | null;
}

export interface MemoryListRequest {
  scope?: MemoryScope | null;
  character_id?: string | null;
  page: PageRequest;
}

export interface CreateMemoryRequest {
  scope: MemoryScope;
  character_id?: string | null;
  type: string;
  content: string;
  importance: number;
}

export interface UpdateMemoryRequest {
  memory_id: string;
  patch: Partial<memoryrecord>;
}

export interface MemorySearchRequest {
  query: string;
  scope?: MemoryScope | null;
  character_id?: string | null;
  limit: number;
}

export interface MemoryProposal {
  proposal_id: string;
  operation: "create" | "patch" | "merge" | "delete_request" | "verify";
  content: string;
  sensitivity: MemorySensitivity;
  reason?: string | null;
  created_at: ISODateTime;
}
```

### **11.3. Events**

| **Event** | **Payload** |
|---|---|
| `memory_created` | `MemoryRecord` |
| `memory_updated` | `MemoryRecord` |
| `memory_deleted` | `{ memory_id: string }` |
| `memory_proposal_created` | `MemoryProposal` |
| `memory_proposal_resolved` | `{ proposal_id: string, accepted: boolean }` |
| `memory_import_completed` | `ImportResult` |

---

## **12. AI Commands**

### **12.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `ai_send_chat` | `{ message: string }` | `AIInteractionResult` |
| `ai_quick_action` | `{ action_id: string }` | `AIInteractionResult` |
| `ai_retry_last` | `{ request_id: string }` | `AIInteractionResult` |
| `ai_cancel_current` | `{}` | `void` |
| `ai_get_status` | `{}` | `AIStatus` |
| `ai_get_usage_today` | `{}` | `AIUsageSummary` |
| `ai_test_connection` | `AIProviderConfigInput` | `AIConnectionTestResult` |
| `ai_update_config` | `AIProviderConfigInput` | `void` |
| `ai_get_config_safe` | `{}` | `AIProviderConfigSafe` |

### **12.2. Types**

```typescript
export type AILifecycleState =
  | "idle"
  | "preparing_context"
  | "thinking"
  | "waiting_provider"
  | "validating"
  | "applying_operations"
  | "responding"
  | "failed"
  | "fallback";

export interface AIStatus {
  lifecycle: AILifecycleState;
  current_request_id?: string | null;
  provider_available: boolean;
  circuit_open: boolean;
  budget_remaining_cents: number;
}

export interface AIUsageSummary {
  date: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_cents: number;
  daily_limit_cents: number;
}

export interface AIProviderConfigInput {
  base_url: string;
  api_key?: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
}

export interface AIProviderConfigSafe {
  base_url: string;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
  has_api_key: boolean;
}

export interface AIConnectionTestResult {
  ok: boolean;
  latency_ms?: number | null;
  error?: string | null;
}
```

### **12.3. Events**

| **Event** | **Payload** |
|---|---|
| `ai_lifecycle_changed` | `{ lifecycle: AILifecycleState, request_id?: string \| null }` |
| `ai_response_started` | `{ request_id: string }` |
| `ai_response_completed` | `AIInteractionResult` |
| `ai_response_failed` | `IpcError` |
| `ai_usage_updated` | `AIUsageSummary` |
| `ai_budget_exceeded` | `{ limit: number, used: number }` |

### **12.4. Security rule**

`ai_get_config_safe` **không bao giờ** trả `api_key`.

---

## **13. Animation Commands**

### **13.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `animation_play` | `AnimationCommand` | `PlayResult` |
| `animation_stop` | `{ layer?: string }` | `void` |
| `animation_set_idle` | `{ animation_id: string }` | `void` |
| `animation_get_state` | `{}` | `AnimationRuntimeState` |
| `animation_list_available` | `{}` | `AnimationManifestItem[]` |
| `animation_validate_id` | `{ animation_id: string }` | `{ valid: boolean }` |
| `animation_reload_manifest` | `{}` | `void` |

### **13.2. Events**

| **Event** | **Payload** |
|---|---|
| `animation_started` | `{ animation_id: string, layer: string }` |
| `animation_completed` | `{ animation_id: string, layer: string }` |
| `animation_interrupted` | `{ animation_id: string, reason: string }` |
| `animation_state_changed` | `AnimationRuntimeState` |
| `animation_manifest_reloaded` | `{ count: number }` |

---

## **14. Asset Commands**

### **14.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `asset_import_model` | `ImportAssetRequest` | `ImportAssetResult` |
| `asset_import_animation` | `ImportAnimationRequest` | `ImportAssetResult` |
| `asset_get` | `{ asset_id: string }` | `AssetRecord` |
| `asset_list` | `AssetFilter` | `AssetRecord[]` |
| `asset_list_models` | `{}` | `AssetRecord[]` |
| `asset_list_animations` | `{}` | `AssetRecord[]` |
| `asset_resolve` | `{ asset_id: string }` | `ResolvedAsset` |
| `asset_resolve_thumbnail` | `{ asset_id: string }` | `ResolvedAsset \| null` |
| `asset_rename` | `{ asset_id: string, name: string }` | `AssetRecord` |
| `asset_replace` | `{ asset_id: string, new_path: string }` | `AssetRecord` |
| `asset_rollback` | `{ asset_id: string, version_number: number }` | `AssetRecord` |
| `asset_delete` | `{ asset_id: string, force: boolean }` | `DeleteAssetResult` |
| `asset_validate` | `{ asset_id: string }` | `AssetValidationStatus` |
| `asset_save_thumbnail` | `{ asset_id: string, image_bytes: number[], format: ThumbnailFormat }` | `void` |
| `asset_cleanup_unused` | `{}` | `AssetCleanupResult` |
| `asset_open_folder` | `{ asset_id: string }` | `void` |

### **14.2. Events**

| **Event** | **Payload** |
|---|---|
| `asset_imported` | `{ asset_id: string, kind: AssetKind }` |
| `asset_updated` | `{ asset_id: string, kind: AssetKind }` |
| `asset_deleted` | `{ asset_id: string }` |
| `asset_reload_requested` | `{ asset_id: string }` |
| `asset_validation_failed` | `{ source_path?: string \| null, errors: AssetValidationIssue[] }` |
| `asset_cleanup_completed` | `AssetCleanupResult` |

### **14.3. Security rule**

- `ResolvedAsset.file_url` dùng cho frontend.
- Frontend không được load `file_path` trực tiếp.
- `original source path` không được expose sau import.

---

## **15. Desktop Awareness Commands**

### **15.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `awareness_get_snapshot` | `{}` | `AwarenessSnapshot` |
| `awareness_get_sanitized_context` | `{}` | `SanitizedDesktopContext \| null` |
| `awareness_get_current_mode` | `{}` | `AppMode` |
| `awareness_set_private_mode` | `{ enabled: boolean }` | `void` |
| `awareness_update_privacy` | `PrivacySettings` | `void` |
| `awareness_dump_debug` | `{}` | `AwarenessDebugDump` |
| `awareness_list_monitors` | `{}` | `MonitorInfo[]` |

### **15.2. Types**

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
```

### **15.3. Events**

| **Event** | **Payload** |
|---|---|
| `awareness_mode_changed` | `{ from: AppMode, to: AppMode, at: string }` |
| `awareness_idle_started` | `{ at: string }` |
| `awareness_idle_ended` | `{ idle_duration_seconds: number, at: string }` |
| `awareness_fullscreen_entered` | `{ category: AppCategory, at: string }` |
| `awareness_fullscreen_exited` | `{ at: string }` |
| `awareness_session_milestone` | `{ category: AppCategory, duration_minutes: number, at: string }` |
| `awareness_private_mode_toggled` | `{ enabled: boolean, at: string }` |

### **15.4. Privacy rule**

`awareness_dump_debug` không được chứa:

```text
- window title
- PID
- process path
- command line
```

---

## **16. Overlay Window Commands**

### **16.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `overlay_show` | `{}` | `void` |
| `overlay_hide` | `{}` | `void` |
| `overlay_toggle` | `{}` | `void` |
| `overlay_get_state` | `{}` | `OverlayWindowState` |
| `overlay_get_position` | `{}` | `LogicalPosition` |
| `overlay_get_size` | `{}` | `LogicalSize` |
| `overlay_move_to` | `{ position: LogicalPosition }` | `void` |
| `overlay_resize` | `{ size: LogicalSize }` | `void` |
| `overlay_set_scale` | `{ scale: number }` | `void` |
| `overlay_set_anchor` | `{ anchor: AnchorMode }` | `void` |
| `overlay_set_click_through` | `{ enabled: boolean }` | `void` |
| `overlay_set_topmost` | `{ enabled: boolean }` | `void` |
| `overlay_drag_end` | `{}` | `void` |
| `overlay_show_bubble` | `BubbleContent` | `void` |
| `overlay_hide_bubble` | `{}` | `void` |
| `overlay_show_chat_panel` | `{}` | `void` |
| `overlay_hide_chat_panel` | `{}` | `void` |
| `overlay_list_monitors` | `{}` | `MonitorInfo[]` |

### **16.2. Events**

| **Event** | **Payload** |
|---|---|
| `overlay_shown` | `{}` |
| `overlay_hidden` | `{ reason?: string \| null }` |
| `overlay_moved` | `{ position: LogicalPosition }` |
| `overlay_resized` | `{ size: LogicalSize }` |
| `overlay_anchor_changed` | `{ anchor: AnchorMode }` |
| `overlay_dpi_changed` | `{ scale: number }` |
| `overlay_monitor_changed` | `{ monitor_id: string }` |
| `overlay_click_through_changed` | `{ enabled: boolean }` |
| `overlay_bubble_shown` | `BubbleContent` |
| `overlay_bubble_hidden` | `{}` |

### **16.3. Types**

```typescript
export type AnchorMode =
  | "floating"
  | "taskbar_left"
  | "taskbar_right"
  | "taskbar_center"
  | "bottom_left"
  | "bottom_right"
  | "top_left"
  | "top_right"
  | "pinned_to_app";

export interface LogicalPosition {
  x: number;
  y: number;
}

export interface LogicalSize {
  width: number;
  height: number;
}

export interface BubbleContent {
  message: string;
  duration_ms: number;
  emotion?: string | null;
}
```

---

## **17. Privacy Commands**

### **17.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `privacy_get_settings` | `{}` | `PrivacySettings` |
| `privacy_update_settings` | `PrivacySettingsPatch` | `PrivacySettings` |
| `privacy_reset_settings` | `{}` | `PrivacySettings` |
| `privacy_get_permission` | `{ permission: PrivacyPermission }` | `PermissionState` |
| `privacy_set_permission` | `{ permission: PrivacyPermission, state: PermissionState }` | `void` |
| `privacy_set_private_mode` | `{ enabled: boolean }` | `void` |
| `privacy_set_quiet_mode` | `{ enabled: boolean }` | `void` |
| `privacy_set_streamer_mode` | `{ enabled: boolean }` | `void` |
| `privacy_set_restricted_mode` | `{ enabled: boolean }` | `void` |
| `privacy_classify_text` | `{ text: string }` | `SensitivityLevel` |
| `privacy_sanitize_text` | `{ text: string }` | `string` |
| `privacy_export_data` | `{ scope: ExportScope }` | `PrivacyExportPackage` |
| `privacy_delete_data` | `{ scope: DeleteScope, confirmation: DeleteConfirmation }` | `DeleteResult` |
| `privacy_clear_logs` | `{}` | `void` |

### **17.2. Events**

| **Event** | **Payload** |
|---|---|
| `privacy_permission_changed` | `{ permission, old_state, new_state }` |
| `privacy_mode_changed` | `{ mode: PrivacyMode, enabled: boolean }` |
| `privacy_sensitive_data_detected` | `{ sensitivity: SensitivityLevel, action: string }` |
| `privacy_data_exported` | `{ scope: ExportScope }` |
| `privacy_data_deleted` | `{ scope: DeleteScope }` |

### **17.3. Security rule**

Không command nào được trả:

```text
- decrypted API key
- raw prompt
- raw desktop data
- secret memory đã bị reject
```

---

## **18. Behavior Commands**

### **18.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `behavior_submit_trigger` | `BehaviorTrigger` | `BehaviorResult` |
| `behavior_user_chat` | `{ message: string }` | `BehaviorResult` |
| `behavior_quick_action` | `{ action_id: string }` | `BehaviorResult` |
| `behavior_user_pet` | `{}` | `BehaviorResult` |
| `behavior_get_status` | `{}` | `BehaviorStatus` |
| `behavior_get_budget_today` | `{}` | `BehaviorDailyBudget` |
| `behavior_get_cooldowns` | `{}` | `CooldownSnapshot[]` |
| `behavior_schedule_event` | `ScheduledBehaviorEvent` | `void` |
| `behavior_cancel_event` | `{ event_id: string }` | `void` |
| `behavior_list_rules` | `{}` | `UserRule[]` |
| `behavior_upsert_rule` | `UserRule` | `void` |
| `behavior_delete_rule` | `{ rule_id: string }` | `void` |
| `behavior_debug_last_decisions` | `{ limit: number }` | `BehaviorDecision[]` |

### **18.2. Events**

| **Event** | **Payload** |
|---|---|
| `behavior_trigger_received` | `BehaviorTrigger` |
| `behavior_decision_made` | `BehaviorDecision` |
| `behavior_action_routed` | `RoutedActionResult` |
| `behavior_blocked` | `{ trigger_id: string, reason: string }` |
| `behavior_budget_updated` | `BehaviorDailyBudget` |
| `behavior_cooldown_updated` | `CooldownSnapshot` |
| `behavior_rule_changed` | `{ rule_id: string }` |

---

## **19. Settings Commands**

### **19.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `settings_get_all` | `{}` | `AppSettings` |
| `settings_get_section` | `{ section: SettingsSection }` | `unknown` |
| `settings_update_section` | `{ section: SettingsSection, patch: unknown }` | `AppSettings` |
| `settings_reset_section` | `{ section: SettingsSection }` | `AppSettings` |
| `settings_reset_all` | `{}` | `AppSettings` |
| `settings_export` | `{}` | `SettingsExport` |
| `settings_import` | `SettingsExport` | `ImportResult` |

### **19.2. Types**

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
  general: unknown;
  ai: unknown;
  privacy: PrivacySettings;
  overlay: unknown;
  behavior: unknown;
  animation: unknown;
  assets: unknown;
  hotkeys: unknown;
  developer: unknown;
  updated_at: string;
}
```

### **19.3. Events**

| **Event** | **Payload** |
|---|---|
| `settings_updated` | `{ section: SettingsSection }` |
| `settings_reset` | `{ section?: SettingsSection \| null }` |
| `settings_import_completed` | `ImportResult` |

---

## **20. Hotkey Commands**

### **20.1. Commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `hotkey_list` | `{}` | `HotkeyBinding[]` |
| `hotkey_register` | `HotkeyBinding` | `void` |
| `hotkey_unregister` | `{ hotkey_id: string }` | `void` |
| `hotkey_update` | `HotkeyBinding` | `void` |
| `hotkey_reset_defaults` | `{}` | `HotkeyBinding[]` |
| `hotkey_check_conflict` | `{ accelerator: string }` | `HotkeyConflictResult` |

### **20.2. Types**

```typescript
export interface HotkeyBinding {
  hotkey_id: string;
  action: string;
  accelerator: string;
  enabled: boolean;
  scope: "global" | "overlay" | "chat";
}

export interface HotkeyConflictResult {
  has_conflict: boolean;
  conflicting_hotkey_id?: string | null;
  reason?: string | null;
}
```

### **20.3. Events**

| **Event** | **Payload** |
|---|---|
| `hotkey_triggered` | `{ hotkey_id: string, action: string }` |
| `hotkey_registered` | `HotkeyBinding` |
| `hotkey_unregistered` | `{ hotkey_id: string }` |
| `hotkey_conflict_detected` | `HotkeyConflictResult` |

---

## **21. Event Categories**

### **21.1. Event delivery rule**

Events là **best-effort**:

```text
- Event có thể bị miss nếu frontend chưa listen.
- Frontend phải gọi command query để lấy state hiện tại khi mount.
- Event dùng để incremental update, không phải source of truth.
```

### **21.2. Event bridge rule**

Mỗi subsystem event bus cần bridge sang Tauri event:

```rust
pub async fn bridge_state_events(
    app: AppHandle,
    mut rx: broadcast::Receiver<stateevent>,
) {
    while let Ok(event) = rx.recv().await {
        match event {
            StateEvent::StateChanged { character_id, applied_delta, new_state } => {
                let _ = app.emit("state_changed", StateChangedPayload {
                    character_id,
                    applied_delta,
                    new_state,
                });
            }
            _ => {}
        }
    }
}
```

### **21.3. Event throttling**

| **Event type** | **Throttle** |
|---|---|
| `overlay_moved` | 50ms |
| `overlay_click_through_changed` | Only on change |
| `animation_state_changed` | 100ms |
| `awareness_*` | On change only |
| `state_changed` | On mutation only |
| `behavior_decision_made` | No throttle |
| `ai_lifecycle_changed` | On transition only |

---

## **22. Frontend IPC Client**

### **22.1. Typed invoke wrapper**

```typescript
import { invoke } from "@tauri-apps/api/core";

export async function ipcInvoke<tpayload, tresult="">(
  command: string,
  payload: TPayload,
): Promise<tresult> {
  try {
    return await invoke<tresult>(command, payload as Record<string, unknown="">);
  } catch (error) {
    throw normalizeIpcError(error);
  }
}
```

### **22.2. Command-specific wrapper**

```typescript
export const aiIpc = {
  sendChat(message: string) {
    return ipcInvoke<{ message: string }, AIInteractionResult>(
      "ai_send_chat",
      { message },
    );
  },

  getStatus() {
    return ipcInvoke<record<string, never="">, AIStatus>(
      "ai_get_status",
      {},
    );
  },
};
```

### **22.3. Typed event listener**

```typescript
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export async function ipcListen<tpayload>(
  eventName: string,
  handler: (payload: TPayload) => void,
): Promise<unlistenfn> {
  return listen<tpayload>(eventName, (event) => {
    handler(event.payload);
  });
}
```

### **22.4. Store hydration pattern**

```typescript
export async function hydrateAppStores() {
  await Promise.all([
    useCharacterStore.getState().refresh(),
    useStateStore.getState().refreshActive(),
    useAwarenessStore.getState().refresh(),
    useOverlayStore.getState().refresh(),
    usePrivacyStore.getState().refresh(),
    useBehaviorStore.getState().refreshStatus(),
  ]);
}
```

---

## **23. Backend Command Registration**

### **23.1. Registration layout**

```rust
pub fn register_ipc_handlers(builder: tauri::Builder<tauri::wry>) -> tauri::Builder<tauri::wry> {
    builder.invoke_handler(tauri::generate_handler![
        // App
        app_get_info,
        app_get_status,
        app_open_user_data_folder,
        app_restart,
        app_quit,
        app_get_diagnostics,

        // Character
        character_list,
        character_get_active,
        character_get_by_id,
        character_create,
        character_update,
        character_delete,
        character_switch_active,
        character_set_model_asset,

        // State
        state_get_active,
        state_get_by_id,
        state_get_derived,
        state_force_flush,

        // AI
        ai_send_chat,
        ai_quick_action,
        ai_retry_last,
        ai_cancel_current,
        ai_get_status,
        ai_get_usage_today,
        ai_test_connection,
        ai_update_config,
        ai_get_config_safe,

        // Asset
        asset_import_model,
        asset_import_animation,
        asset_get,
        asset_list,
        asset_resolve,

        // Overlay
        overlay_show,
        overlay_hide,
        overlay_toggle,
        overlay_get_state,
        overlay_set_click_through,

        // Privacy
        privacy_get_settings,
        privacy_set_private_mode,
        privacy_set_quiet_mode,

        // Behavior
        behavior_user_chat,
        behavior_quick_action,
        behavior_user_pet,
        behavior_get_status,
    ])
}
```

### **23.2. Command handler rule**

Mỗi command handler chỉ làm:

```text
1. Validate input.
2. Call manager.
3. Map domain error to IpcError.
4. Return DTO.
```

Không nhồi business logic lớn vào `ipc/*_commands.rs`.

---

## **24. Versioning Strategy**

### **24.1. Contract version**

```typescript
export const IPC_CONTRACT_VERSION = 1;
```

`app_get_info` trả:

```json
{
  "ipc_contract_version": 1
}
```

### **24.2. Breaking change rules**

Breaking change gồm:

```text
- Đổi tên command.
- Xóa command.
- Đổi required field.
- Đổi meaning của field.
- Đổi event name.
- Đổi enum value đã public.
```

### **24.3. Non-breaking change**

Cho phép:

```text
- Thêm optional field.
- Thêm command mới.
- Thêm event mới.
- Thêm enum value nếu frontend handle fallback.
```

### **24.4. Deprecation policy**

```text
1. Giữ command cũ ít nhất 1 minor version.
2. Thêm command mới.
3. Command cũ log warning.
4. Sau migration mới remove.
```

### **24.5. DTO schema version**

Các DTO lớn nên có `schema_version`.

```typescript
export interface OverlayWindowState {
  schema_version: number;
  anchor: AnchorMode;
  position: LogicalPosition;
  size: LogicalSize;
}
```

---

## **25. Payload Limits**

### **25.1. Default limits**

| **Payload** | **Limit** |
|---|---|
| Generic command payload | 1MB |
| Chat message | 16KB |
| AI response | 64KB |
| Memory content | 4KB |
| Asset thumbnail bytes | 1MB |
| Settings export/import | 10MB |
| Privacy export all | 100MB |
| Event payload | 256KB |

### **25.2. Large data rule**

Không truyền file lớn qua IPC nếu có thể truyền path đã được user chọn và backend tự xử lý.

Ví dụ:

```text
asset_import_model:
  frontend sends source_path
  backend copies file

Không:
  frontend reads 100MB VRM bytes and sends IPC
```

### **25.3. Thumbnail exception**

Thumbnail có thể truyền bytes vì nhỏ:

```text
256x256 WebP < 256KB
Limit hard: 1MB
```

### **25.4. Validation helper**

```rust
pub fn validate_text_len(value: &str, max: usize, field: &str) -> IpcResult<()> {
    if value.len() > max {
        return Err(IpcError::invalid_payload(format!(
            "{} exceeds max length {}",
            field, max
        )));
    }
    Ok(())
}
```

---

## **26. Security & Privacy Rules**

### **26.1. Forbidden over IPC**

Không bao giờ expose:

```text
- API key plaintext
- raw window title
- PID
- process path
- command line
- clipboard
- screenshot
- raw prompt unless debug enabled and redacted
- password/token/private key
```

### **26.2. Commands requiring privacy check**

| **Command** | **Required check** |
|---|---|
| `ai_send_chat` | AIPrivacyGuard |
| `ai_quick_action` | AIPrivacyGuard |
| `memory_create` | MemoryPrivacyGuard |
| `memory_update` | MemoryPrivacyGuard |
| `awareness_get_sanitized_context` | PrivacyAwareSanitizer |
| `overlay_show_bubble` | Streamer/Private bubble policy |
| `privacy_export_data` | Export policy |
| `privacy_delete_data` | Confirmation policy |

### **26.3. File path rule**

Frontend có thể gửi path chỉ trong các command này:

```text
- asset_import_model
- asset_import_animation
- settings_import
- privacy_export_data destination nếu implement save dialog flow
```

Sau import, frontend phải dùng `asset_id`.

### **26.4. Event privacy**

Event payload phải sanitized như command response.

---

## **27. Testing Strategy**

### **27.1. Contract tests**

Mỗi command cần test:

```text
- payload valid
- payload invalid
- success response shape
- error response shape
- privacy blocked case nếu applicable
```

### **27.2. Type sync tests**

```text
- Generate JSON schema từ Rust DTO.
- Validate TypeScript sample payloads.
- Snapshot command/event index.
```

### **27.3. Frontend mock IPC**

```typescript
export interface IpcClient {
  invoke<tpayload, tresult="">(command: string, payload: TPayload): Promise<tresult>;
  listen<tpayload>(event: string, handler: (payload: TPayload) => void): Promise<() => void>;
}
```

### **27.4. Event tests**

```text
- Emit backend event.
- Verify frontend store updates.
- Verify missed event recovered by refresh command.
```

---

## **28. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       ├── ipc/
│       │   ├── mod.rs
│       │   ├── types.rs
│       │   ├── error.rs
│       │   ├── app_commands.rs
│       │   ├── character_commands.rs
│       │   ├── state_commands.rs
│       │   ├── memory_commands.rs
│       │   ├── ai_commands.rs
│       │   ├── animation_commands.rs
│       │   ├── asset_commands.rs
│       │   ├── awareness_commands.rs
│       │   ├── overlay_commands.rs
│       │   ├── privacy_commands.rs
│       │   ├── behavior_commands.rs
│       │   ├── settings_commands.rs
│       │   ├── hotkey_commands.rs
│       │   └── event_bridge.rs
│       │
│       └── core/
│           ├── character/
│           ├── state/
│           ├── memory/
│           ├── ai/
│           ├── animation/
│           ├── asset/
│           ├── awareness/
│           ├── overlay/
│           ├── privacy/
│           ├── behavior/
│           ├── settings/
│           └── hotkey/
│
├── src/
│   ├── shared/
│   │   ├── ipc/
│   │   │   ├── client.ts
│   │   │   ├── errors.ts
│   │   │   ├── events.ts
│   │   │   └── commands.ts
│   │   └── types/
│   │       ├── common.ts
│   │       ├── character.ts
│   │       ├── state.ts
│   │       ├── memory.ts
│   │       ├── ai.ts
│   │       ├── animation.ts
│   │       ├── asset.ts
│   │       ├── awareness.ts
│   │       ├── overlay.ts
│   │       ├── privacy.ts
│   │       ├── behavior.ts
│   │       ├── settings.ts
│   │       └── hotkey.ts
│   │
│   ├── overlay/
│   ├── settings/
│   ├── asset/
│   ├── behavior/
│   └── renderer/
│
└── docs/
    └── ipc-contract.md
```

---

## **29. Implementation Checklist**

### **29.1. P0 Core**

- [ ] Create `src-tauri/src/ipc/mod.rs`.
- [ ] Create `src-tauri/src/ipc/error.rs`.
- [ ] Define `IpcError`.
- [ ] Define `IpcResult<t>`.
- [ ] Implement error mapping from domain errors.
- [ ] Register commands in one `register_ipc_handlers`.
- [ ] Create frontend `ipcInvoke` wrapper.
- [ ] Create frontend `ipcListen` wrapper.

### **29.2. P0 Command Coverage**

- [ ] App commands.
- [ ] Character commands.
- [ ] State commands.
- [ ] AI commands.
- [ ] Asset commands.
- [ ] Awareness commands.
- [ ] Overlay commands.
- [ ] Privacy commands.
- [ ] Behavior commands.

### **29.3. P1 Command Coverage**

- [ ] Memory commands.
- [ ] Animation commands.
- [ ] Settings commands.
- [ ] Hotkey commands.

### **29.4. P0 Events**

- [ ] Implement event bridge.
- [ ] Bridge state events.
- [ ] Bridge AI events.
- [ ] Bridge overlay events.
- [ ] Bridge awareness events.
- [ ] Bridge privacy events.
- [ ] Bridge behavior events.
- [ ] Bridge asset events.

### **29.5. P1 Type Safety**

- [ ] Generate TypeScript types from Rust or maintain shared schema.
- [ ] Add JSON schema snapshots.
- [ ] Add contract tests for command payloads.
- [ ] Add frontend mock IPC client.

### **29.6. P1 Privacy**

- [ ] Audit all command responses for forbidden data.
- [ ] Audit all event payloads for forbidden data.
- [ ] Add test: API key never returned.
- [ ] Add test: raw window title never returned.
- [ ] Add test: asset original absolute path not exposed after import.

### **29.7. P2 Polish**

- [ ] IPC diagnostics panel.
- [ ] Command latency metrics.
- [ ] Event rate monitor.
- [ ] Auto-generate docs from command registry.
- [ ] Contract version compatibility check on frontend start.

---

## **30. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **IPC** | Inter-process communication giữa frontend WebView và Rust backend. |
| **Command** | Hàm frontend gọi qua `invoke`. |
| **Event** | Thông báo Rust emit sang frontend. |
| **DTO** | Data transfer object, struct dùng qua IPC. |
| **IpcError** | Error format chuẩn cho mọi command. |
| **Event Bridge** | Lớp chuyển subsystem event sang Tauri event. |
| **Contract Version** | Phiên bản schema IPC hiện tại. |
| **Payload Limit** | Giới hạn dung lượng dữ liệu qua IPC. |
| **Hydration** | Frontend query state hiện tại khi mount. |
| **Best-effort Event** | Event có thể bị miss, không phải source of truth. |

---

# **Phụ lục A: Full Command Index**

```text
app_get_info
app_get_status
app_open_user_data_folder
app_restart
app_quit
app_get_diagnostics

character_list
character_get_active
character_get_by_id
character_create
character_update
character_delete
character_switch_active
character_set_model_asset
character_export
character_import

state_get_active
state_get_by_id
state_get_derived
state_force_flush
state_export_all
state_import
state_debug_dump
state_reset_counters

memory_list
memory_get
memory_create
memory_update
memory_delete
memory_search
memory_list_pending
memory_approve_proposal
memory_reject_proposal
memory_merge
memory_export_all
memory_import

ai_send_chat
ai_quick_action
ai_retry_last
ai_cancel_current
ai_get_status
ai_get_usage_today
ai_test_connection
ai_update_config
ai_get_config_safe

animation_play
animation_stop
animation_set_idle
animation_get_state
animation_list_available
animation_validate_id
animation_reload_manifest

asset_import_model
asset_import_animation
asset_get
asset_list
asset_list_models
asset_list_animations
asset_resolve
asset_resolve_thumbnail
asset_rename
asset_replace
asset_rollback
asset_delete
asset_validate
asset_save_thumbnail
asset_cleanup_unused
asset_open_folder

awareness_get_snapshot
awareness_get_sanitized_context
awareness_get_current_mode
awareness_set_private_mode
awareness_update_privacy
awareness_dump_debug
awareness_list_monitors

overlay_show
overlay_hide
overlay_toggle
overlay_get_state
overlay_get_position
overlay_get_size
overlay_move_to
overlay_resize
overlay_set_scale
overlay_set_anchor
overlay_set_click_through
overlay_set_topmost
overlay_drag_end
overlay_show_bubble
overlay_hide_bubble
overlay_show_chat_panel
overlay_hide_chat_panel
overlay_list_monitors

privacy_get_settings
privacy_update_settings
privacy_reset_settings
privacy_get_permission
privacy_set_permission
privacy_set_private_mode
privacy_set_quiet_mode
privacy_set_streamer_mode
privacy_set_restricted_mode
privacy_classify_text
privacy_sanitize_text
privacy_export_data
privacy_delete_data
privacy_clear_logs

behavior_submit_trigger
behavior_user_chat
behavior_quick_action
behavior_user_pet
behavior_get_status
behavior_get_budget_today
behavior_get_cooldowns
behavior_schedule_event
behavior_cancel_event
behavior_list_rules
behavior_upsert_rule
behavior_delete_rule
behavior_debug_last_decisions

settings_get_all
settings_get_section
settings_update_section
settings_reset_section
settings_reset_all
settings_export
settings_import

hotkey_list
hotkey_register
hotkey_unregister
hotkey_update
hotkey_reset_defaults
hotkey_check_conflict
```

---

# **Phụ lục B: Full Event Index**

```text
app_started
app_shutdown_requested
app_diagnostics_updated

character_created
character_updated
character_deleted
character_active_changed
character_model_changed

state_changed
state_milestone
state_daily_reset
state_character_switched
state_import_completed

memory_created
memory_updated
memory_deleted
memory_proposal_created
memory_proposal_resolved
memory_import_completed

ai_lifecycle_changed
ai_response_started
ai_response_completed
ai_response_failed
ai_usage_updated
ai_budget_exceeded

animation_started
animation_completed
animation_interrupted
animation_state_changed
animation_manifest_reloaded

asset_imported
asset_updated
asset_deleted
asset_reload_requested
asset_validation_failed
asset_cleanup_completed

awareness_mode_changed
awareness_idle_started
awareness_idle_ended
awareness_fullscreen_entered
awareness_fullscreen_exited
awareness_session_milestone
awareness_private_mode_toggled

overlay_shown
overlay_hidden
overlay_moved
overlay_resized
overlay_anchor_changed
overlay_dpi_changed
overlay_monitor_changed
overlay_click_through_changed
overlay_bubble_shown
overlay_bubble_hidden

privacy_permission_changed
privacy_mode_changed
privacy_sensitive_data_detected
privacy_data_exported
privacy_data_deleted

behavior_trigger_received
behavior_decision_made
behavior_action_routed
behavior_blocked
behavior_budget_updated
behavior_cooldown_updated
behavior_rule_changed

settings_updated
settings_reset
settings_import_completed

hotkey_triggered
hotkey_registered
hotkey_unregistered
hotkey_conflict_detected
```

---

# **Phụ lục C: TypeScript IPC mẫu**

## **C.1. `client.ts`**

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { normalizeIpcError } from "./errors";

export async function ipcInvoke<tpayload, tresult="">(
  command: string,
  payload: TPayload,
): Promise<tresult> {
  try {
    return await invoke<tresult>(command, payload as Record<string, unknown="">);
  } catch (error) {
    throw normalizeIpcError(error);
  }
}

export async function ipcListen<tpayload>(
  eventName: string,
  handler: (payload: TPayload) => void,
): Promise<unlistenfn> {
  return listen<tpayload>(eventName, (event) => {
    handler(event.payload);
  });
}
```

## **C.2. `ai.ts` wrapper**

```typescript
import { ipcInvoke } from "../ipc/client";

export const aiIpc = {
  sendChat(message: string) {
    return ipcInvoke<{ message: string }, AIInteractionResult>(
      "ai_send_chat",
      { message },
    );
  },

  quickAction(action_id: string) {
    return ipcInvoke<{ action_id: string }, AIInteractionResult>(
      "ai_quick_action",
      { action_id },
    );
  },

  getStatus() {
    return ipcInvoke<record<string, never="">, AIStatus>(
      "ai_get_status",
      {},
    );
  },

  getUsageToday() {
    return ipcInvoke<record<string, never="">, AIUsageSummary>(
      "ai_get_usage_today",
      {},
    );
  },
};
```

## **C.3. `events.ts`**

```typescript
import { ipcListen } from "./client";

export async function setupGlobalEventListeners() {
  const unlisteners = await Promise.all([
    ipcListen("state_changed", (payload: StateChangedPayload) => {
      useStateStore.getState().applyChange(payload);
    }),

    ipcListen("ai_lifecycle_changed", (payload: AiLifecycleChangedPayload) => {
      useAiStore.getState().setLifecycle(payload.lifecycle);
    }),

    ipcListen("overlay_hidden", (payload: { reason?: string | null }) => {
      useOverlayStore.getState().setVisible(false);
    }),

    ipcListen("privacy_mode_changed", (payload: PrivacyModeChangedPayload) => {
      usePrivacyStore.getState().applyModeEvent(payload);
    }),
  ]);

  return () => {
    for (const unlisten of unlisteners) {
      unlisten();
    }
  };
}
```

---

**Tài liệu này là source of truth cho IPC Contract. Mọi command/event mới phải được thêm vào đây trước khi implement. Frontend chỉ gọi command đã định nghĩa, backend chỉ emit event đã định nghĩa, mọi payload phải typed, mọi lỗi phải dùng `IpcError`, mọi dữ liệu nhạy cảm phải được sanitize trước khi qua IPC.**