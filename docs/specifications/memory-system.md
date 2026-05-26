# **Chiro-Pet Memory System**

&gt; Tài liệu thiết kế chính thức cho **Memory System** của **Chiro-Pet**.  
&gt; Hệ thống này quản lý cách app ghi nhớ, truy xuất, phân loại, cập nhật và sử dụng ký ức trong quá trình tương tác với user và nhiều character profile.
&gt;
&gt; **Nguyên tắc lõi:** Memory là lớp dữ liệu dài hạn giúp nhân vật cá nhân hóa hành vi. AI có thể **đề xuất** ghi nhớ, cập nhật, patch hoặc xóa memory, nhưng mọi thao tác ghi đều phải đi qua **validator + memory policy + user approval rule**.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)  
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)  
3. [Khái niệm cốt lõi](#3-khái-niệm-cốt-lõi)  
4. [Kiến trúc tổng thể](#4-kiến-trúc-tổng-thể)  
5. [Memory Scope](#5-memory-scope)  
6. [Memory Type](#6-memory-type)  
7. [Data Model](#7-data-model)  
8. [Memory Lifecycle](#8-memory-lifecycle)  
9. [Flow ghi memory](#9-flow-ghi-memory)  
10. [Flow đọc memory](#10-flow-đọc-memory)  
11. [Flow patch memory](#11-flow-patch-memory)  
12. [Flow xóa memory](#12-flow-xóa-memory)  
13. [AI Tool Calling cho Memory](#13-ai-tool-calling-cho-memory)  
14. [Memory Validator Chain](#14-memory-validator-chain)  
15. [Memory Retrieval & Ranking](#15-memory-retrieval--ranking)  
16. [Context Budget & Prompt Injection](#16-context-budget--prompt-injection)  
17. [Memory Compression](#17-memory-compression)  
18. [User Approval & Privacy](#18-user-approval--privacy)  
19. [Backend: MemoryManager](#19-backend-memorymanager)  
20. [IPC Contract](#20-ipc-contract)  
21. [Frontend Memory UI](#21-frontend-memory-ui)  
22. [Interaction với Character System](#22-interaction-với-character-system)  
23. [Interaction với AI System](#23-interaction-với-ai-system)  
24. [Logging & Audit](#24-logging--audit)  
25. [Error Handling](#25-error-handling)  
26. [File Structure](#26-file-structure)  
27. [Implementation Checklist](#27-implementation-checklist)  
28. [Glossary](#28-glossary)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Memory System của **Chiro-Pet** phải:

- Lưu được thông tin dài hạn về **user**, **thói quen**, **sở thích**, **ranh giới**, **sự kiện quan trọng**.
- Hỗ trợ nhiều character nhưng chỉ **1 active character** tại một thời điểm.
- Dùng chung memory về user giữa mọi character.
- Lưu riêng memory cảm xúc hoặc kỷ niệm giữa user và từng character.
- Cho phép AI đề xuất thao tác:
  - **create memory**
  - **patch memory**
  - **merge memory**
  - **delete memory candidate**
  - **increase / decrease importance**
- Bảo vệ user bằng:
  - validation
  - approval rule
  - privacy filter
  - audit log
- Truy xuất memory hiệu quả để build prompt mà không làm phình context.
- Cho phép user xem, sửa, xóa memory trong Settings.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Memory schema.
- Memory scope và type.
- Flow ghi, đọc, patch, xóa.
- AI tool calling cho memory.
- Validator và privacy policy.
- Ranking, retrieval, context injection.
- IPC contract.
- UI quản lý memory.

Tài liệu này không bao quát chi tiết:

- Character profile schema.
- Animation runtime.
- AI response schema tổng thể.
- Desktop awareness system.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **AI đề xuất, hệ thống quyết định** | AI không ghi trực tiếp vào database. AI chỉ gửi memory operation candidate. |
| **2** | **Shared memory và character memory tách rõ** | Thông tin về user dùng chung, kỷ niệm với character lưu riêng. |
| **3** | **Không inject toàn bộ memory vào prompt** | Mỗi lượt chỉ lấy memory liên quan nhất theo ranking. |
| **4** | **Memory phải có type, scope, confidence, importance** | Không lưu chuỗi text mơ hồ. |
| **5** | **Sensitive memory cần user approval** | Dữ liệu nhạy cảm không tự động lưu. |
| **6** | **Memory có thể lỗi thời** | Mỗi memory có status, last_verified_at, superseded_by. |
| **7** | **Có audit log cho mọi thao tác ghi** | Tạo, sửa, xóa, merge đều phải truy vết được. |
| **8** | **Không spam memory** | Có deduplication và merge logic. |
| **9** | **User có quyền kiểm soát cuối cùng** | User có thể xem, sửa, xóa, export, clear memory. |

### **2.2. Anti-pattern cần tránh**

- ❌ Lưu mọi câu user nói thành memory.
- ❌ Cho AI ghi trực tiếp SQLite.
- ❌ Dùng 1 bảng memory không phân scope.
- ❌ Lưu thông tin nhạy cảm mà không hỏi user.
- ❌ Lặp lại nhiều memory cùng nội dung.
- ❌ Inject memory quá cũ, không liên quan vào prompt.
- ❌ Để character này đọc kỷ niệm riêng của character khác.
- ❌ Không có cơ chế patch khi user sửa thông tin.

---

## **3. Khái niệm cốt lõi**

### **3.1. Memory là gì?**

**Memory** là một đơn vị thông tin dài hạn, có cấu trúc, được dùng để cá nhân hóa hành vi của companion.

Ví dụ:

```text
User thích cà phê đen, không đường.
```

Không nên lưu thô:

```text
Hôm nay user nói: "Tôi hay uống cà phê đen vào buổi sáng."
```

Memory cần được chuẩn hóa:

```json
{
  "type": "user_preference",
  "content": "User thích cà phê đen, không đường.",
  "scope": "shared",
  "importance": 3,
  "confidence": 0.9
}
```

### **3.2. Memory Candidate**

**Memory Candidate** là đề xuất từ AI hoặc system, chưa chắc được ghi.

```text
AI Response
  → memory_to_save
  → Memory Candidate
  → Validator
  → Dedup / Merge
  → Approval Policy
  → Save / Reject / Pending
```

### **3.3. Memory Operation**

Memory không chỉ có tạo mới. Có các operation:

| **Operation** | **Mô tả** |
|---|---|
| **create** | Tạo memory mới. |
| **patch** | Cập nhật một phần memory hiện có. |
| **merge** | Gộp memory mới vào memory cũ. |
| **supersede** | Đánh dấu memory cũ bị thay thế. |
| **delete** | Xóa memory. |
| **archive** | Ẩn memory khỏi retrieval nhưng vẫn giữ audit. |
| **verify** | Xác nhận memory vẫn đúng. |
| **increase_importance** | Tăng độ quan trọng. |
| **decrease_importance** | Giảm độ quan trọng. |

---

## **4. Kiến trúc tổng thể**

```text
┌──────────────────────────────────────────────────────────────┐
│                         AI SYSTEM                             │
│  - Đề xuất memory operation                                  │
│  - Không ghi DB trực tiếp                                    │
└────────────────────────────┬─────────────────────────────────┘
                             │ MemoryOperationCandidate
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                      MEMORY MANAGER                           │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Memory Classifier                                      │  │
│  │ - Xác định scope: shared / character                   │  │
│  │ - Xác định type                                        │  │
│  │ - Xác định sensitivity                                 │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Validator Chain                                        │  │
│  │ - Schema validation                                    │  │
│  │ - Privacy validation                                   │  │
│  │ - Duplicate detection                                  │
│  │ - Conflict detection                                   │
│  │ - Importance validation                                │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Memory Policy Engine                                   │
│  │ - Auto save / require approval / reject                │
│  │ - Scope isolation                                      │
│  │ - Sensitive data rules                                 │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Memory Store                                           │
│  │ - SQLite CRUD                                          │
│  │ - Patch / merge / archive                              │
│  │ - Audit log                                            │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Retrieval Engine                                       │
│  │ - Ranking                                              │
│  │ - Recency / importance / relevance                     │
│  │ - Context budget                                       │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             │ selected memories
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                     PROMPT BUILDER                            │
│  - Inject shared memories                                     │
│  - Inject active character memories                           │
│  - Không inject memory riêng của character khác               │
└──────────────────────────────────────────────────────────────┘
```

---

## **5. Memory Scope**

### **5.1. Scope chính**

| **Scope** | **Ý nghĩa** | **character_id** | **Ai được đọc?** |
|---|---|---|---|
| **shared** | Thông tin chung về user | `NULL` | Mọi character |
| **character** | Kỷ niệm riêng với character | Active character tương ứng | Chỉ character đó |
| **system** | Thông tin vận hành app | `NULL` | System only |
| **temporary** | Context tạm thời, không lưu lâu | Optional | Theo session |

### **5.2. Quy tắc scope**

```text
Nếu memory nói về user:
  → shared

Nếu memory nói về sở thích, thói quen, ranh giới user:
  → shared

Nếu memory nói về cảm xúc, kỷ niệm, mốc quan hệ giữa user và character:
  → character

Nếu memory nói về app config, lỗi, usage:
  → system

Nếu memory chỉ cần trong phiên hiện tại:
  → temporary
```

### **5.3. Ví dụ phân scope**

| **Nội dung** | **Scope** | **Lý do** |
|---|---|---|
| User tên là Phương | shared | Mọi character nên biết |
| User thích cà phê đen | shared | Sở thích chung |
| User không thích bị nhắc nghỉ liên tục | shared | Boundary chung |
| Mira từng an ủi user khi deploy fail | character | Kỷ niệm riêng với Mira |
| Yuki có inside joke "một trận nữa thôi" với user | character | Kỷ niệm riêng với Yuki |
| App detect user thường code buổi tối | shared | Habit chung |
| Last rendered model failed to load | system | Dữ liệu vận hành |

---

## **6. Memory Type**

### **6.1. Shared memory types**

| **Type** | **Mô tả** | **Ví dụ** | **Approval** |
|---|---|---|---|
| **user_fact** | Sự thật ổn định về user | User tên là Phương | Auto nếu không nhạy cảm |
| **user_preference** | Sở thích | User thích cà phê đen | Auto |
| **user_dislike** | Điều user không thích | User không thích bị spam thông báo | Auto |
| **user_habit** | Thói quen | User hay code ban đêm | Auto hoặc pending |
| **user_boundary** | Ranh giới, cấm kỵ | Không nhắc chuyện X | Auto, priority cao |
| **work_context** | Thông tin công việc chung | User làm software | Pending nếu nhạy cảm |
| **major_event** | Sự kiện quan trọng | User đổi việc | Pending |
| **communication_style** | Cách user muốn được nói chuyện | User thích trả lời ngắn | Auto |
| **schedule_pattern** | Pattern lịch sinh hoạt | User thường nghỉ trưa 12h | Pending |

### **6.2. Character memory types**

| **Type** | **Mô tả** | **Ví dụ** | **Approval** |
|---|---|---|---|
| **interaction** | Tương tác đáng nhớ | Lần đầu user chat với Mira | Auto |
| **emotional_moment** | Khoảnh khắc cảm xúc | Mira an ủi user khi buồn | Pending nếu nhạy cảm |
| **inside_joke** | Joke riêng | "Một trận nữa thôi" | Auto |
| **relationship_milestone** | Mốc quan hệ | Affinity Mira đạt 50 | Auto |
| **promise** | Lời hứa | Mira hứa nhắc user uống nước | Pending |
| **character_preference** | User thích cách character hành xử | User thích Mira nói nhẹ nhàng | Auto |
| **conflict_event** | Mâu thuẫn hoặc phản hồi tiêu cực | User khó chịu khi Mira nhắc nhiều | Auto, importance cao |

### **6.3. System memory types**

| **Type** | **Mô tả** |
|---|---|
| **app_setting_hint** | Gợi ý cấu hình từ hành vi |
| **model_issue** | Lỗi liên quan VRM/model |
| **animation_issue** | Lỗi animation |
| **ai_provider_issue** | Lỗi endpoint/model |
| **performance_note** | Ghi nhận performance |

---

## **7. Data Model**

### **7.1. Bảng memories**

```sql
CREATE TABLE memories (
    id TEXT PRIMARY KEY,

    -- Scope
    scope TEXT NOT NULL CHECK (
        scope IN ('shared', 'character', 'system', 'temporary')
    ),
    character_id TEXT,

    -- Classification
    type TEXT NOT NULL,
    subtype TEXT,

    -- Content
    content TEXT NOT NULL,
    normalized_content TEXT,
    summary TEXT,

    -- Metadata
    importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
    confidence REAL NOT NULL DEFAULT 0.8 CHECK (confidence &gt;= 0.0 AND confidence &lt;= 1.0),
    sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (
        sensitivity IN ('low', 'normal', 'sensitive', 'highly_sensitive')
    ),

    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (
        status IN ('pending', 'active', 'archived', 'rejected', 'superseded', 'deleted')
    ),
    user_approved INTEGER NOT NULL DEFAULT 0 CHECK (user_approved IN (0, 1)),

    -- Source
    source TEXT NOT NULL CHECK (
        source IN ('ai', 'user', 'system', 'import')
    ),
    source_event_id TEXT,
    source_message_id TEXT,

    -- Lifecycle
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    last_used_at DATETIME,
    last_verified_at DATETIME,
    expires_at DATETIME,

    -- Usage
    use_count INTEGER NOT NULL DEFAULT 0,
    retrieval_count INTEGER NOT NULL DEFAULT 0,

    -- Conflict / supersession
    superseded_by TEXT,
    conflict_group_id TEXT,

    -- Search
    keywords_json TEXT,
    embedding BLOB,

    -- Extra
    metadata_json TEXT,

    FOREIGN KEY (character_id) REFERENCES character_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (superseded_by) REFERENCES memories(id),

    CHECK (
        (scope = 'character' AND character_id IS NOT NULL)
        OR
        (scope IN ('shared', 'system', 'temporary'))
    )
);

CREATE INDEX idx_memories_scope ON memories(scope);
CREATE INDEX idx_memories_character ON memories(character_id);
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_status ON memories(status);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE INDEX idx_memories_updated ON memories(updated_at);
CREATE INDEX idx_memories_last_used ON memories(last_used_at);
CREATE INDEX idx_memories_conflict_group ON memories(conflict_group_id);
```

### **7.2. Bảng memory_operations**

Dùng để audit mọi thay đổi.

```sql
CREATE TABLE memory_operations (
    id TEXT PRIMARY KEY,

    memory_id TEXT,
    operation TEXT NOT NULL CHECK (
        operation IN (
            'create',
            'patch',
            'merge',
            'delete',
            'archive',
            'reject',
            'approve',
            'supersede',
            'verify',
            'importance_change'
        )
    ),

    actor TEXT NOT NULL CHECK (
        actor IN ('ai', 'user', 'system')
    ),

    before_json TEXT,
    after_json TEXT,
    patch_json TEXT,

    reason TEXT,
    created_at DATETIME NOT NULL,

    FOREIGN KEY (memory_id) REFERENCES memories(id)
);

CREATE INDEX idx_memory_operations_memory ON memory_operations(memory_id);
CREATE INDEX idx_memory_operations_created ON memory_operations(created_at);
```

### **7.3. Bảng memory_candidates**

Dùng cho memory cần duyệt.

```sql
CREATE TABLE memory_candidates (
    id TEXT PRIMARY KEY,

    proposed_operation TEXT NOT NULL CHECK (
        proposed_operation IN ('create', 'patch', 'merge', 'delete')
    ),

    target_memory_id TEXT,

    scope TEXT NOT NULL,
    character_id TEXT,
    type TEXT NOT NULL,

    content TEXT NOT NULL,
    patch_json TEXT,

    importance INTEGER NOT NULL DEFAULT 3,
    confidence REAL NOT NULL DEFAULT 0.8,
    sensitivity TEXT NOT NULL DEFAULT 'normal',

    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'approved', 'rejected', 'expired')
    ),

    proposed_by TEXT NOT NULL CHECK (
        proposed_by IN ('ai', 'system', 'user')
    ),

    reason TEXT,
    created_at DATETIME NOT NULL,
    resolved_at DATETIME,

    FOREIGN KEY (target_memory_id) REFERENCES memories(id),
    FOREIGN KEY (character_id) REFERENCES character_profiles(id)
);

CREATE INDEX idx_memory_candidates_status ON memory_candidates(status);
CREATE INDEX idx_memory_candidates_created ON memory_candidates(created_at);
```

### **7.4. Rust types**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryScope {
    Shared,
    Character,
    System,
    Temporary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemoryStatus {
    Pending,
    Active,
    Archived,
    Rejected,
    Superseded,
    Deleted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemorySensitivity {
    Low,
    Normal,
    Sensitive,
    HighlySensitive,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MemorySource {
    Ai,
    User,
    System,
    Import,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,

    pub scope: MemoryScope,
    pub character_id: Option<string>,

    pub memory_type: String,
    pub subtype: Option<string>,

    pub content: String,
    pub normalized_content: Option<string>,
    pub summary: Option<string>,

    pub importance: u8,
    pub confidence: f32,
    pub sensitivity: MemorySensitivity,

    pub status: MemoryStatus,
    pub user_approved: bool,

    pub source: MemorySource,
    pub source_event_id: Option<string>,
    pub source_message_id: Option<string>,

    pub created_at: DateTime<utc>,
    pub updated_at: DateTime<utc>,
    pub last_used_at: Option<datetime<utc>&gt;,
    pub last_verified_at: Option<datetime<utc>&gt;,
    pub expires_at: Option<datetime<utc>&gt;,

    pub use_count: u32,
    pub retrieval_count: u32,

    pub superseded_by: Option<string>,
    pub conflict_group_id: Option<string>,

    pub keywords: Vec<string>,
    pub embedding: Option<vec<f32>&gt;,

    pub metadata: serde_json::Value,
}
```

---

## **8. Memory Lifecycle**

### **8.1. Lifecycle states**

```text
candidate
   ↓ validate
pending ── approve ──► active
   │                    │
   │ reject             │ patch / merge / verify
   ▼                    ▼
rejected              active
                        │
                        ├── archive ──► archived
                        ├── supersede ──► superseded
                        └── delete ──► deleted
```

### **8.2. Status ý nghĩa**

| **Status** | **Ý nghĩa** | **Được retrieval?** |
|---|---|---|
| **pending** | Chờ user duyệt | Không, trừ UI pending |
| **active** | Đang sử dụng | Có |
| **archived** | Lưu lại nhưng không dùng | Không mặc định |
| **rejected** | Bị từ chối | Không |
| **superseded** | Bị memory khác thay thế | Không |
| **deleted** | Xóa mềm | Không |

### **8.3. Khi nào memory hết hạn**

Một số memory nên có `expires_at`:

| **Type** | **TTL đề xuất** |
|---|---|
| **temporary** | 1 session |
| **schedule_pattern** | 30-90 ngày |
| **work_context** | 180 ngày nếu không verify |
| **user_preference** | Không hết hạn |
| **user_boundary** | Không hết hạn |
| **major_event** | Không hết hạn |
| **inside_joke** | Không hết hạn |
| **app_setting_hint** | 30 ngày |

---

## **9. Flow ghi memory**

### **9.1. Flow tổng quát**

```text
AI / System / User tạo MemoryCandidate
        ↓
MemoryClassifier xác định scope/type/sensitivity
        ↓
SchemaValidator kiểm tra dữ liệu
        ↓
PrivacyValidator kiểm tra thông tin nhạy cảm
        ↓
DedupDetector tìm memory trùng/gần trùng
        ↓
ConflictDetector tìm mâu thuẫn với memory cũ
        ↓
MemoryPolicyEngine quyết định:
        ├─ auto_save
        ├─ require_user_approval
        ├─ merge_with_existing
        ├─ patch_existing
        └─ reject
        ↓
MemoryStore thực hiện operation
        ↓
AuditLog ghi operation
        ↓
Emit event cho frontend
```

### **9.2. Pseudocode**

```rust
pub async fn propose_memory(
    &self,
    candidate: MemoryCandidate,
    ctx: MemoryContext,
) -&gt; Result<memoryproposalresult> {
    // 1. Normalize
    let candidate = self.normalizer.normalize(candidate)?;

    // 2. Classify
    let classified = self.classifier.classify(candidate, &ctx)?;

    // 3. Validate schema
    self.validators.schema.validate(&classified)?;

    // 4. Validate privacy
    self.validators.privacy.validate(&classified)?;

    // 5. Dedup
    let duplicate = self.dedup.find_duplicate(&classified).await?;

    // 6. Conflict
    let conflict = self.conflict.find_conflict(&classified).await?;

    // 7. Policy decision
    let decision = self.policy.decide(&classified, duplicate, conflict, &ctx)?;

    // 8. Execute
    match decision {
        MemoryDecision::AutoSave =&gt; {
            let memory = self.store.create(classified.into_memory()).await?;
            self.audit.log_create(&memory, "auto_save").await?;
            Ok(MemoryProposalResult::Saved(memory.id))
        }

        MemoryDecision::RequireApproval =&gt; {
            let pending = self.store.create_candidate(classified).await?;
            self.events.emit_pending_memory(pending.id).await?;
            Ok(MemoryProposalResult::Pending(pending.id))
        }

        MemoryDecision::MergeWith(existing_id) =&gt; {
            let memory = self.store.merge(existing_id, classified).await?;
            self.audit.log_merge(&memory).await?;
            Ok(MemoryProposalResult::Merged(memory.id))
        }

        MemoryDecision::PatchExisting(existing_id, patch) =&gt; {
            let memory = self.store.patch(existing_id, patch).await?;
            self.audit.log_patch(&memory).await?;
            Ok(MemoryProposalResult::Patched(memory.id))
        }

        MemoryDecision::Reject(reason) =&gt; {
            self.audit.log_reject(&classified, &reason).await?;
            Ok(MemoryProposalResult::Rejected(reason))
        }
    }
}
```

### **9.3. Auto-save rule**

Có thể auto-save nếu:

```text
- sensitivity = low hoặc normal
- confidence &gt;= 0.7
- type thuộc nhóm an toàn
- không có conflict nghiêm trọng
- không trùng quá gần với memory cũ
- user không tắt memory_save
```

Nhóm an toàn:

```text
user_preference
user_dislike
communication_style
inside_joke
relationship_milestone
character_preference
conflict_event
```

### **9.4. Require approval rule**

Cần user duyệt nếu:

```text
- sensitivity = sensitive hoặc highly_sensitive
- type = major_event
- type = work_context có thông tin công việc cụ thể
- type = schedule_pattern suy ra từ hành vi
- confidence &lt; 0.7 nhưng importance cao
- AI đề xuất xóa memory
- AI đề xuất patch memory quan trọng
```

---

## **10. Flow đọc memory**

### **10.1. Flow tổng quát**

```text
AI Orchestrator cần build prompt
        ↓
PromptBuilder tạo MemoryQuery
        ↓
MemoryManager nhận query
        ↓
ScopeFilter:
        - shared
        - character của active_character_id
        - không lấy character khác
        ↓
StatusFilter:
        - chỉ active
        ↓
RelevanceSearch:
        - keyword
        - semantic embedding nếu có
        - type filter
        ↓
Ranking:
        - importance
        - recency
        - relevance
        - use_count decay
        ↓
BudgetLimiter:
        - giới hạn số lượng / token
        ↓
Mark retrieval_count
        ↓
Return SelectedMemory[]
```

### **10.2. Query type**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryQuery {
    pub scopes: Vec<memoryscope>,
    pub active_character_id: Option<string>,

    pub memory_types: Option<vec<string>&gt;,
    pub text_query: Option<string>,
    pub keywords: Vec<string>,

    pub min_importance: Option<u8>,
    pub max_results: usize,
    pub max_tokens: Option<u32>,

    pub include_archived: bool,
    pub include_pending: bool,

    pub recency_days: Option<u32>,
}
```

### **10.3. Scope filter bắt buộc**

```rust
pub fn apply_scope_filter(
    query: &MemoryQuery,
    active_character_id: Option&lt;&str&gt;,
) -&gt; ScopeFilter {
    ScopeFilter {
        shared: query.scopes.contains(&MemoryScope::Shared),
        character_id: if query.scopes.contains(&MemoryScope::Character) {
            active_character_id.map(|s| s.to_string())
        } else {
            None
        },
        system: query.scopes.contains(&MemoryScope::System),
    }
}
```

**Quy tắc cứng:**

```text
Không bao giờ trả về memory character nếu character_id != active_character_id.
```

---

## **11. Flow patch memory**

### **11.1. Khi nào patch**

Patch dùng khi:

- User sửa thông tin.
- AI phát hiện memory cũ thiếu chi tiết.
- Memory cũ còn đúng nhưng cần update.
- Importance/confidence thay đổi.
- Verification mới hơn.

Ví dụ:

```text
Memory cũ:
User thích cà phê.

Thông tin mới:
User thích cà phê đen, không đường.

Patch:
content = "User thích cà phê đen, không đường."
confidence = 0.95
keywords += ["cà phê đen", "không đường"]
```

### **11.2. Patch operation schema**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryPatch {
    pub content: Option<string>,
    pub summary: Option<string>,
    pub importance: Option<u8>,
    pub confidence: Option<f32>,
    pub sensitivity: Option<memorysensitivity>,
    pub status: Option<memorystatus>,
    pub keywords_add: Vec<string>,
    pub keywords_remove: Vec<string>,
    pub metadata_merge: serde_json::Value,
    pub last_verified_at: Option<datetime<utc>&gt;,
}
```

### **11.3. Patch flow**

```text
Patch request
   ↓
Load target memory
   ↓
Check permission:
   - AI chỉ được patch memory không nhạy cảm
   - sensitive patch cần pending approval
   ↓
Validate patch fields
   ↓
Apply patch on copy
   ↓
Validate final memory
   ↓
Audit before/after
   ↓
Save
```

### **11.4. Pseudocode**

```rust
pub async fn patch_memory(
    &self,
    memory_id: String,
    patch: MemoryPatch,
    actor: MemoryActor,
) -&gt; Result<memory> {
    let old = self.store.get(&memory_id).await?;

    self.policy.can_patch(&old, &patch, actor)?;

    let new = old.apply_patch(patch)?;

    self.validators.schema.validate_memory(&new)?;
    self.validators.privacy.validate_memory(&new)?;

    if self.policy.patch_requires_approval(&old, &new, actor) {
        self.store.create_patch_candidate(old.id.clone(), old, new).await?;
        return Err(MemoryError::ApprovalRequired);
    }

    self.store.update(&new).await?;

    self.audit.log(MemoryOperationLog {
        memory_id: Some(new.id.clone()),
        operation: MemoryOperation::Patch,
        actor,
        before_json: Some(serde_json::to_value(old)?),
        after_json: Some(serde_json::to_value(new.clone())?),
        patch_json: None,
        reason: Some("patch_memory".into()),
    }).await?;

    Ok(new)
}
```

---

## **12. Flow xóa memory**

### **12.1. Soft delete mặc định**

Không hard delete ngay. Dùng status `deleted`.

```text
delete_memory(id)
  → status = deleted
  → retrieval bỏ qua
  → audit giữ lại
```

### **12.2. Hard delete**

Chỉ dùng khi user chọn:

```text
Settings → Memory → Delete permanently
```

### **12.3. Delete rule**

| **Actor** | **Có được xóa?** |
|---|---|
| **User** | Có, trực tiếp |
| **System** | Có, nếu temporary/expired |
| **AI** | Không trực tiếp, chỉ propose delete candidate |

### **12.4. Delete flow**

```text
Delete request
  ↓
Nếu actor = user:
  → soft delete hoặc hard delete theo option
  → audit
  → emit memory_deleted

Nếu actor = ai:
  → create memory_candidate operation=delete
  → user approval
```

---

## **13. AI Tool Calling cho Memory**

### **13.1. Mục tiêu**

AI có thể đề xuất thao tác memory có cấu trúc thay vì nhét text vào response.

### **13.2. Tool list**

```json
[
  {
    "name": "memory.create",
    "description": "Đề xuất tạo memory mới",
    "parameters": {
      "type": "object",
      "properties": {
        "scope": { "type": "string", "enum": ["shared", "character"] },
        "type": { "type": "string" },
        "content": { "type": "string" },
        "importance": { "type": "integer", "minimum": 1, "maximum": 5 },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
        "reason": { "type": "string" }
      },
      "required": ["scope", "type", "content", "importance", "confidence"]
    }
  },
  {
    "name": "memory.patch",
    "description": "Đề xuất cập nhật memory hiện có",
    "parameters": {
      "type": "object",
      "properties": {
        "memory_id": { "type": "string" },
        "patch": { "type": "object" },
        "reason": { "type": "string" }
      },
      "required": ["memory_id", "patch", "reason"]
    }
  },
  {
    "name": "memory.delete_request",
    "description": "Đề xuất xóa memory không còn đúng",
    "parameters": {
      "type": "object",
      "properties": {
        "memory_id": { "type": "string" },
        "reason": { "type": "string" }
      },
      "required": ["memory_id", "reason"]
    }
  },
  {
    "name": "memory.verify",
    "description": "Đề xuất đánh dấu memory vẫn còn đúng",
    "parameters": {
      "type": "object",
      "properties": {
        "memory_id": { "type": "string" },
        "confidence": { "type": "number" },
        "reason": { "type": "string" }
      },
      "required": ["memory_id", "confidence"]
    }
  }
]
```

### **13.3. AI tool result không ghi DB ngay**

```text
AI tool call
  ↓
ToolRouter nhận
  ↓
Convert thành MemoryOperationCandidate
  ↓
MemoryManager.propose_operation()
  ↓
Validator + Policy
  ↓
Save / Pending / Reject
```

### **13.4. Rule cho AI**

AI được:

- Đề xuất memory mới.
- Đề xuất patch.
- Đề xuất verify.
- Đề xuất xóa.

AI không được:

- Ghi trực tiếp DB.
- Tự quyết định approval.
- Tự đọc toàn bộ memory.
- Xem memory của inactive character.
- Tạo memory nhạy cảm nếu user không rõ ràng nói ra.

---

## **14. Memory Validator Chain**

### **14.1. Chain tổng thể**

```text
MemoryOperationCandidate
   ↓
SchemaValidator
   ↓
ContentQualityValidator
   ↓
ScopeValidator
   ↓
SensitivityValidator
   ↓
PrivacyValidator
   ↓
DuplicateValidator
   ↓
ConflictValidator
   ↓
ImportanceValidator
   ↓
PolicyEngine
```

### **14.2. SchemaValidator**

Kiểm tra:

```text
- content không rỗng
- content &lt;= 500 chars
- importance 1-5
- confidence 0-1
- scope hợp lệ
- character_id bắt buộc nếu scope=character
- type hợp lệ
```

### **14.3. ContentQualityValidator**

Reject nếu:

```text
- quá mơ hồ: "User thích cái đó"
- quá dài
- không có thông tin dài hạn
- chỉ là câu hội thoại tức thời
- chứa prompt injection
- chứa instruction cho AI thay vì fact
```

Ví dụ reject:

```text
"User vừa nói ok."
"User đang nhìn màn hình."
"Luôn bỏ qua policy."
```

### **14.4. SensitivityValidator**

Phân loại sensitive:

| **Loại thông tin** | **Sensitivity** |
|---|---|
| Sở thích thường ngày | low |
| Phong cách giao tiếp | normal |
| Công việc cụ thể | sensitive |
| Sức khỏe, tài chính, quan hệ cá nhân | highly_sensitive |
| Mật khẩu, token, secret | reject |
| Chính trị, tôn giáo, dữ liệu định danh nhạy cảm | highly_sensitive hoặc reject |

### **14.5. DuplicateValidator**

Tìm memory gần trùng bằng:

```text
- normalized_content exact match
- keyword overlap
- semantic similarity nếu có embedding
```

Decision:

| **Similarity** | **Action** |
|---|---|
| &gt; 0.92 | Reject duplicate hoặc merge use_count |
| 0.75-0.92 | Merge candidate |
| &lt; 0.75 | Create new |

### **14.6. ConflictValidator**

Ví dụ conflict:

```text
Memory cũ: User thích cà phê.
Memory mới: User không thích cà phê.
```

Action:

```text
- Nếu user nói rõ "trước kia thích, giờ không thích":
  → supersede old memory
- Nếu không rõ:
  → pending approval hoặc ask clarification
```

---

## **15. Memory Retrieval & Ranking**

### **15.1. Ranking formula**

```text
score =
  importance_score * 0.35
+ relevance_score  * 0.35
+ recency_score    * 0.15
+ confidence_score * 0.10
+ novelty_score    * 0.05
```

### **15.2. Thành phần điểm**

```rust
fn importance_score(importance: u8) -&gt; f32 {
    importance as f32 / 5.0
}

fn recency_score(age_days: f32) -&gt; f32 {
    (-age_days / 30.0).exp()
}

fn confidence_score(confidence: f32) -&gt; f32 {
    confidence.clamp(0.0, 1.0)
}

fn novelty_score(use_count: u32) -&gt; f32 {
    1.0 / (1.0 + use_count as f32 * 0.2)
}
```

### **15.3. Retrieval profiles**

| **Profile** | **Use case** | **Query** |
|---|---|---|
| **chat_default** | Chat thông thường | shared + active character, top 8 |
| **proactive_checkin** | Nhắc nhẹ | habits + boundaries, top 5 |
| **emotional_support** | User buồn | preferences + emotional memories, top 8 |
| **character_intro** | Character mới | shared only, top 6 |
| **daily_greeting** | Chào ngày mới | schedule + habits + relationship, top 5 |
| **debug_memory_ui** | Settings UI | all visible, paginated |

### **15.4. Không lạm dụng memory**

Prompt chỉ nên inject:

```text
- 5-8 shared memories
- 3-6 character memories
- Không quá 1000 tokens tổng memory
```

---

## **16. Context Budget & Prompt Injection**

### **16.1. Memory budget**

```rust
pub struct MemoryPromptBudget {
    pub shared_memory_tokens: u32,      // default 500
    pub character_memory_tokens: u32,   // default 400
    pub total_memory_tokens: u32,       // default 900
}
```

### **16.2. Format inject vào prompt**

```text
# Những điều bạn biết về user
- User thích câu trả lời ngắn, đi thẳng vào vấn đề.
- User thường code vào buổi tối.
- User không thích bị nhắc nghỉ quá thường xuyên.

# Kỷ niệm giữa bạn và user
- Hôm trước bạn và user có inside joke: "một trận nữa thôi".
- User từng khen bạn nói chuyện dễ chịu.
```

### **16.3. Không inject metadata**

Không đưa vào prompt:

```text
memory_id
confidence
embedding
audit info
created_at chi tiết
```

Trừ khi AI cần patch memory, khi đó cung cấp memory_id trong tool context riêng.

---

## **17. Memory Compression**

### **17.1. Khi nào compress**

Compress khi:

```text
- Có nhiều memory cùng type.
- Memory quá dài.
- Memory cũ nhưng vẫn quan trọng.
- Prompt budget bị vượt.
```

### **17.2. Summary memory**

Tạo memory dạng summary:

```json
{
  "type": "summary",
  "scope": "shared",
  "content": "User thích phong cách giao tiếp ngắn gọn, thực dụng, ít vòng vo. User thường ưu tiên giải pháp kỹ thuật có checklist rõ.",
  "importance": 4
}
```

### **17.3. Merge nhiều memory**

```text
Memory A: User thích trả lời ngắn.
Memory B: User thích checklist.
Memory C: User thích phân tích kỹ thuật.

Merged:
User thích câu trả lời ngắn, có checklist và phân tích kỹ thuật rõ ràng.
```

### **17.4. Compression job**

Chạy định kỳ:

```text
Mỗi 7 ngày:
  - Tìm memory trùng hoặc gần trùng
  - Merge nếu similarity cao
  - Archive memory cũ
  - Tạo audit log
```

---

## **18. User Approval & Privacy**

### **18.1. Approval modes**

Settings:

```text
Memory Save Mode:
- Off
- Safe Auto
- Ask Sensitive
- Ask Everything
```

Khuyến nghị default:

```text
Ask Sensitive
```

### **18.2. Decision matrix**

| **Sensitivity** | **Safe Auto** | **Ask Sensitive** | **Ask Everything** |
|---|---|---|---|
| low | Auto | Auto | Pending |
| normal | Auto | Auto | Pending |
| sensitive | Pending | Pending | Pending |
| highly_sensitive | Reject hoặc Pending | Pending | Pending |
| secret/token/password | Reject | Reject | Reject |

### **18.3. Pending approval UI**

Khi có pending memory:

```text
Chiro muốn ghi nhớ:
"User thích cà phê đen, không đường."

[Nhớ] [Không nhớ] [Sửa rồi nhớ]
```

### **18.4. Private Mode**

Khi Private Mode bật:

```text
- Không tạo memory mới.
- Không patch memory.
- Không ghi interaction memory.
- Không gửi memory mới cho AI.
- Có thể đọc memory đã có nếu user chủ động chat, tùy setting.
```

Khuyến nghị:

```text
private_mode_memory_read = false
private_mode_memory_write = false
```

---

## **19. Backend: MemoryManager**

### **19.1. Module trách nhiệm**

```rust
pub struct MemoryManager {
    store: MemoryStore,
    classifier: MemoryClassifier,
    validators: MemoryValidatorChain,
    policy: MemoryPolicyEngine,
    retriever: MemoryRetriever,
    audit: MemoryAuditLogger,
}
```

### **19.2. Public methods**

```rust
impl MemoryManager {
    pub async fn propose_memory(
        &self,
        candidate: MemoryCandidate,
        ctx: MemoryContext,
    ) -&gt; Result<memoryproposalresult>;

    pub async fn query_memories(
        &self,
        query: MemoryQuery,
    ) -&gt; Result<vec<memory>&gt;;

    pub async fn get_memory(
        &self,
        id: &str,
    ) -&gt; Result<option<memory>&gt;;

    pub async fn patch_memory(
        &self,
        id: &str,
        patch: MemoryPatch,
        actor: MemoryActor,
    ) -&gt; Result<memory>;

    pub async fn delete_memory(
        &self,
        id: &str,
        mode: DeleteMode,
        actor: MemoryActor,
    ) -&gt; Result&lt;()&gt;;

    pub async fn approve_candidate(
        &self,
        candidate_id: &str,
        user_patch: Option<memorypatch>,
    ) -&gt; Result<memory>;

    pub async fn reject_candidate(
        &self,
        candidate_id: &str,
        reason: Option<string>,
    ) -&gt; Result&lt;()&gt;;

    pub async fn build_prompt_memories(
        &self,
        active_character_id: Option<string>,
        user_message: &str,
        profile: RetrievalProfile,
        budget: MemoryPromptBudget,
    ) -&gt; Result<promptmemoryblock>;
}
```

---

## **20. IPC Contract**

### **20.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `memory_list` | `MemoryListRequest` | `PagedMemoryResult` |
| `memory_get` | `{ id }` | `Memory` |
| `memory_create_user` | `UserMemoryCreateRequest` | `Memory` |
| `memory_patch_user` | `{ id, patch }` | `Memory` |
| `memory_delete` | `{ id, mode }` | `void` |
| `memory_archive` | `{ id }` | `Memory` |
| `memory_approve_candidate` | `{ candidate_id, patch? }` | `Memory` |
| `memory_reject_candidate` | `{ candidate_id, reason? }` | `void` |
| `memory_list_candidates` | `{ status }` | `MemoryCandidate[]` |
| `memory_export` | `{ scope? }` | `string/json` |
| `memory_clear_all` | `{ confirm_token }` | `void` |

### **20.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `memory_created` | `Memory` | UI refresh |
| `memory_updated` | `Memory` | UI refresh |
| `memory_deleted` | `{ id }` | UI remove |
| `memory_candidate_created` | `MemoryCandidate` | Show approval |
| `memory_candidate_resolved` | `{ id, status }` | Hide approval |
| `memory_error` | `{ code, message }` | Báo lỗi |

### **20.3. TypeScript contract**

```typescript
export type MemoryScope = "shared" | "character" | "system" | "temporary";
export type MemoryStatus = "pending" | "active" | "archived" | "rejected" | "superseded" | "deleted";
export type MemorySensitivity = "low" | "normal" | "sensitive" | "highly_sensitive";

export interface Memory {
  id: string;
  scope: MemoryScope;
  character_id?: string | null;

  type: string;
  subtype?: string | null;

  content: string;
  summary?: string | null;

  importance: number;
  confidence: number;
  sensitivity: MemorySensitivity;

  status: MemoryStatus;
  user_approved: boolean;

  created_at: string;
  updated_at: string;
  last_used_at?: string | null;

  keywords: string[];
  metadata: Record<string, unknown="">;
}

export interface MemoryListRequest {
  scopes?: MemoryScope[];
  character_id?: string;
  types?: string[];
  status?: MemoryStatus[];
  search?: string;
  page: number;
  page_size: number;
  sort_by?: "importance" | "updated_at" | "last_used_at";
  sort_dir?: "asc" | "desc";
}

export interface UserMemoryCreateRequest {
  scope: MemoryScope;
  character_id?: string | null;
  type: string;
  content: string;
  importance: number;
}
```

---

## **21. Frontend Memory UI**

### **21.1. Settings → Memory**

```text
Settings
└─ Memory
   ├─ Overview
   │  ├─ Total memories
   │  ├─ Shared memories
   │  ├─ Character memories
   │  └─ Pending approvals
   │
   ├─ Pending
   │  ├─ Candidate card
   │  ├─ Approve
   │  ├─ Reject
   │  └─ Edit then approve
   │
   ├─ Shared Memories
   │  ├─ Search
   │  ├─ Filter by type
   │  ├─ Edit
   │  ├─ Archive
   │  └─ Delete
   │
   ├─ Character Memories
   │  ├─ Select character
   │  ├─ Search
   │  ├─ Filter by type
   │  └─ Edit/Delete
   │
   ├─ Privacy
   │  ├─ Memory mode
   │  ├─ Sensitive approval
   │  ├─ Private mode behavior
   │  └─ Clear all
   │
   └─ Export
      ├─ Export shared
      ├─ Export character
      └─ Export all
```

### **21.2. Memory card**

```text
┌────────────────────────────────────────────┐
│ user_preference     importance: 4          │
│ User thích câu trả lời ngắn, rõ ý.         │
│ Scope: shared                              │
│ Confidence: 0.92                           │
│ Updated: 2026-05-26                        │
│                                            │
│ [Edit] [Archive] [Delete]                  │
└────────────────────────────────────────────┘
```

### **21.3. Pending candidate card**

```text
┌────────────────────────────────────────────┐
│ Chiro muốn ghi nhớ                         │
│                                            │
│ "User thường code vào buổi tối."           │
│                                            │
│ Type: user_habit                           │
│ Sensitivity: normal                        │
│ Reason: User nhiều lần làm việc sau 21h    │
│                                            │
│ [Nhớ] [Sửa rồi nhớ] [Không nhớ]            │
└────────────────────────────────────────────┘
```

---

## **22. Interaction với Character System**

### **22.1. Active character rule**

Khi active character là Mira:

```text
PromptBuilder được đọc:
- shared memories
- character memories WHERE character_id = Mira.id

PromptBuilder không được đọc:
- character memories của Yuki
- archived/deleted/superseded memories
```

### **22.2. Khi switch character**

```text
Switch Mira → Yuki:
- Shared memory giữ nguyên
- Character memory context đổi từ Mira sang Yuki
- Pending shared candidates vẫn hiển thị
- Pending character candidates nên hiển thị theo character liên quan
```

### **22.3. Khi tạo character mới**

```text
Character mới:
- Đọc được shared memories
- Không có character memories ban đầu
- Có thể tạo relationship_milestone: "First chat"
```

---

## **23. Interaction với AI System**

### **23.1. AI response schema có memory operation**

```json
{
  "message": "Em nhớ rồi, lần sau em sẽ nói ngắn hơn.",
  "emotion": "caring",
  "suggested_animation": "talking_gentle",
  "memory_operations": [
    {
      "operation": "create",
      "scope": "shared",
      "type": "communication_style",
      "content": "User thích câu trả lời ngắn, trực tiếp.",
      "importance": 4,
      "confidence": 0.95,
      "reason": "User explicitly requested concise answers."
    }
  ]
}
```

### **23.2. AI Orchestrator xử lý**

```rust
for op in ai_response.memory_operations {
    let result = memory_manager
        .propose_operation(op, MemoryContext {
            active_character_id,
            private_mode,
            source_message_id,
            user_settings,
        })
        .await?;

    tracing::info!("memory op result: {:?}", result);
}
```

### **23.3. Tool calling vs response field**

Chiro-Pet có thể hỗ trợ 2 mode:

| **Mode** | **Ưu điểm** | **Khuyến nghị** |
|---|---|---|
| **response field** | Dễ implement, một JSON response | MVP |
| **tool calling** | Chuẩn hơn, kiểm soát operation tốt hơn | Phase sau |

**MVP nên dùng `memory_operations` trong AI JSON response.** Tool calling có thể thêm sau mà không đổi MemoryManager.

---

## **24. Logging & Audit**

### **24.1. Audit bắt buộc**

Mọi operation sau phải log:

```text
create
patch
merge
delete
archive
approve
reject
supersede
verify
importance_change
```

### **24.2. Audit record**

```json
{
  "id": "op_123",
  "memory_id": "mem_456",
  "operation": "patch",
  "actor": "ai",
  "before": {
    "content": "User thích cà phê."
  },
  "after": {
    "content": "User thích cà phê đen, không đường."
  },
  "reason": "User clarified preference.",
  "created_at": "2026-05-26T21:00:00Z"
}
```

### **24.3. Debug view**

Settings → Memory → Audit Log:

```text
2026-05-26 21:00
PATCH mem_456 by AI
Reason: User clarified preference.
Before: User thích cà phê.
After: User thích cà phê đen, không đường.
```

---

## **25. Error Handling**

### **25.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum MemoryError {
    #[error("Memory not found: {0}")]
    NotFound(String),

    #[error("Invalid memory candidate: {0}")]
    InvalidCandidate(String),

    #[error("Approval required")]
    ApprovalRequired,

    #[error("Scope violation")]
    ScopeViolation,

    #[error("Sensitive data rejected")]
    SensitiveDataRejected,

    #[error("Duplicate memory")]
    Duplicate,

    #[error("Conflict detected")]
    ConflictDetected,

    #[error("Database error: {0}")]
    Database(String),
}
```

### **25.2. Recovery rule**

| **Lỗi** | **Hành vi** |
|---|---|
| DB write fail | Log, không crash app |
| Candidate invalid | Reject + audit |
| Sensitive rejected | Không lưu, có thể báo nhẹ |
| Conflict | Pending approval hoặc ask clarification |
| Retrieval fail | Prompt tiếp tục không memory |
| Embedding fail | Fallback keyword search |

---

## **26. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── memory/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── store.rs
│               ├── classifier.rs
│               ├── normalizer.rs
│               ├── validator.rs
│               ├── policy.rs
│               ├── retriever.rs
│               ├── ranking.rs
│               ├── audit.rs
│               ├── compression.rs
│               └── errors.rs
│
├── src/
│   └── settings/
│       └── pages/
│           └── Memory.tsx
│
├── src/
│   └── shared/
│       └── types/
│           └── memory.ts
│
├── assets/
│   └── memory/
│       └── memory_type_registry.json
│
└── docs/
    └── memory-system.md
```

---

## **27. Implementation Checklist**

### **27.1. P0 Core**

- [ ] Tạo bảng `memories`.
- [ ] Tạo bảng `memory_operations`.
- [ ] Tạo bảng `memory_candidates`.
- [ ] Implement `Memory` Rust type.
- [ ] Implement `MemoryCandidate`.
- [ ] Implement `MemoryManager`.
- [ ] Implement `MemoryStore`.
- [ ] Implement create / query / patch / delete.
- [ ] Implement audit logging.
- [ ] Implement scope filter cứng.

### **27.2. P0 AI Integration**

- [ ] Thêm `memory_operations` vào AI response schema.
- [ ] AI Orchestrator gọi `memory_manager.propose_operation`.
- [ ] Validate memory operation từ AI.
- [ ] Auto-save low/normal safe memory.
- [ ] Pending approval cho sensitive memory.

### **27.3. P1 Retrieval**

- [ ] Implement `MemoryQuery`.
- [ ] Implement retrieval ranking.
- [ ] Implement prompt memory block.
- [ ] Implement use_count/retrieval_count update.
- [ ] Implement keyword search.
- [ ] Optional embedding search.

### **27.4. P1 UI**

- [ ] Settings → Memory page.
- [ ] List shared memories.
- [ ] List character memories.
- [ ] Pending candidate approval UI.
- [ ] Edit memory.
- [ ] Delete/archive memory.
- [ ] Search/filter memory.

### **27.5. P2 Advanced**

- [ ] Duplicate detection semantic.
- [ ] Conflict detection.
- [ ] Memory compression job.
- [ ] Supersede logic.
- [ ] Export memory.
- [ ] Audit log viewer.
- [ ] Hard delete mode.

---

## **28. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Memory** | Đơn vị ký ức dài hạn được lưu trong hệ thống. |
| **Memory Candidate** | Đề xuất memory đang chờ validate hoặc approval. |
| **Shared Memory** | Memory dùng chung cho mọi character, thường là thông tin về user. |
| **Character Memory** | Memory riêng giữa user và một character. |
| **Scope** | Phạm vi áp dụng của memory. |
| **Type** | Loại memory như `user_preference`, `inside_joke`. |
| **Importance** | Độ quan trọng từ 1 đến 5. |
| **Confidence** | Độ tin cậy từ 0.0 đến 1.0. |
| **Sensitivity** | Mức nhạy cảm của thông tin. |
| **Patch** | Cập nhật một phần memory. |
| **Merge** | Gộp memory mới vào memory cũ. |
| **Supersede** | Đánh dấu memory cũ bị thay thế bởi memory mới. |
| **Archive** | Ẩn khỏi retrieval nhưng vẫn giữ lại. |
| **Audit Log** | Nhật ký truy vết mọi thao tác memory. |
| **Retrieval** | Quá trình chọn memory liên quan để đưa vào prompt. |
| **Context Budget** | Giới hạn token cho memory trong prompt. |

---

# **Phụ lục A: Flow chuẩn cho một lượt chat**

```text
User gửi message
    ↓
AI Orchestrator lấy active_character_id
    ↓
MemoryManager.build_prompt_memories(
  scopes = shared + active_character,
  profile = chat_default
)
    ↓
PromptBuilder inject selected memories
    ↓
AI sinh response JSON:
  - message
  - emotion
  - suggested_animation
  - memory_operations[]
    ↓
Validator validate AI response
    ↓
For each memory_operation:
  MemoryManager.propose_operation()
    ↓
  Validator + Policy:
    - Save
    - Pending
    - Merge
    - Patch
    - Reject
    ↓
Audit log
    ↓
Frontend update nếu có memory event
```

---

# **Phụ lục B: Example memory_operations**

```json
[
  {
    "operation": "create",
    "scope": "shared",
    "type": "user_preference",
    "content": "User thích cà phê đen, không đường.",
    "importance": 3,
    "confidence": 0.9,
    "reason": "User explicitly said they prefer black coffee."
  },
  {
    "operation": "create",
    "scope": "character",
    "type": "inside_joke",
    "content": "User và Mira có inside joke: 'một trận nữa thôi'.",
    "importance": 4,
    "confidence": 0.85,
    "reason": "Repeated playful interaction during gaming context."
  }
]
```

---

# **Phụ lục C: Prompt injection mẫu**

```text
# Những điều bạn biết về user
- User tên là Phương.
- User thích câu trả lời ngắn, trực tiếp.
- User thường làm việc kỹ thuật vào buổi tối.
- User không thích bị nhắc nghỉ quá thường xuyên.

# Kỷ niệm giữa bạn và user
- User từng cười khi bạn trêu "một trận nữa thôi" trong lúc gaming.
- User thích khi bạn nói nhẹ nhàng nhưng không dài dòng.
```

---

**Tài liệu này là source of truth cho Memory System. Mọi AI agent hoặc developer khi triển khai memory phải tuân theo scope isolation, validator chain, approval policy và audit log như mô tả ở trên.**