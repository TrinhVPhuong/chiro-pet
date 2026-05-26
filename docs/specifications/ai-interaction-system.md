# **Chiro-Pet AI Interaction System**

> Tài liệu thiết kế chính thức cho **AI Interaction System** của **Chiro-Pet**.  
> Hệ thống này định nghĩa cách app tương tác với AI OpenAI-compatible để tạo hội thoại, điều khiển hành vi nhân vật, đề xuất animation, cập nhật state, tạo memory operation và xử lý các hành động có kiểm soát.
>
> **Nguyên tắc lõi:** AI là lớp **ngôn ngữ, cá nhân hóa và đề xuất hành vi**. AI **không được toàn quyền điều khiển app**, không ghi database trực tiếp, không tự ý thay đổi state, không tự quyết định notification hay animation cuối cùng. Mọi output của AI đều đi qua **schema validation, policy guard, privacy guard, game logic guard và subsystem router**.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)  
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)  
3. [Vai trò của AI trong Chiro-Pet](#3-vai-trò-của-ai-trong-chiro-pet)  
4. [Kiến trúc tổng thể](#4-kiến-trúc-tổng-thể)  
5. [Interaction Types](#5-interaction-types)  
6. [AI Lifecycle](#6-ai-lifecycle)  
7. [Prompt System](#7-prompt-system)  
8. [Context Composer](#8-context-composer)  
9. [AI Request Contract](#9-ai-request-contract)  
10. [AI Response Schema](#10-ai-response-schema)  
11. [AI Operation System](#11-ai-operation-system)  
12. [State Mutation Flow](#12-state-mutation-flow)  
13. [Memory Operation Flow](#13-memory-operation-flow)  
14. [Animation & Expression Flow](#14-animation--expression-flow)  
15. [Proactivity & Interruption Control](#15-proactivity--interruption-control)  
16. [Validator Chain](#16-validator-chain)  
17. [Privacy & Context Sanitizer](#17-privacy--context-sanitizer)  
18. [Cost Control & Rate Limit](#18-cost-control--rate-limit)  
19. [Caching & Template Fallback](#19-caching--template-fallback)  
20. [Backend: AI Orchestrator](#20-backend-ai-orchestrator)  
21. [AI Provider Client](#21-ai-provider-client)  
22. [IPC Contract](#22-ipc-contract)  
23. [Frontend Interaction UI](#23-frontend-interaction-ui)  
24. [Logging & Audit](#24-logging--audit)  
25. [Error Handling](#25-error-handling)  
26. [File Structure](#26-file-structure)  
27. [Implementation Checklist](#27-implementation-checklist)  
28. [Glossary](#28-glossary)  
29. [Phụ lục A: Flow chuẩn một lượt chat](#phụ-lục-a-flow-chuẩn-một-lượt-chat)  
30. [Phụ lục B: Flow proactive check-in](#phụ-lục-b-flow-proactive-check-in)  
31. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

AI Interaction System của **Chiro-Pet** phải:

- Cho phép user nói chuyện tự nhiên với active character.
- Cho phép character phản hồi theo:
  - **personality riêng**
  - **state riêng**
  - **memory dùng chung**
  - **memory riêng của character**
  - **desktop context đã được sanitize**
- Đồng bộ AI lifecycle với animation:
  - user gửi message
  - character listening
  - AI thinking
  - character talking
  - fallback về idle hoặc mode state
- Cho phép AI đề xuất:
  - message trả lời
  - emotion
  - animation
  - expression
  - state delta
  - memory operations
  - next action
- Ngăn AI làm sai bằng:
  - schema validator
  - privacy guard
  - memory policy
  - state mutation guard
  - animation director
  - proactivity controller
- Tối ưu chi phí và latency khi dùng OpenAI-compatible proxy.
- Hỗ trợ fallback local khi AI lỗi hoặc hết budget.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- AI orchestration.
- Prompt composition.
- Context injection.
- AI response schema.
- AI operation routing.
- Validator chain.
- State, memory, animation, proactivity integration.
- Cost control, caching, fallback.
- IPC contract liên quan AI.

Tài liệu này không mô tả chi tiết:

- Character schema đầy đủ.
- Memory schema đầy đủ.
- Animation runtime đầy đủ.
- Desktop awareness implementation chi tiết.
- Shader hoặc render pipeline.

Các hệ thống đó được coi là subsystem độc lập, AI Interaction System chỉ gọi qua contract.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **AI đề xuất, app quyết định** | AI không có quyền ghi DB, đổi state, hiện notification hoặc play animation trực tiếp. |
| **2** | **Output phải có schema** | Mọi AI response phải là JSON hợp lệ theo schema. |
| **3** | **Context tối thiểu cần thiết** | Không gửi raw process name, window title, file path, PID hoặc dữ liệu nhạy cảm. |
| **4** | **Character-aware** | AI luôn phản hồi theo active character hiện tại. |
| **5** | **Memory-scoped** | AI chỉ được nhận shared memory và memory của active character. |
| **6** | **Interruption-aware** | AI không tự quyết định làm phiền user. ProactivityController quyết định. |
| **7** | **Budget-aware** | Mọi request đi qua cost tracker, rate limiter và cache policy. |
| **8** | **Recoverable** | Nếu AI lỗi, app vẫn hoạt động bằng template fallback. |
| **9** | **Auditable** | Mọi AI request, response, operation quan trọng phải có log/debug record. |

### **2.2. Anti-pattern cần tránh**

- ❌ Cho AI trả lời plain text tự do.
- ❌ Cho AI gọi SQLite hoặc filesystem trực tiếp.
- ❌ Gửi toàn bộ memory vào prompt.
- ❌ Gửi raw desktop data lên AI.
- ❌ Để AI tự tăng affinity không giới hạn.
- ❌ Để AI tự chọn notification khi user đang focus/meeting/gaming.
- ❌ Hardcode personality trong prompt builder.
- ❌ Không có fallback khi AI provider fail.
- ❌ Tin tuyệt đối vào `suggested_animation` từ AI.
- ❌ Không log memory/state mutation do AI đề xuất.

---

## **3. Vai trò của AI trong Chiro-Pet**

### **3.1. AI được phép làm gì**

AI được phép:

- Sinh lời thoại tự nhiên.
- Phân loại intent cơ bản từ user message.
- Đề xuất emotion.
- Đề xuất animation ID đã tồn tại trong manifest.
- Đề xuất expression đã tồn tại trong VRM/expression registry.
- Đề xuất memory operations.
- Đề xuất state deltas.
- Đề xuất next action ở mức logic.
- Đề xuất response priority.

### **3.2. AI không được phép làm gì**

AI không được phép:

- Ghi database trực tiếp.
- Xóa memory trực tiếp.
- Tăng affinity/trust vượt rule.
- Bỏ qua privacy mode.
- Tự đọc memory ngoài active character.
- Tự gọi OS action.
- Tự thao tác file.
- Tự hiện notification.
- Tự play animation.
- Tự thay đổi active character.
- Tự thay đổi settings.
- Tự gọi network ngoài AI provider.

### **3.3. Bảng phân quyền**

| **Hành động** | **AI** | **Subsystem quyết định cuối** |
|---|---|---|
| Sinh message | Được | AI Validator |
| Đề xuất emotion | Được | Emotion/State Guard |
| Đề xuất animation | Được | AnimationDirector |
| Đề xuất expression | Được | ExpressionValidator |
| Đề xuất memory create | Được | MemoryManager |
| Đề xuất memory patch | Được | MemoryManager + Approval |
| Đề xuất state delta | Được | StateMutationGuard |
| Đề xuất notification | Được | ProactivityController |
| Đề xuất next action | Được | BehaviorOrchestrator |
| Đổi character | Không | CharacterManager |
| Đọc raw window title | Không | PrivacyManager |
| Ghi file | Không | Không hỗ trợ |

---

## **4. Kiến trúc tổng thể**

```text
┌──────────────────────────────────────────────────────────────┐
│                         USER INPUT                            │
│  - Chat message                                                │
│  - Radial menu action                                          │
│  - Click / pet / drag                                          │
│  - Proactive trigger                                           │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                    AI ORCHESTRATOR                            │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Interaction Router                                      │  │
│  │ - chat / proactive / reaction / command                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Context Composer                                        │  │
│  │ - active character                                      │  │
│  │ - character state                                       │  │
│  │ - shared memories                                       │  │
│  │ - character memories                                    │  │
│  │ - sanitized desktop context                             │  │
│  │ - recent conversation                                   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Prompt Builder                                          │  │
│  │ - system prompt                                         │  │
│  │ - developer rules                                       │  │
│  │ - context block                                         │  │
│  │ - response schema instruction                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ AI Provider Client                                      │  │
│  │ - OpenAI-compatible chat completions                    │  │
│  │ - timeout                                               │  │
│  │ - retry                                                 │  │
│  │ - cost record                                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Response Validator                                      │  │
│  │ - JSON schema                                           │  │
│  │ - safety                                                │  │
│  │ - policy                                                │  │
│  │ - range clamp                                           │  │
│  │ - subsystem validation                                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Operation Router                                        │  │
│  │ - MemoryManager                                         │  │
│  │ - StateManager                                          │  │
│  │ - AnimationDirector                                     │  │
│  │ - ProactivityController                                 │  │
│  │ - EventScheduler                                        │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                       FRONTEND OVERLAY                        │
│  - Speech bubble                                               │
│  - Animation execution                                         │
│  - Expression display                                          │
│  - Chat UI                                                     │
│  - Pending memory approval                                     │
└──────────────────────────────────────────────────────────────┘
```

---

## **5. Interaction Types**

### **5.1. Các loại interaction**

| **Type** | **Nguồn** | **Có gọi AI?** | **Mô tả** |
|---|---|---|---|
| **direct_chat** | User chat | Có | User chủ động nhắn tin. |
| **quick_action** | Radial menu | Có hoặc template | Ví dụ: hỏi hôm nay thế nào, khen, trêu. |
| **pet_reaction** | User click/pet | Thường không | Dùng template/animation, AI chỉ khi cần. |
| **drag_reaction** | User kéo thả | Không | Animation/UI local. |
| **proactive_checkin** | Scheduler | Có nếu policy cho phép | Character chủ động hỏi thăm. |
| **focus_milestone** | Desktop awareness | Có hoặc template | Nhắc nghỉ sau 45/90 phút. |
| **mode_change** | Desktop awareness | Không hoặc template | Meeting/gaming/focus. |
| **memory_approval** | User duyệt memory | Không | Cập nhật DB. |
| **character_switch** | User switch | Không hoặc greeting template | Load character mới. |
| **error_fallback** | System | Không | Template local. |

### **5.2. Quy tắc gọi AI**

Chỉ gọi AI khi:

```text
- User chủ động chat.
- ProactivityController cho phép proactive message.
- Quick action cần response cá nhân hóa.
- Có context đủ an toàn để gửi.
- CostTracker còn budget.
- RateLimiter cho phép.
- PrivateMode policy cho phép.
```

Không gọi AI khi:

```text
- User đang drag character.
- Menu chỉ mở/đóng.
- Mode change đơn giản.
- Private mode chặn AI.
- Budget hết.
- AI provider đang circuit-open.
- Có template fallback đủ tốt.
```

---

## **6. AI Lifecycle**

### **6.1. Lifecycle chuẩn**

```text
Idle
  ↓ user/proactive trigger
PrepareContext
  ↓
ThinkingAnimation
  ↓
SendAIRequest
  ↓
ReceiveAIResponse
  ↓
ValidateResponse
  ↓
ApplyOperations
  ↓
ShowBubble + TalkingAnimation
  ↓
ScheduleNextAction
  ↓
Idle / ModeState
```

### **6.2. State machine**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AILifecycleState {
    Idle,
    PreparingContext,
    Thinking,
    WaitingProvider,
    Validating,
    ApplyingOperations,
    Responding,
    Failed,
    Fallback,
}
```

### **6.3. Transition rules**

```text
Idle → PreparingContext
  Khi interaction cần AI.

PreparingContext → Thinking
  Khi context build thành công.

Thinking → WaitingProvider
  Sau khi emit animation thinking.

WaitingProvider → Validating
  Khi nhận raw AI response.

Validating → ApplyingOperations
  Nếu schema hợp lệ.

Validating → Fallback
  Nếu response lỗi nhưng có template fallback.

ApplyingOperations → Responding
  Sau khi memory/state/animation suggestion được xử lý.

Responding → Idle
  Khi bubble/talking kết thúc.

Any → Failed
  Nếu lỗi không recover được.

Failed → Fallback
  Nếu có fallback.

Fallback → Responding
  Hiển thị template response.

Fallback → Idle
  Nếu không cần nói gì.
```

---

## **7. Prompt System**

### **7.1. Cấu trúc prompt**

Prompt được chia thành nhiều block, luôn theo thứ tự:

```text
1. Core behavior rules
2. Safety and privacy rules
3. Character identity
4. Character state
5. Shared user memories
6. Character-specific memories
7. Sanitized desktop context
8. Recent conversation
9. Current interaction
10. Output schema instruction
```

### **7.2. Core behavior rules**

```text
Bạn là character trong desktop companion app Chiro-Pet.
Bạn phải phản hồi như một nhân vật đang sống trên desktop.
Bạn trả lời ngắn, tự nhiên, đúng tính cách nhân vật.
Bạn không phải assistant kỹ thuật trừ khi user hỏi trực tiếp.
Bạn không bịa thông tin về user.
Bạn không nói rằng bạn đã đọc dữ liệu hệ thống thô.
Bạn chỉ dựa vào context được cung cấp.
Bạn phải output JSON hợp lệ theo schema.
```

### **7.3. Safety and privacy rules**

```text
Không yêu cầu hoặc lưu secrets như password, API key, token.
Không ghi nhớ dữ liệu nhạy cảm trừ khi user nói rõ muốn ghi nhớ.
Không nhắc lại thông tin nhạy cảm trong bubble.
Không suy đoán quá mức từ desktop context.
Nếu context không đủ chắc chắn, dùng lời nói mềm và không khẳng định.
```

### **7.4. Character identity block**

Ví dụ:

```text
# Character
Tên: Mira
Xưng hô: em gọi user là "anh", tự xưng "em"
Tính cách nổi bật: caring 0.9, warmth 0.8, playfulness 0.5, shyness 0.3
Phong cách nói: ngắn, ấm áp, ít emoji, không giảng đạo
Backstory tóm tắt: Một companion nhỏ sống trên desktop, thích quan sát và động viên user đúng lúc.
```

### **7.5. Character state block**

```text
# Current Character State
Mood: vui nhẹ
Energy: bình thường
Relationship: đang dần thân
Trust: trung bình
Interaction style today: tránh làm phiền nhiều
```

### **7.6. Memory block**

```text
# Shared User Memories
- User thích câu trả lời ngắn, đi thẳng vào vấn đề.
- User thường làm việc kỹ thuật vào buổi tối.
- User không thích bị nhắc nghỉ quá thường xuyên.

# Memories Between You And User
- User từng thích khi Mira trêu nhẹ lúc gaming.
- Mira và user có inside joke: "một trận nữa thôi".
```

### **7.7. Desktop context block**

Chỉ dùng dữ liệu đã sanitize:

```text
# Desktop Context
Mode: focus
Current app category: developer_tool
Session duration: khoảng 45 phút
Fullscreen: false
Time of day: night
Privacy level: normal
```

Không đưa:

```text
- raw process name
- window title
- file path
- PID
- command line
- clipboard
- screenshot
```

### **7.8. Output schema instruction**

```text
Bạn phải trả về JSON object duy nhất.
Không thêm markdown.
Không thêm text ngoài JSON.
Nếu không cần nói gì, message = "" và priority = "silent".
```

---

## **8. Context Composer**

### **8.1. Input context**

```rust
pub struct AIContextInput {
    pub interaction: InteractionInput,
    pub active_character_id: String,
    pub sanitized_desktop_context: Option<sanitizeddesktopcontext>,
    pub private_mode: bool,
    pub quiet_mode: bool,
    pub recent_conversation_limit: usize,
}
```

### **8.2. Output context**

```rust
pub struct AIContextBundle {
    pub character_profile: CharacterProfile,
    pub character_state: CharacterState,
    pub shared_memories: Vec<memory>,
    pub character_memories: Vec<memory>,
    pub desktop_context: Option<sanitizeddesktopcontext>,
    pub recent_conversation: Vec<chatmessage>,
    pub token_budget_report: TokenBudgetReport,
}
```

### **8.3. Context building flow**

```text
Interaction request
  ↓
Get active character
  ↓
Get character state
  ↓
Get sanitized desktop context
  ↓
Retrieve shared memories
  ↓
Retrieve active character memories
  ↓
Load recent conversation
  ↓
Apply token budget
  ↓
Compose AIContextBundle
  ↓
PromptBuilder builds messages
```

### **8.4. Token budget**

```rust
pub struct AITokenBudget {
    pub total_prompt_tokens: u32,
    pub core_rules_tokens: u32,
    pub character_tokens: u32,
    pub state_tokens: u32,
    pub shared_memory_tokens: u32,
    pub character_memory_tokens: u32,
    pub desktop_context_tokens: u32,
    pub recent_chat_tokens: u32,
    pub user_message_tokens: u32,
}
```

Default cho model nhỏ:

```text
total_prompt_tokens: 4000
core_rules_tokens: 500
character_tokens: 500
state_tokens: 200
shared_memory_tokens: 500
character_memory_tokens: 400
desktop_context_tokens: 200
recent_chat_tokens: 1000
user_message_tokens: 700
```

### **8.5. Context degradation**

Nếu vượt budget:

```text
1. Giảm recent chat.
2. Giảm character memories.
3. Giảm shared memories.
4. Compress backstory.
5. Chỉ giữ top traits.
6. Nếu vẫn vượt, fallback template.
```

---

## **9. AI Request Contract**

### **9.1. Rust request type**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIInteractionRequest {
    pub request_id: String,
    pub interaction_id: String,
    pub interaction_type: InteractionType,
    pub active_character_id: String,
    pub user_message: Option<string>,
    pub quick_action_id: Option<string>,
    pub trigger_context: Option<triggercontext>,
    pub created_at_ms: u64,
}
```

### **9.2. InteractionType**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InteractionType {
    DirectChat,
    QuickAction,
    ProactiveCheckin,
    FocusMilestone,
    DailyGreeting,
    EmotionalReaction,
    ErrorRecovery,
}
```

### **9.3. Chat completion request**

OpenAI-compatible endpoint:

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "..."
    },
    {
      "role": "user",
      "content": "..."
    }
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "response_format": {
    "type": "json_object"
  }
}
```

### **9.4. Request metadata**

Không gửi metadata này cho AI nếu không cần, nhưng lưu trong audit:

```rust
pub struct AIRequestMetadata {
    pub request_id: String,
    pub character_id: String,
    pub interaction_type: InteractionType,
    pub estimated_prompt_tokens: u32,
    pub max_completion_tokens: u32,
    pub cache_policy: CachePolicy,
    pub budget_snapshot: BudgetSnapshot,
}
```

---

## **10. AI Response Schema**

### **10.1. Schema tổng thể**

AI phải trả về JSON object:

```json
{
  "message": "string",
  "emotion": "neutral",
  "intent": "small_talk",
  "state_delta": {
    "mood": 0,
    "energy": 0,
    "affinity": 0,
    "trust": 0,
    "familiarity": 0
  },
  "suggested_animation": null,
  "suggested_expression": null,
  "interruption": {
    "should_notify": false,
    "level": 1,
    "priority": "low"
  },
  "memory_operations": [],
  "next_action": {
    "type": "wait",
    "delay_minutes": 30
  },
  "debug_reason": "optional short reason"
}
```

### **10.2. TypeScript type**

```typescript
export type AIEmotion =
  | "neutral"
  | "happy"
  | "shy"
  | "caring"
  | "playful"
  | "sleepy"
  | "worried"
  | "focused"
  | "proud"
  | "annoyed"
  | "surprised"
  | "sad";

export type AIIntent =
  | "small_talk"
  | "answer_question"
  | "emotional_support"
  | "encouragement"
  | "reminder"
  | "joke"
  | "acknowledge"
  | "boundary_update"
  | "preference_update"
  | "silent";

export type AIPriority =
  | "silent"
  | "low"
  | "normal"
  | "high";

export interface AIStateDelta {
  mood: number;        // -3..3
  energy: number;      // -3..3
  affinity: number;    // -2..2
  trust: number;       // -1..1
  familiarity: number; // -1..1
}

export interface AIInterruption {
  should_notify: boolean;
  level: number;       // 0..4
  priority: AIPriority;
}

export interface AINextAction {
  type:
    | "wait"
    | "schedule_checkin"
    | "suggest_user_action"
    | "none";
  delay_minutes?: number;
  reason?: string;
}

export interface AIMemoryOperation {
  operation: "create" | "patch" | "merge" | "delete_request" | "verify";
  scope?: "shared" | "character";
  type?: string;
  content?: string;
  memory_id?: string;
  patch?: Record<string, unknown="">;
  importance?: number;
  confidence?: number;
  reason?: string;
}

export interface AIInteractionResponse {
  message: string;
  emotion: AIEmotion;
  intent: AIIntent;
  state_delta: AIStateDelta;
  suggested_animation?: string | null;
  suggested_expression?: string | null;
  interruption: AIInterruption;
  memory_operations: AIMemoryOperation[];
  next_action: AINextAction;
  debug_reason?: string;
}
```

### **10.3. Rust type**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIInteractionResponse {
    pub message: String,
    pub emotion: AIEmotion,
    pub intent: AIIntent,
    pub state_delta: AIStateDelta,
    pub suggested_animation: Option<string>,
    pub suggested_expression: Option<string>,
    pub interruption: AIInterruption,
    pub memory_operations: Vec<aimemoryoperation>,
    pub next_action: AINextAction,
    pub debug_reason: Option<string>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIStateDelta {
    pub mood: i8,
    pub energy: i8,
    pub affinity: i8,
    pub trust: i8,
    pub familiarity: i8,
}
```

### **10.4. Field constraints**

| **Field** | **Constraint** |
|---|---|
| **message** | `0..180 chars` cho bubble thường |
| **emotion** | enum hợp lệ |
| **intent** | enum hợp lệ |
| **state_delta.mood** | `-3..3` |
| **state_delta.energy** | `-3..3` |
| **state_delta.affinity** | `-2..2` |
| **state_delta.trust** | `-1..1` |
| **state_delta.familiarity** | `-1..1` |
| **suggested_animation** | phải tồn tại trong animation manifest |
| **suggested_expression** | phải tồn tại trong expression registry |
| **interruption.level** | `0..4` |
| **memory_operations** | tối đa 3 operations mỗi response |
| **next_action.delay_minutes** | `5..1440` nếu có |

---

## **11. AI Operation System**

### **11.1. AI operation là gì**

AI operation là các đề xuất có cấu trúc từ AI, được router đến subsystem tương ứng.

```text
AI Response
  ├─ message → BubbleManager
  ├─ emotion → StateManager + ExpressionController
  ├─ state_delta → StateMutationGuard
  ├─ suggested_animation → AnimationDirector
  ├─ suggested_expression → ExpressionValidator
  ├─ memory_operations → MemoryManager
  ├─ interruption → ProactivityController
  └─ next_action → EventScheduler
```

### **11.2. Operation routing flow**

```text
Validated AI Response
       ↓
OperationRouter
       ↓
Parallel safe operations:
  - state mutation
  - memory proposal
  - animation command build
  - bubble render
  - next action scheduling
       ↓
Collect results
       ↓
Emit companion_response to frontend
```

### **11.3. Operation result**

```rust
pub struct AIOperationResult {
    pub state_result: Option<statemutationresult>,
    pub memory_results: Vec<memoryproposalresult>,
    pub animation_result: Option<playresult>,
    pub scheduled_action_result: Option<schedulerresult>,
    pub warnings: Vec<string>,
}
```

---

## **12. State Mutation Flow**

### **12.1. Nguyên tắc**

AI chỉ đề xuất delta. StateManager quyết định delta cuối.

```text
AI state_delta
  ↓
RangeValidator
  ↓
DailyCapGuard
  ↓
PersonalityModifier
  ↓
GameLogicGuard
  ↓
StateStore.patch
  ↓
Emit state_updated
```

### **12.2. State mutation request**

```rust
pub struct StateMutationRequest {
    pub character_id: String,
    pub source: StateMutationSource,
    pub proposed_delta: AIStateDelta,
    pub interaction_type: InteractionType,
    pub reason: Option<string>,
}
```

### **12.3. Guard rules**

| **Rule** | **Mô tả** |
|---|---|
| **Clamp range** | Delta vượt range bị clamp. |
| **Daily affinity cap** | Affinity không tăng quá giới hạn mỗi ngày. |
| **Negative floor** | Một interaction không làm giảm trust quá mạnh. |
| **Private mode** | Không update relationship state nếu private mode bật. |
| **Silent response** | Nếu message silent, state delta thường về 0. |
| **Repeated event decay** | Cùng loại proactive lặp lại thì delta giảm. |

### **12.4. Pseudocode**

```rust
pub async fn apply_ai_state_delta(
    &self,
    req: StateMutationRequest,
) -> Result<statemutationresult> {
    let mut delta = req.proposed_delta;

    delta.mood = delta.mood.clamp(-3, 3);
    delta.energy = delta.energy.clamp(-3, 3);
    delta.affinity = delta.affinity.clamp(-2, 2);
    delta.trust = delta.trust.clamp(-1, 1);
    delta.familiarity = delta.familiarity.clamp(-1, 1);

    if self.private_mode.is_enabled() {
        delta.affinity = 0;
        delta.trust = 0;
        delta.familiarity = 0;
    }

    delta.affinity = self.daily_cap_guard.clamp_affinity(
        req.character_id.as_str(),
        delta.affinity,
    ).await?;

    let new_state = self.store.patch_character_state(
        req.character_id,
        delta,
    ).await?;

    Ok(StateMutationResult {
        applied_delta: delta,
        new_state,
    })
}
```

---

## **13. Memory Operation Flow**

### **13.1. Input từ AI**

```json
{
  "operation": "create",
  "scope": "shared",
  "type": "communication_style",
  "content": "User thích câu trả lời ngắn, trực tiếp.",
  "importance": 4,
  "confidence": 0.95,
  "reason": "User explicitly asked for concise direct answers."
}
```

### **13.2. Flow xử lý**

```text
AI memory_operations[]
  ↓
Limit max 3 operations
  ↓
For each operation:
  ↓
Convert to MemoryOperationCandidate
  ↓
Attach active_character_id if scope=character
  ↓
MemoryManager.propose_operation
  ↓
Validator + Policy
  ↓
Saved / Pending / Merged / Patched / Rejected
  ↓
Audit
```

### **13.3. Quy tắc bắt buộc**

```text
- scope=character thì character_id luôn là active_character_id.
- AI không được chỉ định character_id khác.
- delete_request luôn thành pending candidate.
- sensitive memory cần approval.
- content tối đa 500 chars.
- không lưu secret/password/token.
```

### **13.4. Pseudocode**

```rust
pub async fn handle_memory_operations(
    &self,
    ops: Vec<aimemoryoperation>,
    ctx: &AIExecutionContext,
) -> Result<vec<memoryproposalresult>> {
    let mut results = Vec::new();

    for op in ops.into_iter().take(3) {
        let candidate = MemoryOperationCandidate::from_ai(
            op,
            ctx.active_character_id.clone(),
            ctx.source_message_id.clone(),
        )?;

        let result = self.memory_manager
            .propose_operation(candidate, ctx.memory_context())
            .await?;

        results.push(result);
    }

    Ok(results)
}
```

---

## **14. Animation & Expression Flow**

### **14.1. AI animation suggestion**

AI có thể trả:

```json
{
  "suggested_animation": "talking_happy",
  "suggested_expression": "happy"
}
```

### **14.2. Flow xử lý**

```text
AI suggested_animation
  ↓
Check manifest exists
  ↓
Check expected state = Talking hoặc state phù hợp intent
  ↓
Build AnimationCommand
  ↓
AnimationDirector.play()
  ↓
Priority/interrupt policy
  ↓
Emit animation_command
```

### **14.3. Talking animation command**

```rust
pub fn build_talking_command(
    response: &AIInteractionResponse,
    ctx: &AIExecutionContext,
) -> AnimationCommand {
    AnimationCommand {
        command_id: Uuid::new_v4().to_string(),
        source: AnimationSource::Ai,
        timestamp_ms: now_ms(),
        state: AnimationState::Talking,
        animation_id: response.suggested_animation.clone(),
        expression: response.suggested_expression.clone(),
        loop_anim: Some(false),
        play_once: Some(false),
        crossfade_ms: Some(200),
        duration_ms: Some(estimate_talking_duration_ms(&response.message)),
        priority: 60,
        context_id: Some(ctx.ai_session_id.clone()),
        interrupt_policy: Some(InterruptPolicy::AllowHigher),
        fallback: Some(FallbackMode::Idle),
        section: None,
    }
}
```

### **14.4. Expression validation**

```rust
pub fn validate_expression(
    suggested: Option<&str>,
    registry: &ExpressionRegistry,
) -> Option<string> {
    let name = suggested?;
    if registry.has(name) {
        Some(name.to_string())
    } else {
        None
    }
}
```

### **14.5. Message rỗng**

Nếu AI response:

```json
{
  "message": "",
  "interruption": {
    "priority": "silent"
  }
}
```

Thì:

```text
- Không show bubble.
- Không talking animation.
- Có thể apply state_delta nếu hợp lệ.
- Có thể save memory operation nếu hợp lệ.
- Fallback về idle/mode state.
```

---

## **15. Proactivity & Interruption Control**

### **15.1. Nguyên tắc**

AI có thể gợi ý notification, nhưng không quyết định cuối.

```text
AI interruption suggestion
  ↓
ProactivityController
  ↓
Mode policy
  ↓
Cooldown
  ↓
Daily budget
  ↓
Private/quiet mode
  ↓
Decision: silent / ambient / bubble / notification
```

### **15.2. Interruption level**

| **Level** | **Ý nghĩa** | **Ví dụ** |
|---|---|---|
| **0** | Silent | Update state/memory không nói gì. |
| **1** | Ambient bubble | Bubble nhỏ, không notification. |
| **2** | Soft bubble | Hiện bubble nếu không focus. |
| **3** | Notification nhẹ | Chỉ khi user cho phép. |
| **4** | Urgent | Hạn chế dùng, gần như không cho AI tự chọn. |

### **15.3. Mode policy**

| **Mode** | **Cho bubble?** | **Cho notification?** | **Ghi chú** |
|---|---|---|---|
| **Normal** | Có | Có nếu level >= 3 |
| **Focus** | Hạn chế | Không, trừ user cho phép |
| **Gaming** | Rất hạn chế | Không |
| **Meeting** | Không | Không |
| **Watching** | Hạn chế | Không |
| **Private** | Không | Không |
| **Quiet** | Không hoặc rất ít | Không |

### **15.4. Decision pseudocode**

```rust
pub fn decide_interruption(
    &self,
    ai: &AIInterruption,
    mode: AppMode,
    settings: &BehaviorSettings,
) -> InterruptionDecision {
    if settings.private_mode || settings.quiet_mode {
        return InterruptionDecision::Silent;
    }

    if matches!(mode, AppMode::Meeting | AppMode::Gaming) {
        return InterruptionDecision::Silent;
    }

    if !self.cooldown_allows() {
        return InterruptionDecision::Silent;
    }

    if !self.daily_budget_allows() {
        return InterruptionDecision::Silent;
    }

    match ai.level {
        0 => InterruptionDecision::Silent,
        1 => InterruptionDecision::AmbientBubble,
        2 => {
            if mode == AppMode::Focus {
                InterruptionDecision::Silent
            } else {
                InterruptionDecision::SoftBubble
            }
        }
        3 => {
            if settings.os_notifications_enabled {
                InterruptionDecision::Notification
            } else {
                InterruptionDecision::SoftBubble
            }
        }
        _ => InterruptionDecision::SoftBubble,
    }
}
```

---

## **16. Validator Chain**

### **16.1. Chain tổng thể**

```text
Raw AI response
  ↓
JSON parse validator
  ↓
Schema validator
  ↓
Message length validator
  ↓
Enum validator
  ↓
Range validator
  ↓
Safety validator
  ↓
Privacy validator
  ↓
Animation suggestion validator
  ↓
Expression suggestion validator
  ↓
Memory operation validator
  ↓
State delta guard
  ↓
Policy guard
  ↓
Accepted / Modified / Rejected / Fallback
```

### **16.2. Validation result**

```rust
pub enum AIValidationResult {
    Accepted(AIInteractionResponse),
    Modified {
        response: AIInteractionResponse,
        warnings: Vec<string>,
    },
    Rejected {
        reason: String,
    },
}
```

### **16.3. Auto-fix rules**

Có thể tự sửa:

| **Lỗi** | **Auto-fix** |
|---|---|
| Message quá dài | Cắt hoặc chunk |
| Delta vượt range | Clamp |
| Animation không tồn tại | Set null |
| Expression không tồn tại | Set null |
| Too many memory ops | Take first 3 |
| priority invalid | Set low |
| delay_minutes quá thấp | Clamp >= 5 |
| delay_minutes quá cao | Clamp <= 1440 |

Không tự sửa, phải reject/fallback:

| **Lỗi** | **Hành vi** |
|---|---|
| JSON invalid | Retry 1 lần hoặc fallback |
| Missing required fields nhiều | Fallback |
| Message chứa secret | Reject message |
| Memory op chứa password/token | Reject op |
| Response cố bypass policy | Reject |
| Không parse được schema | Fallback |

### **16.4. Pseudocode**

```rust
pub fn validate_ai_response(
    raw: &str,
    ctx: &AIValidationContext,
) -> AIValidationResult {
    let parsed = match serde_json::from_str::<aiinteractionresponse>(raw) {
        Ok(v) => v,
        Err(e) => {
            return AIValidationResult::Rejected {
                reason: format!("invalid_json: {}", e),
            };
        }
    };

    let mut response = parsed;
    let mut warnings = Vec::new();

    if response.message.chars().count() > 180 {
        response.message = truncate_smart(&response.message, 180);
        warnings.push("message_truncated".into());
    }

    response.state_delta.clamp_in_place();

    if let Some(anim) = &response.suggested_animation {
        if !ctx.animation_manifest.has(anim) {
            response.suggested_animation = None;
            warnings.push("invalid_animation_removed".into());
        }
    }

    if response.memory_operations.len() > 3 {
        response.memory_operations.truncate(3);
        warnings.push("memory_operations_truncated".into());
    }

    if contains_secret_like_text(&response.message) {
        return AIValidationResult::Rejected {
            reason: "secret_like_content".into(),
        };
    }

    if warnings.is_empty() {
        AIValidationResult::Accepted(response)
    } else {
        AIValidationResult::Modified { response, warnings }
    }
}
```

---

## **17. Privacy & Context Sanitizer**

### **17.1. Raw desktop context**

Ví dụ raw internal context:

```json
{
  "foreground_process": "Code.exe",
  "window_title": "payment_api_secret_refactor.ts - VS Code",
  "pid": 1234,
  "path": "C:/Users/Phuong/projects/client/payment_api_secret_refactor.ts",
  "duration_seconds": 2700,
  "fullscreen": false
}
```

### **17.2. Sanitized context gửi AI**

```json
{
  "app_category": "developer_tool",
  "session_duration_minutes": 45,
  "is_fullscreen": false,
  "mode": "focus",
  "time_of_day": "night",
  "privacy_level": "normal"
}
```

### **17.3. Sanitizer rules**

| **Raw field** | **Gửi AI?** | **Thay thế** |
|---|---|---|
| Process name | Không mặc định | app_category |
| Window title | Không | Không gửi |
| File path | Không | Không gửi |
| PID | Không | Không gửi |
| Command line | Không | Không gửi |
| Duration exact | Không | Rounded 5 minutes |
| Fullscreen | Có | Boolean |
| App category | Có | developer_tool/game/browser... |
| Clipboard | Không | Không hỗ trợ |
| Screenshot | Không | Không hỗ trợ |

### **17.4. Private mode**

Khi private mode bật:

```text
- Không gửi desktop context.
- Không ghi memory.
- Không patch state relationship.
- Không proactive AI.
- Direct chat có thể dùng AI nếu user bật allow_ai_in_private_mode.
```

Default:

```text
allow_ai_in_private_mode = false
memory_read_in_private_mode = false
memory_write_in_private_mode = false
```

---

## **18. Cost Control & Rate Limit**

### **18.1. Cost tracker**

```rust
pub struct AICostTracker {
    pub daily_calls: u32,
    pub daily_prompt_tokens: u32,
    pub daily_completion_tokens: u32,
    pub daily_estimated_cost_cents: u32,
    pub daily_limit_cents: u32,
    pub reset_at: DateTime<utc>,
}
```

### **18.2. Default limits**

```text
daily_limit_cents: 50
max_calls_per_minute: 6
max_calls_per_hour: 60
max_prompt_tokens_per_request: 4000
max_completion_tokens_per_request: 500
```

### **18.3. Rate limiter**

```rust
pub struct AIRateLimiter {
    pub per_minute: TokenBucket,
    pub per_hour: TokenBucket,
    pub concurrent_requests: Semaphore,
}
```

Default:

```text
concurrent_requests = 1
per_minute = 6
per_hour = 60
```

Vì chỉ có 1 active character, concurrent AI request nên giữ **1** để tránh state conflict.

### **18.4. Budget decision**

```rust
pub fn can_send_ai_request(
    cost: &AICostTracker,
    limiter: &AIRateLimiter,
    req: &AIInteractionRequest,
) -> BudgetDecision {
    if cost.daily_estimated_cost_cents >= cost.daily_limit_cents {
        return BudgetDecision::DenyUseFallback("daily_budget_exceeded".into());
    }

    if !limiter.allow_now() {
        return BudgetDecision::DenyUseFallback("rate_limited".into());
    }

    BudgetDecision::Allow
}
```

---

## **19. Caching & Template Fallback**

### **19.1. Cache policy**

| **Interaction** | **Cache?** | **Lý do** |
|---|---|---|
| direct_chat | Không | Cần fresh response |
| quick_action generic | Có | Ít thay đổi |
| daily_greeting | Có ngắn hạn | Có thể biến thể |
| focus_milestone | Có | Pattern lặp |
| proactive_checkin | Có | Tiết kiệm cost |
| emotional_support | Không | Cần ngữ cảnh cẩn thận |

### **19.2. Cache key**

```rust
pub struct AICacheKey {
    pub interaction_type: InteractionType,
    pub character_id: String,
    pub mode: AppMode,
    pub time_bucket: TimeBucket,
    pub memory_fingerprint: String,
}
```

### **19.3. Template fallback**

Fallback dùng khi:

```text
- AI provider timeout.
- JSON invalid sau retry.
- Budget hết.
- Rate limited.
- Private mode chặn AI.
- Provider circuit open.
```

### **19.4. Template response type**

```rust
pub struct TemplateResponse {
    pub message: String,
    pub emotion: AIEmotion,
    pub suggested_animation: Option<string>,
    pub suggested_expression: Option<string>,
    pub state_delta: AIStateDelta,
}
```

### **19.5. Template examples**

```json
{
  "focus_milestone_45": [
    {
      "message": "Anh tập trung khá lâu rồi. Nghỉ một chút không?",
      "emotion": "caring",
      "suggested_animation": "talking_gentle",
      "suggested_expression": "caring"
    }
  ],
  "ai_error": [
    {
      "message": "Em hơi lag một chút. Mình thử lại sau nhé.",
      "emotion": "shy",
      "suggested_animation": "shy",
      "suggested_expression": "shy"
    }
  ],
  "budget_exceeded": [
    {
      "message": "Hôm nay em nói ít lại để tiết kiệm nhé.",
      "emotion": "caring",
      "suggested_animation": "talking_gentle",
      "suggested_expression": "caring"
    }
  ]
}
```

---

## **20. Backend: AI Orchestrator**

### **20.1. Module trách nhiệm**

```rust
pub struct AIOrchestrator {
    interaction_router: InteractionRouter,
    context_composer: AIContextComposer,
    prompt_builder: PromptBuilder,
    provider: AIProviderClient,
    validator: AIResponseValidator,
    operation_router: AIOperationRouter,
    cost_tracker: AICostTracker,
    rate_limiter: AIRateLimiter,
    cache: AIResponseCache,
    fallback: TemplateFallbackEngine,
    audit: AIAuditLogger,
}
```

### **20.2. Public methods**

```rust
impl AIOrchestrator {
    pub async fn handle_interaction(
        &self,
        req: AIInteractionRequest,
    ) -> Result<aiinteractionresult>;

    pub async fn send_direct_chat(
        &self,
        character_id: String,
        message: String,
    ) -> Result<aiinteractionresult>;

    pub async fn handle_proactive_trigger(
        &self,
        trigger: ProactiveTrigger,
    ) -> Result<aiinteractionresult>;

    pub async fn retry_last_request(
        &self,
        request_id: String,
    ) -> Result<aiinteractionresult>;

    pub async fn test_connection(
        &self,
        config: AIProviderConfig,
    ) -> Result<aiconnectiontestresult>;
}
```

### **20.3. Main orchestration flow**

```rust
pub async fn handle_interaction(
    &self,
    req: AIInteractionRequest,
) -> Result<aiinteractionresult> {
    self.audit.log_request_started(&req).await?;

    // 1. Check budget/rate/privacy
    if let Some(reason) = self.preflight_deny_reason(&req).await? {
        return self.handle_fallback(req, reason).await;
    }

    // 2. Cache lookup
    if let Some(cached) = self.cache.get(&req).await? {
        return self.apply_validated_response(req, cached, ResponseSource::Cache).await;
    }

    // 3. Context
    let ctx = self.context_composer.build(&req).await?;

    // 4. Thinking animation
    self.operation_router.play_thinking(&ctx).await?;

    // 5. Prompt
    let messages = self.prompt_builder.build_messages(&ctx, &req)?;

    // 6. Send provider
    let raw = self.provider.chat(messages).await;

    // 7. Handle provider result
    let raw = match raw {
        Ok(r) => r,
        Err(e) => {
            self.audit.log_provider_error(&req, &e).await?;
            return self.handle_fallback(req, "provider_error".into()).await;
        }
    };

    // 8. Validate
    let response = match self.validator.validate(&raw, &ctx) {
        AIValidationResult::Accepted(r) => r,
        AIValidationResult::Modified { response, warnings } => {
            self.audit.log_validation_warnings(&req, warnings).await?;
            response
        }
        AIValidationResult::Rejected { reason } => {
            self.audit.log_validation_rejected(&req, &reason).await?;
            return self.handle_fallback(req, reason).await;
        }
    };

    // 9. Apply operations
    let result = self.apply_validated_response(
        req,
        response,
        ResponseSource::Provider,
    ).await?;

    // 10. Record cost/cache/audit
    self.cost_tracker.record_from_provider_usage(&result.usage).await?;
    self.cache.maybe_store(&result).await?;
    self.audit.log_request_completed(&result).await?;

    Ok(result)
}
```

### **20.4. Apply response flow**

```rust
pub async fn apply_validated_response(
    &self,
    req: AIInteractionRequest,
    response: AIInteractionResponse,
    source: ResponseSource,
) -> Result<aiinteractionresult> {
    let ctx = self.context_composer.execution_context(&req).await?;

    // 1. State mutation
    let state_result = self.operation_router
        .apply_state_delta(&response, &ctx)
        .await?;

    // 2. Memory operations
    let memory_results = self.operation_router
        .handle_memory_operations(response.memory_operations.clone(), &ctx)
        .await?;

    // 3. Interruption decision
    let interruption = self.operation_router
        .decide_interruption(&response, &ctx)
        .await?;

    // 4. Animation
    let animation_result = self.operation_router
        .handle_animation(&response, &ctx, &interruption)
        .await?;

    // 5. Bubble / UI
    let bubble_result = self.operation_router
        .show_bubble_if_allowed(&response, &ctx, &interruption)
        .await?;

    // 6. Next action
    let schedule_result = self.operation_router
        .schedule_next_action(&response, &ctx)
        .await?;

    Ok(AIInteractionResult {
        request_id: req.request_id,
        response,
        source,
        state_result,
        memory_results,
        animation_result,
        bubble_result,
        schedule_result,
    })
}
```

---

## **21. AI Provider Client**

### **21.1. Config**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIProviderConfig {
    pub base_url: String,
    pub api_key_encrypted: String,
    pub model: String,
    pub temperature: f32,
    pub max_tokens: u32,
    pub timeout_seconds: u64,
}
```

### **21.2. OpenAI-compatible client**

```rust
pub struct OpenAICompatibleClient {
    http: reqwest::Client,
    config: AIProviderConfig,
}

impl OpenAICompatibleClient {
    pub async fn chat(
        &self,
        messages: Vec<chatmessage>,
    ) -> Result<aiproviderrawresponse> {
        let body = serde_json::json!({
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "response_format": { "type": "json_object" }
        });

        let res = self.http
            .post(format!("{}/chat/completions", self.config.base_url.trim_end_matches('/')))
            .bearer_auth(self.decrypt_api_key()?)
            .json(&body)
            .send()
            .await?
            .error_for_status()?;

        let parsed: OpenAIChatCompletionResponse = res.json().await?;
        Ok(AIProviderRawResponse::from_openai(parsed))
    }
}
```

### **21.3. Retry policy**

```text
- Timeout: retry 1 lần.
- 429 rate limit: không retry ngay, fallback.
- 401/403 auth error: không retry, emit settings error.
- 5xx: retry 1 lần sau 500ms.
- JSON invalid: có thể repair prompt retry 1 lần.
```

### **21.4. Circuit breaker**

```rust
pub struct AICircuitBreaker {
    pub failure_count: u32,
    pub opened_until: Option<datetime<utc>>,
}

impl AICircuitBreaker {
    pub fn record_failure(&mut self) {
        self.failure_count += 1;
        if self.failure_count >= 3 {
            self.opened_until = Some(Utc::now() + chrono::Duration::minutes(5));
        }
    }

    pub fn can_call(&self) -> bool {
        match self.opened_until {
            Some(t) => Utc::now() > t,
            None => true,
        }
    }
}
```

---

## **22. IPC Contract**

### **22.1. Frontend → Rust commands**

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

### **22.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `ai_lifecycle_changed` | `AILifecycleStatePayload` | Update UI thinking/listening. |
| `ai_response_started` | `{ request_id }` | Bắt đầu response. |
| `ai_response_completed` | `AIInteractionResult` | Response hoàn tất. |
| `ai_response_failed` | `AIErrorPayload` | Báo lỗi. |
| `ai_usage_updated` | `AIUsageSummary` | Update settings usage. |
| `ai_budget_exceeded` | `{ limit, used }` | Báo hết budget. |
| `show_bubble` | `BubblePayload` | Hiện bubble. |
| `hide_bubble` | `{ reason }` | Ẩn bubble. |

### **22.3. TypeScript IPC types**

```typescript
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
  api_key?: string;
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
```

---

## **23. Frontend Interaction UI**

### **23.1. Chat UI**

```text
Overlay
└─ Chat Panel
   ├─ Input box
   ├─ Send button
   ├─ Small history preview
   ├─ Thinking indicator
   └─ Error retry button
```

### **23.2. Speech bubble**

```text
┌─────────────────────────────┐
│ Anh tập trung khá lâu rồi.  │
│ Nghỉ một chút không?        │
└─────────────────────────────┘
```

Bubble rules:

```text
- Max 2 lines nếu overlay nhỏ.
- Max 180 chars.
- Auto hide sau 4-12s tùy độ dài.
- Không hiện trong private/meeting nếu policy chặn.
- Nếu message dài, chunk thành nhiều bubble.
```

### **23.3. Radial menu AI actions**

```text
Right click character
├─ Talk
├─ How are you?
├─ Cheer me up
├─ Focus mode
├─ Quiet mode
├─ Private mode
└─ Settings
```

### **23.4. Pending memory UI**

Nếu AI đề xuất memory cần duyệt:

```text
Chiro muốn ghi nhớ:
"User thích câu trả lời ngắn, trực tiếp."

[Nhớ] [Sửa rồi nhớ] [Không nhớ]
```

### **23.5. AI status indicator**

```text
- Idle: không hiển thị
- Thinking: icon nhỏ hoặc animation thinking
- Offline/fallback: icon nhỏ màu vàng trong settings
- Budget exceeded: settings warning
```

---

## **24. Logging & Audit**

### **24.1. AI request log**

```sql
CREATE TABLE ai_request_log (
    id TEXT PRIMARY KEY,
    interaction_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    interaction_type TEXT NOT NULL,

    source TEXT NOT NULL, -- provider|cache|fallback

    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    estimated_cost_cents INTEGER,

    status TEXT NOT NULL, -- success|failed|fallback|rejected
    error_code TEXT,
    error_message TEXT,

    created_at DATETIME NOT NULL,
    completed_at DATETIME
);
```

### **24.2. AI operation log**

```sql
CREATE TABLE ai_operation_log (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,

    operation_type TEXT NOT NULL, -- state|memory|animation|bubble|schedule
    operation_payload_json TEXT,
    operation_result_json TEXT,

    status TEXT NOT NULL, -- applied|modified|rejected|failed
    reason TEXT,

    created_at DATETIME NOT NULL,

    FOREIGN KEY (request_id) REFERENCES ai_request_log(id)
);
```

### **24.3. Không log gì**

Không log raw API key.

Không log raw prompt đầy đủ nếu setting `debug_prompt_logging = false`.

Không log window title raw.

Không log secrets.

### **24.4. Debug mode**

Khi debug mode bật:

```text
- Có thể lưu sanitized prompt.
- Có thể lưu raw AI response.
- Không bao giờ lưu API key.
- Prompt log tự động redact secret-like pattern.
```

---

## **25. Error Handling**

### **25.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum AIError {
    #[error("Provider unavailable: {0}")]
    ProviderUnavailable(String),

    #[error("Provider auth failed")]
    ProviderAuthFailed,

    #[error("Rate limited")]
    RateLimited,

    #[error("Budget exceeded")]
    BudgetExceeded,

    #[error("Invalid JSON response")]
    InvalidJson,

    #[error("Schema validation failed: {0}")]
    SchemaValidationFailed(String),

    #[error("Privacy blocked")]
    PrivacyBlocked,

    #[error("Context build failed: {0}")]
    ContextBuildFailed(String),

    #[error("Operation failed: {0}")]
    OperationFailed(String),
}
```

### **25.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Provider timeout | Retry 1 lần, sau đó fallback |
| 401/403 | Báo Settings, fallback |
| 429 | Fallback, tăng cooldown |
| 5xx | Retry 1 lần, fallback |
| JSON invalid | Retry với repair instruction 1 lần |
| Schema invalid | Fallback |
| Budget exceeded | Fallback budget template |
| Privacy blocked | Silent hoặc local template |
| Memory operation fail | Bỏ operation, vẫn show message nếu safe |
| Animation invalid | Bỏ animation, dùng default talking |
| State mutation fail | Log, vẫn show message |
| Bubble blocked | Không show, vẫn apply safe operations |

### **25.3. Fallback strategy**

```rust
pub async fn handle_fallback(
    &self,
    req: AIInteractionRequest,
    reason: String,
) -> Result<aiinteractionresult> {
    let template = self.fallback.pick(&req, &reason).await?;

    let response = AIInteractionResponse::from_template(template);

    self.apply_validated_response(
        req,
        response,
        ResponseSource::Fallback,
    ).await
}
```

---

## **26. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── ai/
│               ├── mod.rs
│               ├── types.rs
│               ├── orchestrator.rs
│               ├── interaction_router.rs
│               ├── context_composer.rs
│               ├── prompt_builder.rs
│               ├── provider.rs
│               ├── openai_client.rs
│               ├── validator.rs
│               ├── operation_router.rs
│               ├── cost_tracker.rs
│               ├── rate_limiter.rs
│               ├── cache.rs
│               ├── fallback.rs
│               ├── audit.rs
│               ├── sanitizer.rs
│               └── errors.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── ai_commands.rs
│
├── src/
│   ├── overlay/
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── SpeechBubble.tsx
│   │   │   ├── ThinkingIndicator.tsx
│   │   │   └── PendingMemoryToast.tsx
│   │   └── stores/
│   │       └── aiStore.ts
│   │
│   ├── settings/
│   │   └── pages/
│   │       └── AI.tsx
│   │
│   └── shared/
│       └── types/
│           └── ai.ts
│
├── assets/
│   └── ai/
│       ├── prompt_core.md
│       ├── response_schema.json
│       ├── fallback_templates.json
│       └── intent_registry.json
│
└── docs/
    └── ai-interaction-system.md
```

---

## **27. Implementation Checklist**

### **27.1. P0 Core**

- [ ] Tạo module `core/ai`.
- [ ] Định nghĩa `AIInteractionRequest`.
- [ ] Định nghĩa `AIInteractionResponse`.
- [ ] Implement `AIOrchestrator`.
- [ ] Implement OpenAI-compatible client.
- [ ] Implement JSON response schema validation.
- [ ] Implement cost tracker.
- [ ] Implement rate limiter.
- [ ] Implement fallback template engine.
- [ ] Implement IPC command `ai_send_chat`.
- [ ] Implement event `show_bubble`.

### **27.2. P0 Prompt & Context**

- [ ] Build active character context.
- [ ] Inject character state.
- [ ] Retrieve shared memories.
- [ ] Retrieve active character memories.
- [ ] Inject sanitized desktop context.
- [ ] Add recent conversation.
- [ ] Enforce token budget.

### **27.3. P0 Operation Routing**

- [ ] Route `state_delta` tới StateManager.
- [ ] Route `memory_operations` tới MemoryManager.
- [ ] Route `suggested_animation` tới AnimationDirector.
- [ ] Route `suggested_expression` tới expression validator.
- [ ] Route `message` tới BubbleManager.
- [ ] Route `next_action` tới scheduler.

### **27.4. P1 Proactivity**

- [ ] Implement proactive trigger input.
- [ ] Implement interruption decision.
- [ ] Implement cooldown.
- [ ] Implement daily proactive budget.
- [ ] Block proactive in focus/gaming/meeting/private.

### **27.5. P1 UI**

- [ ] Chat panel.
- [ ] Speech bubble.
- [ ] Thinking indicator.
- [ ] AI settings page.
- [ ] Usage summary.
- [ ] Test connection.
- [ ] Pending memory toast integration.

### **27.6. P2 Advanced**

- [ ] Cache for proactive templates.
- [ ] Circuit breaker.
- [ ] Retry with repair instruction.
- [ ] Debug prompt viewer.
- [ ] AI operation log viewer.
- [ ] Conversation summarization.
- [ ] Multi-model config presets.

---

## **28. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **AI Orchestrator** | Module điều phối toàn bộ lifecycle AI. |
| **AI Provider** | Endpoint OpenAI-compatible dùng để sinh response. |
| **Prompt Builder** | Module dựng messages gửi lên AI. |
| **Context Composer** | Module gom character, memory, desktop context và recent chat. |
| **AI Response Schema** | JSON schema bắt buộc cho output AI. |
| **Operation Router** | Module chuyển output AI tới subsystem tương ứng. |
| **State Delta** | Thay đổi nhỏ AI đề xuất cho mood, energy, affinity. |
| **Memory Operation** | Đề xuất create/patch/delete/verify memory từ AI. |
| **Interruption Level** | Mức độ làm phiền user từ 0 đến 4. |
| **Template Fallback** | Response local khi AI provider không dùng được. |
| **Sanitized Context** | Context đã loại bỏ dữ liệu thô/nhạy cảm trước khi gửi AI. |
| **Circuit Breaker** | Cơ chế tạm ngưng gọi provider sau nhiều lỗi liên tiếp. |
| **Token Budget** | Giới hạn token cho từng phần context. |

---

# **Phụ lục A: Flow chuẩn một lượt chat**

```text
User gửi message
    ↓
Frontend invoke ai_send_chat
    ↓
AIOrchestrator.handle_interaction
    ↓
Preflight:
  - private mode
  - budget
  - rate limit
  - provider status
    ↓
ContextComposer:
  - active character
  - character state
  - shared memories
  - character memories
  - sanitized desktop context
  - recent conversation
    ↓
AnimationDirector.play(thinking)
    ↓
PromptBuilder.build_messages
    ↓
Provider.chat
    ↓
Raw response
    ↓
ValidatorChain
    ↓
OperationRouter:
  - apply state delta
  - propose memory operations
  - validate animation/expression
  - decide interruption
  - show bubble
  - play talking animation
  - schedule next action
    ↓
Audit log + cost record
    ↓
Frontend update
    ↓
Talking ends
    ↓
Fallback idle/mode state
```

---

# **Phụ lục B: Flow proactive check-in**

```text
EventScheduler trigger focus_milestone_45
    ↓
Desktop context says mode=focus
    ↓
ProactivityController pre-check:
  - focus mode allows only low interruption
  - cooldown ok
  - daily budget ok
  - private mode off
    ↓
AIOrchestrator builds proactive request
    ↓
Prompt includes:
  - active character
  - focus duration rounded
  - user boundaries
  - no raw app/window title
    ↓
AI response:
  message: "Anh tập trung khá lâu rồi. Nghỉ chút không?"
  interruption.level: 1
    ↓
ProactivityController final decision:
  - ambient bubble only
  - no OS notification
    ↓
Bubble shown 6 seconds
    ↓
Memory/state update if safe
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. Direct chat response**

```json
{
  "message": "Em hiểu. Vậy em sẽ nói ngắn, rõ ý, không vòng vo.",
  "emotion": "caring",
  "intent": "preference_update",
  "state_delta": {
    "mood": 1,
    "energy": 0,
    "affinity": 1,
    "trust": 1,
    "familiarity": 1
  },
  "suggested_animation": "talking_gentle",
  "suggested_expression": "caring",
  "interruption": {
    "should_notify": false,
    "level": 1,
    "priority": "normal"
  },
  "memory_operations": [
    {
      "operation": "create",
      "scope": "shared",
      "type": "communication_style",
      "content": "User thích câu trả lời ngắn, rõ ý, không vòng vo.",
      "importance": 4,
      "confidence": 0.95,
      "reason": "User explicitly requested this communication style."
    }
  ],
  "next_action": {
    "type": "wait",
    "delay_minutes": 30,
    "reason": "No immediate follow-up needed."
  },
  "debug_reason": "User stated a communication preference."
}
```

## **C.2. Silent response**

```json
{
  "message": "",
  "emotion": "focused",
  "intent": "silent",
  "state_delta": {
    "mood": 0,
    "energy": 0,
    "affinity": 0,
    "trust": 0,
    "familiarity": 0
  },
  "suggested_animation": null,
  "suggested_expression": null,
  "interruption": {
    "should_notify": false,
    "level": 0,
    "priority": "silent"
  },
  "memory_operations": [],
  "next_action": {
    "type": "wait",
    "delay_minutes": 30
  },
  "debug_reason": "User is in focus mode; no interruption needed."
}
```

## **C.3. Proactive response**

```json
{
  "message": "Anh tập trung gần một tiếng rồi. Nghỉ mắt 2 phút nhé?",
  "emotion": "caring",
  "intent": "reminder",
  "state_delta": {
    "mood": 0,
    "energy": 0,
    "affinity": 0,
    "trust": 0,
    "familiarity": 0
  },
  "suggested_animation": "talking_gentle",
  "suggested_expression": "caring",
  "interruption": {
    "should_notify": false,
    "level": 1,
    "priority": "low"
  },
  "memory_operations": [],
  "next_action": {
    "type": "schedule_checkin",
    "delay_minutes": 45,
    "reason": "Check again after another focus interval."
  },
  "debug_reason": "Focus milestone reached and interruption budget allows low-level bubble."
}
```

---

**Tài liệu này là source of truth cho AI Interaction System. Mọi AI agent hoặc developer khi triển khai AI phải tuân thủ nguyên tắc: AI chỉ đề xuất, subsystem quyết định, mọi output phải validate, mọi context phải sanitize, mọi thao tác ghi phải audit.**