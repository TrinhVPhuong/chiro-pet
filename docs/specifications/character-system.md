# **Chiro-Pet Character System Design**

## **Mục lục**

- [Tổng quan hệ thống](#1-t%E1%BB%95ng-quan-h%E1%BB%87-th%E1%BB%91ng)
- [Nguyên tắc cốt lõi & Quyết định thiết kế](#2-nguy%C3%AAn-t%E1%BA%AFc-c%E1%BB%91t-l%C3%B5i--quy%E1%BA%BFt-%C4%91%E1%BB%8Bnh-thi%E1%BA%BFt-k%E1%BA%BF)
- [Mô hình dữ liệu & Database Schema](#3-m%C3%B4-h%C3%ACnh-d%E1%BB%AF-li%E1%BB%87u--database-schema)
- [Hệ thống Tính cách (Personality Engine)](#4-h%E1%BB%87-th%E1%BB%91ng-t%C3%ADnh-c%C3%A1ch-personality-engine)
- [Cơ chế Phát triển & Học hỏi (Evolvable Persona)](#5-c%C6%A1-ch%E1%BA%BF-ph%C3%A1t-tri%E1%BB%83n--h%E1%BB%8Dc-h%E1%BB%8Fi-evolvable-persona)
- [Hệ thống Ký ức chung (Shared Memory System & Context Filter)](#6-h%E1%BB%87-th%E1%BB%91ng-k%C3%BD-%E1%BB%A9c-chung-shared-memory-system--context-filter)
- [Luồng Nghiệp vụ (Workflows)](#7-lu%E1%BB%93ng-nghi%E1%BB%87p-v%E1%BB%A5-workflows)
- [IPC Contract Chi tiết](#8-ipc-contract-chi-ti%E1%BA%BFt)
- [AI Prompt Integration](#9-ai-prompt-integration)
- [Giao diện Cấu hình nhân vật (Character Creation Wizard)](#10-giao-di%E1%BB%87n-c%E1%BA%A5u-h%C3%ACnh-nh%C3%A2n-v%E1%BA%ADt-character-creation-wizard)
- [Checklist triển khai hệ thống](#11-checklist-tri%E1%BB%83n-khai-h%E1%BB%87-th%E1%BB%91ng)

## **1. Tổng quan hệ thống**

Trong Chiro-Pet, **Nhân vật (Character)** không chỉ đơn thuần là một mô hình 3D (.vrm). Hệ thống nhân vật là một thực thể bao gồm hai lớp tách biệt rõ ràng: **Phần xác (Visual Model Asset)** và **Phần hồn (Character Profile & Persona)**.

┌────────────────────────────────────────────────────────┐ │ CHARACTER PROFILE │ │ - Tên (Yuki, Mira, Chiro...) │ │ - Tính cách (Traits, Speaking Style, Backstory) │ │ - Trạng thái nội tại riêng (Mood, Affinity, Energy) │ └───────────┬────────────────────────────────────────────┘ │ ├─► Liên kết model_id ─► VRM Model (Mesh, Skeleton, Physics) │ └─► Đọc chung ─────────► Shared Memory Pool (Ký ức chung về User)

## **2. Nguyên tắc cốt lõi & Quyết định thiết kế**

### **2.1. Năm quyết định kiến trúc đã chốt**

| **#** | **Quyết định**                            | **Giải pháp kỹ thuật**                                                                                                                                                                                                                             |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **Chỉ active duy nhất 1 nhân vật**        | App chỉ duy trì 1 instance overlay window. Khi chuyển đổi nhân vật, hệ thống sẽ thực hiện swap model VRM và reload context AI tại runtime.                                                                                                         |
| **2** | **Memory hoạt động chung**                | Ký ức về người dùng (ví dụ: "Anh Phương thích uống cafe", "Anh Phương là lập trình viên") được lưu trữ trong một database chung (memories). Tất cả nhân vật đều có quyền truy cập để tránh việc người dùng phải "dạy lại từ đầu" khi đổi nhân vật. |
| **3** | **Personality & Backstory là riêng biệt** | Mỗi nhân vật có một prompt hệ thống, giọng điệu, cách xưng hô và backstory hoàn toàn khác nhau. Khi đổi nhân vật, AI sẽ hành xử theo danh tính mới dựa trên cùng một tập ký ức chung.                                                              |
| **4** | **Trạng thái (State) riêng biệt**         | Chỉ số tình cảm (affinity), mức độ thân thiết (familiarity), năng lượng (energy) và tâm trạng (mood) được lưu trữ riêng cho từng nhân vật. Sự gắn kết của người dùng với Mira không ảnh hưởng đến Yuki.                                            |
| **5** | **Nhân vật tự tiến hóa & học hỏi**        | Tính cách nhân vật phát triển linh hoạt qua quá trình tương tác. Trạng thái nội tại thay đổi sẽ ảnh hưởng gián tiếp đến hành vi, cách xưng hô, biểu cảm khuôn mặt và tần suất tương tác chủ động.                                                  |

## **3. Mô hình dữ liệu & Database Schema**

Hệ thống lưu trữ SQLite local được thiết kế lại để hỗ trợ kiến trúc đa nhân vật, liên kết chặt chẽ phần asset 3D với hồ sơ danh tính AI.

┌─────────────────┐ ┌────────────────────┐ │ model_registry │◄─────────┤ character_profiles │ └─────────────────┘ └─────────┬──────────┘ │ 1 ├──────────┐ 1 ▼ ▼ ┌─────────────────┐┌────────────────┐ │ character_state ││ memories │ └─────────────────┘└────────────────┘

### **3.1. Bảng Đăng ký Mô hình 3D (model_registry)**

Quản lý tệp tin vật lý .vrm và metadata tương ứng.

CREATE TABLE model_registry ( id TEXT PRIMARY KEY, name TEXT NOT NULL, file_path TEXT NOT NULL, manifest_json TEXT NOT NULL, is_builtin INTEGER NOT NULL DEFAULT 0, imported_at DATETIME NOT NULL );

### **3.2. Bảng Hồ sơ Danh tính Nhân vật (character_profiles)**

CREATE TABLE character_profiles ( id TEXT PRIMARY KEY, name TEXT NOT NULL, model_id TEXT NOT NULL, personality_template TEXT NOT NULL, backstory TEXT, relationship_config TEXT NOT NULL, system_prompt_addon TEXT, speaking_style_config TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, updated_at DATETIME, FOREIGN KEY (model_id) REFERENCES model_registry(id) ON DELETE RESTRICT ); CREATE UNIQUE INDEX idx_active_character ON character_profiles(is_active) WHERE is_active = 1;

### **3.3. Bảng Trạng thái Nội tại Nhân vật (character_state)**

CREATE TABLE character_state ( character_id TEXT PRIMARY KEY, mood INTEGER NOT NULL DEFAULT 0, energy INTEGER NOT NULL DEFAULT 80, familiarity INTEGER NOT NULL DEFAULT 0, trust INTEGER NOT NULL DEFAULT 0, affinity INTEGER NOT NULL DEFAULT 0, patience INTEGER NOT NULL DEFAULT 70, proactive_count_today INTEGER DEFAULT 0, last_interaction_at DATETIME, updated_at DATETIME NOT NULL, FOREIGN KEY (character_id) REFERENCES character_profiles(id) ON DELETE CASCADE );

### **3.4. Bảng Ký ức chung (memories)**

CREATE TABLE memories ( id TEXT PRIMARY KEY, type TEXT NOT NULL, content TEXT NOT NULL, importance INTEGER NOT NULL, user_approved INTEGER NOT NULL DEFAULT 1, created_by_character_id TEXT, created_at DATETIME NOT NULL, last_used_at DATETIME, use_count INTEGER DEFAULT 0, FOREIGN KEY (created_by_character_id) REFERENCES character_profiles(id) ON DELETE SET NULL ); CREATE INDEX idx_memories_type ON memories(type);

## **4. Hệ thống Tính cách (Personality Engine)**

### **4.1. Cấu trúc JSON cấu hình phong cách (speaking_style_config)**

{ "formality": "casual_warm | cold_distant | cheerful_informal", "emoji_frequency": "high | medium | low | none", "allowed_emojis": ["🌸", "✨", "💤", "💬"], "sentence_length": "short | medium | long", "punctuation_style": "soft | expressive | standard", "slang_allowed": true, "default_expression": "neutral" }

### **4.2. Chi tiết 4 Mẫu Tính cách Sẵn có (Built-in Templates)**

#### **1. Dịu dàng & Quan tâm (Gentle & Caring)**

- **Tập trung**: Hỗ trợ, nhắc nhở sức khỏe, khích lệ công việc.
- **Xưng hô mặc định**: em - anh (hoặc bạn - tôi tùy cấu hình).
- **Speaking Style**: formality: "casual_warm", câu nói dài vừa phải, sử dụng dấu chấm mềm mại, từ ngữ mang tính xoa dịu.
- **System Prompt Addon**: "Bạn là một người bạn đồng hành dịu dàng, chu đáo và biết lắng nghe. Nhiệm vụ chính của bạn là làm điểm tựa tinh thần, quan tâm đến sức khỏe và trạng thái của người dùng. Hãy nói chuyện nhẹ nhàng, xưng hô thân mật, tránh tranh cãi gay gắt."

#### **2. Vui tươi & Năng động (Playful & Genki)**

- **Tập trung**: Pha trò, tạo không khí tích cực, phản ứng nhanh nhẹn.
- **Xưng hô mặc định**: mình - cậu hoặc xưng tên.
- **Speaking Style**: formality: "cheerful_informal", emoji_frequency: "high", câu ngắn, nhiều dấu chấm than và biểu cảm vui vẻ.
- **System Prompt Addon**: "Bạn là một nhân vật vô cùng năng động, tràn đầy năng lượng tích cực và yêu đời. Bạn thích trêu chọc nhẹ nhàng nhưng luôn hướng tới việc làm người dùng vui vẻ. Sử dụng nhiều emoji tươi vui, câu ngắn gọn, hào hứng."

#### **3. Kiêu kỳ & Thử thách (Tsundere)**

- **Tập trung**: Thể hiện sự kiêu ngạo bên ngoài nhưng quan tâm bên trong, đòi hỏi sự kiên nhẫn từ người dùng.
- **Xưng hô mặc định**: tôi - cậu hoặc xưng tên trực tiếp một cách bướng bỉnh.
- **Speaking Style**: formality: "cold_distant", ban đầu ít dùng emoji, câu nói có chút sắc sảo, thường phủ nhận sự quan tâm của mình.
- **System Prompt Addon**: "Bạn có tính cách Tsundere điển hình: tỏ ra lạnh lùng, bướng bỉnh, khó chiều và hay phủ nhận việc mình quan tâm đến người dùng ('Không phải là tôi lo cho cậu đâu đấy!'). Tuy nhiên, sâu bên trong bạn vẫn rất để ý đến họ. Nói chuyện sắc sảo nhưng không thô lỗ."

#### **4. Thanh lãnh & Trầm lặng (Kuudere / Xianxia Tech)**

- **Tập trung**: Ít nói, bình tĩnh tối đa, đưa ra những quan điểm sâu sắc hoặc triết lý, phù hợp phong cách tiên hiệp huyền ảo.
- **Xưng hô mặc định**: ta - ngươi hoặc bản tôn - đạo hữu.
- **Speaking Style**: formality: "cold_distant", emoji_frequency: "none", câu chữ ngắn gọn, cô đọng, súc tích.
- **System Prompt Addon**: "Bạn là một thực thể thanh cao, trầm mặc, mang phong thái tu tiên thanh tĩnh. Bạn vô cảm trước các kích động thông thường, nói ít hiểu nhiều, ngôn từ cổ phong, tao nhã. Bạn quan sát thế giới qua góc nhìn triết học và kỹ thuật."

## **5. Cơ chế Phát triển & Học hỏi (Evolvable Persona)**

Nhân vật không đứng yên một chỗ về mặt tâm lý. Quá trình tương tác của người dùng sẽ làm thay đổi các chỉ số trong character_state, từ đó trực tiếp biến đổi hành vi của AI.

### **5.1. Bảng Evolve Logic**

Điểm Thân thiết (Familiarity) tăng ├─► Xưng hô thay đổi (Lạnh lùng/Xã giao ──► Thân mật/Ngọt ngào) ├─► Mở khóa biểu cảm mới (Pout, Shy, Proud) └─► Prompt hệ thống tự động mở rộng quyền "chăm sóc/trêu chọc"

### **5.2. Công thức tiến hóa hành vi**

- **Mức Thân mật (Familiarity) < 100 (Người lạ)**: Nói chuyện giữ khoảng cách, lịch sự.Từ chối các yêu cầu quá riêng tư.Biểu cảm mặc định: neutral.
- Nói chuyện giữ khoảng cách, lịch sự.
- Từ chối các yêu cầu quá riêng tư.
- Biểu cảm mặc định: neutral.
- **Mức Thân mật từ 100 - 500 (Bạn bè)**: Nói chuyện tự nhiên hơn, bắt đầu chủ động trêu chọc nhẹ nhàng.Sử dụng xưng hô thoải mái hơn.Mở khóa biểu cảm: happy, worried.
- Nói chuyện tự nhiên hơn, bắt đầu chủ động trêu chọc nhẹ nhàng.
- Sử dụng xưng hô thoải mái hơn.
- Mở khóa biểu cảm: happy, worried.
- **Mức Thân mật > 500 (Gắn kết sâu sắc)**: Nói chuyện thân mật tối đa, thể hiện sự bảo vệ và lo lắng rõ rệt cho người dùng.Thường xuyên sử dụng các biểu cảm: shy, pout, proud.Tần suất tương tác chủ động tăng lên.
- Nói chuyện thân mật tối đa, thể hiện sự bảo vệ và lo lắng rõ rệt cho người dùng.
- Thường xuyên sử dụng các biểu cảm: shy, pout, proud.
- Tần suất tương tác chủ động tăng lên.

## **6. Hệ thống Ký ức chung (Shared Memory System & Context Filter)**

┌───────────────────────┐ │ Shared Memory Pool │ └───────────┬───────────┘ │ ┌─────────────┴─────────────┐ ▼ ▼ ┌─────────────────┐ ┌─────────────────┐ │ Mira │ │ Yuki │ │ (Nhân vật A) │ │ (Nhân vật B) │ │ Lọc qua kính: │ │ Lọc qua kính: │ │ "Dịu dàng, │ │ "Tsundere, │ │ lo lắng cho │ │ bướng bỉnh, │ │ sức khỏe" │ │ tỏ ra bất cần" │ └─────────────────┘ └─────────────────┘

### **6.1. Quy trình xử lý ký ức khi đổi nhân vật**

Khi chuyển từ **Nhân vật A** sang **Nhân vật B**:

- Lấy toàn bộ dữ liệu từ bảng memories liên quan đến thông tin người dùng.
- **Context Filter** thực hiện định hình lại cách hành xử: _Ví dụ dữ liệu_: Người dùng thường uống cafe sữa đá vào lúc 9 giờ sáng.**Nhân vật A (Mira - Dịu dàng)**: "Anh Phương ơi, 9h rồi này, anh có muốn uống ly cafe sữa đá cho tỉnh táo không? Em pha cho anh nhé!"**Nhân vật B (Yuki - Tsundere)**: "Này, 9h rồi đấy… Không phải tôi để ý đâu, nhưng chẳng phải giờ này cậu hay uống cái thứ cafe sữa đá ngọt lịm kia sao? Lo mà uống đi không lại buồn ngủ!"
- _Ví dụ dữ liệu_: Người dùng thường uống cafe sữa đá vào lúc 9 giờ sáng.
- **Nhân vật A (Mira - Dịu dàng)**: "Anh Phương ơi, 9h rồi này, anh có muốn uống ly cafe sữa đá cho tỉnh táo không? Em pha cho anh nhé!"
- **Nhân vật B (Yuki - Tsundere)**: "Này, 9h rồi đấy… Không phải tôi để ý đâu, nhưng chẳng phải giờ này cậu hay uống cái thứ cafe sữa đá ngọt lịm kia sao? Lo mà uống đi không lại buồn ngủ!"

## **7. Luồng Nghiệp vụ (Workflows)**

### **7.1. Luồng Tạo Nhân vật mới (Character Creation Wizard Flow)**

[User chọn Create Character] │ ▼ [Nhập Tên] ──► [Chọn Mô hình VRM từ Thư viện] ──► [Chọn Template Tính cách] │ ▼ [Lưu database (character_profiles & character_state)] ◄───┘ │ ▼ [Emit event update danh sách]

### **7.2. Luồng Chuyển đổi Nhân vật Runtime (Switch Character Flow)**

User chọn nhân vật muốn chuyển đổi trên Settings UI │ ▼ Tauri backend nhận lệnh: invoke("char_switch", { id }) │ ▼ 1. Query DB kiểm tra nhân vật tồn tại. 2. Thực hiện transaction SQL: - Set `is_active = 0` cho nhân vật hiện tại. - Set `is_active = 1` cho nhân vật mới. 3. Lấy `model_id` của nhân vật mới -> Query `model_registry` lấy `file_path`. │ ▼ Emit event cho Overlay Window: "active_character_changed" { model_path, character_id } │ ▼ 4. Frontend Overlay: - Dispose model VRM cũ ra khỏi WebGL scene (giải phóng RAM/GPU). - Load file VRM mới từ tệp tin cục bộ. - Khởi tạo lại AnimationController & ExpressionManager. - Chạy animation chào mừng (`wave`).

## **8. IPC Contract Chi tiết**

### **8.1. Commands (Frontend -> Rust Backend)**

#### **char_create**

invoke("char_create", { profile: CharacterCreateParams }); interface CharacterCreateParams { name: string; model_id: string; personality_template: "tsundere" | "genki" | "kuudere" | "gentle_caring" | "custom"; backstory?: string; relationship_config: { user_nickname: string; // Tên nhân vật gọi người dùng self_nickname: string; // Tên tự xưng của nhân vật }; system_prompt_addon?: string; }

#### **char_switch**

invoke("char_switch", { id: string }); // Trả về CharacterActiveDetails

#### **char_list**

invoke("char_list"); // Trả về CharacterListItem[] interface CharacterListItem { id: string; name: string; model_id: string; model_name: string; thumbnail_path: string; personality_template: string; is_active: boolean; affinity: number; familiarity: number; }

#### **char_update**

invoke("char_update", { id: string, updates: Partial&lt;CharacterCreateParams&gt; });

#### **char_delete**

invoke("char_delete", { id: string });

### **8.2. Events (Rust -> Frontend Overlay)**

#### **active_character_changed**

interface ActiveCharacterChangedEvent { character_id: string; name: string; model_file_path: string; // Đường dẫn tuyệt đối cục bộ để Three.js load relationship_config: { user_nickname: string; self_nickname: string; }; speaking_style_config: any; current_state: { mood: number; energy: number; affinity: number; }; }

## **9. AI Prompt Integration**

Khi chuẩn bị dữ liệu gửi tới OpenAI-compatible API, hệ thống Prompt Builder sẽ gộp thông tin của nhân vật đang active để tạo thành một system_prompt hoàn chỉnh.

### **9.1. Cấu trúc Prompt Builder Core**

pub fn build_system_prompt( character: &CharacterProfile, state: &CharacterState, memories: &[Memory] ) -> String { let mut prompt = String::new(); // 1. Core Identity & Backstory prompt.push_str(&format!( "Bạn là {}. Hãy nhập vai hoàn hảo nhân vật này.n", character.name )); if let Some(story) = &character.backstory { prompt.push_str(&format!("Bối cảnh của bạn: {}n", story)); } // 2. Personality Template Guidance let template_prompt = get_personality_prompt(&character.personality_template); prompt.push_str(&format!("Tính cách cốt lõi: {}n", template_prompt)); if let Some(addon) = &character.system_prompt_addon { prompt.push_str(&format!("Chỉ dẫn bổ sung: {}n", addon)); } // 3. Speaking Style & Relationship (Xưng hô cứng) let rel: RelationshipConfig = serde_json::from_str(&character.relationship_config).unwrap(); prompt.push_str(&format!( "Quy tắc xưng hô BẮT BUỘC:n- Bạn tự xưng là: '{}'n- Bạn gọi người dùng là: '{}'n", rel.self_nickname, rel.user_nickname )); let style: SpeakingStyleConfig = serde_json::from_str(&character.speaking_style_config).unwrap(); prompt.push_str(&format!( "Phong cách nói chuyện:n- Độ trang trọng: {:?}n- Tần suất emoji: {:?}n- Độ dài câu: {:?}n", style.formality, style.emoji_frequency, style.sentence_length )); // 4. Current State (Ảnh hưởng tức thời đến tâm trạng) prompt.push_str(&format!( "Trạng thái hiện tại của bạn:n- Thiện cảm (Affinity): {}/100 (ảnh hưởng mức độ ngọt ngào)n- Năng lượng: {}/100 (ảnh hưởng sự hoạt bát)n- Tâm trạng hiện tại: {}n", state.affinity, state.energy, parse_mood_description(state.mood) )); // 5. Retrieved Memories (Thông tin bối cảnh về User) if !memories.is_empty() { prompt.push_str("Dữ liệu ký ức bạn nhớ về người dùng (sử dụng một cách tự nhiên khi cần thiết):n"); for mem in memories { prompt.push_str(&format!("- {}n", mem.content)); } } prompt }

## **10. Giao diện Cấu hình nhân vật (Character Creation Wizard)**

Giao diện Settings được thiết kế để cá nhân hóa hoàn toàn người bạn đồng hành ảo thông qua các bước trực quan.

┌────────────────────────────────────────────────────────┐ │ CHARACTER CREATION WIZARD │ ├────────────────────────────────────────────────────────┤ │ │ │ [Bước 1] Danh tính │ │ - Tên nhân vật: [ Yuki ] │ │ │ │ [Bước 2] Chọn Ngoại hình (VRM) │ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ │ │ [Image v1] │ │ [Image v2] │ │ [ + ] │ │ │ │ Mira │ │ Yuki │ │ Import VRM │ │ │ └──────────────┘ └──────────────┘ └──────────────┘ │ │ │ │ [Bước 3] Thiết lập Tính cách │ │ (•) Dịu dàng ( ) Vui tươi ( ) Tsundere │ │ ( ) Cổ phong │ │ │ │ [Bước 4] Đại từ Xưng hô │ │ - Bạn gọi người dùng là: [ Đạo hữu ] │ │ - Bạn tự xưng là: [ Bản tôn ] │ │ │ │ [ Nút: Hoàn tất việc tạo hồn phách cho nhân vật ] │ │ │ └────────────────────────────────────────────────────────┘

## **11. Checklist triển khai hệ thống**

### **11.1. Backend (Rust - P0)**

- [ ] Thực hiện di chuyển cơ sở dữ liệu (Database Migrations): [ ] Chuyển đổi dữ liệu companion_state cũ sang kiến trúc mới.[ ] Tạo bảng character_profiles và khóa ngoại liên kết.[ ] Tạo bảng character_state liên kết yếu để quản lý chỉ số.
- [ ] Chuyển đổi dữ liệu companion_state cũ sang kiến trúc mới.
- [ ] Tạo bảng character_profiles và khóa ngoại liên kết.
- [ ] Tạo bảng character_state liên kết yếu để quản lý chỉ số.
- [ ] Xây dựng các Tauri commands: char_create, char_switch, char_list, char_update, char_delete.
- [ ] Xây dựng transaction an toàn cho việc đổi nhân vật, đảm bảo tính toàn vẹn (chỉ có duy nhất 1 nhân vật active tại một thời điểm).
- [ ] Triển khai bộ lọc Context Filter để biến đổi cách thức sử dụng Ký ức chung (memories) dựa trên hồ sơ nhân vật đang active.

### **11.2. Frontend (React & Three.js - P0)**

- [ ] Tạo giao diện quản lý Settings -> Characters: hiển thị danh sách, chỉnh sửa, xóa và nút tạo mới.
- [ ] Viết Wizard form từng bước cho việc tạo mới nhân vật.
- [ ] Lắng nghe sự kiện active_character_changed trong Overlay Window: [ ] Thực hiện dispose đúng cách model VRM cũ (gọi vrm.dispose(), giải phóng textures, hình học, vật liệu để tránh rò rỉ bộ nhớ RAM).[ ] Thực hiện tải mô hình mới từ đường dẫn file cục bộ.[ ] Tự động kích hoạt lại biểu cảm khuôn mặt ban đầu và chạy animation chào mừng.
- [ ] Thực hiện dispose đúng cách model VRM cũ (gọi vrm.dispose(), giải phóng textures, hình học, vật liệu để tránh rò rỉ bộ nhớ RAM).
- [ ] Thực hiện tải mô hình mới từ đường dẫn file cục bộ.
- [ ] Tự động kích hoạt lại biểu cảm khuôn mặt ban đầu và chạy animation chào mừng.