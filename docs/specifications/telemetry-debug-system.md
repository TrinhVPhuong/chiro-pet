# **Chiro-Pet Telemetry Debug System**

> Tài liệu thiết kế chính thức cho **Telemetry Debug System** của **Chiro-Pet**.  
> Hệ thống này cung cấp lớp **quan sát, debug, profiling và inspection** cho toàn bộ app: **FPS**, **CPU/RAM/GPU**, **event monitor**, **AI logs**, **state inspector**, **memory inspector**, **animation debug overlay**, **IPC monitor**, **asset diagnostics**, **recovery timeline**.
>
> **Nguyên tắc lõi:** Telemetry Debug System là **local-first, opt-in, privacy-safe**. Không gửi telemetry ra server. Không ghi secret, raw desktop data, raw prompt hoặc API key. Debug data chỉ tồn tại local, có retention rõ ràng và có thể xóa/export bởi user.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Telemetry Debug Architecture](#3-telemetry-debug-architecture)
4. [Telemetry Types](#4-telemetry-types)
5. [Data Model](#5-data-model)
6. [Metrics System](#6-metrics-system)
7. [Logging System](#7-logging-system)
8. [Event Monitor](#8-event-monitor)
9. [IPC Monitor](#9-ipc-monitor)
10. [Performance Monitor](#10-performance-monitor)
11. [Renderer Debug Overlay](#11-renderer-debug-overlay)
12. [Animation Debug Tools](#12-animation-debug-tools)
13. [AI Debug Tools](#13-ai-debug-tools)
14. [State & Memory Inspector](#14-state--memory-inspector)
15. [Asset Debug Tools](#15-asset-debug-tools)
16. [Recovery Timeline](#16-recovery-timeline)
17. [Privacy & Redaction](#17-privacy--redaction)
18. [Retention & Storage](#18-retention--storage)
19. [Diagnostic Export](#19-diagnostic-export)
20. [Backend: TelemetryDebugManager](#20-backend-telemetrydebugmanager)
21. [IPC Contract](#21-ipc-contract)
22. [Frontend Debug UI](#22-frontend-debug-ui)
23. [Integration Matrix](#23-integration-matrix)
24. [Error Handling](#24-error-handling)
25. [Performance Considerations](#25-performance-considerations)
26. [File Structure](#26-file-structure)
27. [Implementation Checklist](#27-implementation-checklist)
28. [Glossary](#28-glossary)
29. [Phụ lục A: Flow record metric](#phụ-lục-a-flow-record-metric)
30. [Phụ lục B: Flow inspect AI request](#phụ-lục-b-flow-inspect-ai-request)
31. [Phụ lục C: Flow export diagnostic bundle](#phụ-lục-c-flow-export-diagnostic-bundle)
32. [Phụ lục D: JSON mẫu](#phụ-lục-d-json-mẫu)
33. [Tổng kết tài liệu đã tổng hợp và còn lại](#33-tổng-kết-tài-liệu-đã-tổng-hợp-và-còn-lại)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Telemetry Debug System của **Chiro-Pet** phải:

- Theo dõi health và performance local:
  - FPS
  - frame time
  - memory usage
  - CPU usage
  - WebGL status
  - renderer quality level
  - event rate
  - IPC latency
  - AI latency/cost/token usage
- Cung cấp debug viewer cho:
  - subsystem events
  - IPC commands/events
  - behavior decisions
  - AI request lifecycle
  - state mutations
  - memory proposals
  - asset load status
  - animation runtime state
  - recovery actions
- Hỗ trợ debug overlay trong dev mode.
- Ghi log có rotation và retention.
- Export diagnostic bundle an toàn.
- Không gửi dữ liệu ra server.
- Tôn trọng Privacy System:
  - debug logging opt-in
  - prompt logging off mặc định
  - redaction bắt buộc
  - streamer/private/restricted mode ảnh hưởng UI debug.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Metrics model.
- Logging model.
- Event monitor.
- IPC monitor.
- Performance monitor.
- Renderer debug overlay.
- Animation debug tools.
- AI debug tools.
- State/memory inspector.
- Asset debug tools.
- Recovery timeline.
- Privacy redaction.
- Retention, storage, export.
- IPC và UI debug.

Tài liệu này không mô tả:

- Error recovery policy chi tiết.
- Animation runtime internals đầy đủ.
- AI prompt schema đầy đủ.
- Shader implementation chi tiết.
- Asset import flow chi tiết.

Các phần đó thuộc subsystem riêng.

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Local only** | Không có telemetry server, không upload dữ liệu. |
| **2** | **Opt-in debug** | Debug logging/prompt logging/perf overlay phải được bật rõ ràng. |
| **3** | **Privacy-safe by default** | Mặc định không ghi raw prompt, raw desktop data, API key, window title. |
| **4** | **Low overhead** | Telemetry không được làm app lag. |
| **5** | **Bounded storage** | Log có rotation, retention, size cap. |
| **6** | **Structured logs** | Log quan trọng nên là JSON/structured để filter/search. |
| **7** | **Subsystem-neutral** | Telemetry nhận data từ mọi subsystem qua API chung. |
| **8** | **Inspectable** | Debug UI phải giúp trace flow từ trigger → decision → action → result. |
| **9** | **Exportable** | Diagnostic bundle có thể export để debug offline. |
| **10** | **Redact before persist** | Dữ liệu nhạy cảm phải redact trước khi ghi disk. |

### **2.2. Anti-pattern cần tránh**

- ❌ Bật prompt logging mặc định.
- ❌ Log API key hoặc bearer token.
- ❌ Log raw desktop window title/process path.
- ❌ Ghi event mỗi frame vào SQLite.
- ❌ IPC event spam không throttle.
- ❌ Debug overlay luôn bật cho user thường.
- ❌ Telemetry crash kéo app chính crash theo.
- ❌ Lưu log vô hạn.
- ❌ Diagnostic export chứa raw prompt không redact.
- ❌ Dùng telemetry để thay thế source of truth của subsystem.

---

## **3. Telemetry Debug Architecture**

```text
┌──────────────────────────────────────────────────────────────┐
│                       SUBSYSTEMS                              │
│ AI / State / Memory / Asset / Overlay / Awareness / Behavior  │
│ Animation / Recovery / Hotkey / Settings / IPC                │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                  TELEMETRY DEBUG MANAGER                      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Metrics Collector                                      │  │
│  │ - counters                                             │  │
│  │ - gauges                                               │  │
│  │ - histograms                                           │  │
│  │ - timers                                               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Event Recorder                                         │  │
│  │ - subsystem events                                     │  │
│  │ - behavior decisions                                   │  │
│  │ - recovery events                                      │  │
│  │ - IPC events                                           │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Log Router                                             │  │
│  │ - structured logs                                      │  │
│  │ - redaction                                            │  │
│  │ - rotation                                             │  │
│  │ - retention                                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Debug Snapshot Store                                   │  │
│  │ - recent events ring buffer                            │  │
│  │ - recent IPC calls                                     │  │
│  │ - recent AI sessions                                   │  │
│  │ - runtime performance                                  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Diagnostic Exporter                                    │  │
│  │ - health report                                        │
│  │ - recent logs                                          │
│  │ - metrics summary                                      │
│  │ - redacted snapshots                                   │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                         DEBUG UI                              │
│  - Performance overlay                                        │
│  - Event monitor                                              │
│  - IPC monitor                                                │
│  - AI inspector                                               │
│  - State/memory inspector                                     │
│  - Animation inspector                                        │
│  - Recovery timeline                                          │
└──────────────────────────────────────────────────────────────┘
```

---

## **4. Telemetry Types**

### **4.1. Telemetry categories**

| **Category** | **Mô tả** | **Storage** |
|---|---|---|
| **Metric** | Numeric value theo thời gian | Ring buffer + optional DB |
| **Event** | Sự kiện subsystem | Ring buffer + optional log |
| **Log** | Text/structured log | Rotating file |
| **Trace** | Chuỗi action theo request_id | In-memory + debug file opt-in |
| **Snapshot** | State hiện tại của subsystem | In-memory |
| **Diagnostic** | Gói export health/debug | File user tạo |

### **4.2. Metric kinds**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MetricKind {
    Counter,
    Gauge,
    Histogram,
    Timer,
}
```

### **4.3. Event kinds**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DebugEventKind {
    App,
    Ipc,
    Ai,
    Behavior,
    State,
    Memory,
    Animation,
    Asset,
    Overlay,
    Awareness,
    Privacy,
    Recovery,
    Hotkey,
    Settings,
    Renderer,
}
```

### **4.4. Log levels**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum DebugLogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}
```

---

## **5. Data Model**

### **5.1. TelemetrySettings**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetrySettings {
    pub enabled: bool,

    pub metrics_enabled: bool,
    pub event_monitor_enabled: bool,
    pub ipc_monitor_enabled: bool,
    pub performance_overlay_enabled: bool,

    pub debug_logging_enabled: bool,
    pub prompt_logging_enabled: bool,
    pub raw_ai_response_logging_enabled: bool,

    pub redact_logs: bool,

    pub log_retention_days: u32,
    pub max_log_file_mb: u32,
    pub max_log_files: u32,

    pub ring_buffer_events: usize,
    pub ring_buffer_ipc_calls: usize,
    pub ring_buffer_ai_sessions: usize,

    pub sample_performance_interval_ms: u64,

    pub updated_at: DateTime<utc>,
}
```

### **5.2. Defaults**

```rust
impl Default for TelemetrySettings {
    fn default() -> Self {
        Self {
            enabled: true,

            metrics_enabled: true,
            event_monitor_enabled: false,
            ipc_monitor_enabled: false,
            performance_overlay_enabled: false,

            debug_logging_enabled: false,
            prompt_logging_enabled: false,
            raw_ai_response_logging_enabled: false,

            redact_logs: true,

            log_retention_days: 14,
            max_log_file_mb: 10,
            max_log_files: 5,

            ring_buffer_events: 500,
            ring_buffer_ipc_calls: 200,
            ring_buffer_ai_sessions: 50,

            sample_performance_interval_ms: 1000,

            updated_at: Utc::now(),
        }
    }
}
```

### **5.3. MetricRecord**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricRecord {
    pub metric_id: String,
    pub name: String,
    pub kind: MetricKind,
    pub value: f64,
    pub unit: String,
    pub tags: HashMap<string, string="">,
    pub recorded_at: DateTime<utc>,
}
```

### **5.4. DebugEvent**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugEvent {
    pub event_id: String,
    pub kind: DebugEventKind,
    pub subsystem: String,
    pub name: String,
    pub severity: DebugLogLevel,
    pub payload: serde_json::Value,
    pub request_id: Option<string>,
    pub timestamp: DateTime<utc>,
}
```

### **5.5. IpcCallRecord**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IpcCallRecord {
    pub call_id: String,
    pub command: String,
    pub payload_size_bytes: u64,
    pub response_size_bytes: Option<u64>,
    pub latency_ms: Option<u64>,
    pub status: IpcCallStatus,
    pub error_code: Option<string>,
    pub started_at: DateTime<utc>,
    pub completed_at: Option<datetime<utc>>,
}
```

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IpcCallStatus {
    Started,
    Succeeded,
    Failed,
    Cancelled,
}
```

### **5.6. AiDebugSession**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiDebugSession {
    pub request_id: String,
    pub interaction_type: String,
    pub character_id: String,

    pub provider_model: String,
    pub source: String, // provider|cache|fallback

    pub lifecycle: Vec<ailifecyclestep>,

    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub estimated_cost_cents: Option<u32>,
    pub latency_ms: Option<u64>,

    pub sanitized_prompt_preview: Option<string>,
    pub raw_response_preview: Option<string>,

    pub validation_warnings: Vec<string>,
    pub operation_summary: Vec<string>,

    pub status: AiDebugStatus,
    pub created_at: DateTime<utc>,
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiLifecycleStep {
    pub state: String,
    pub at: DateTime<utc>,
    pub duration_ms: Option<u64>,
}
```

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AiDebugStatus {
    Running,
    Succeeded,
    Fallback,
    Failed,
    Cancelled,
}
```

---

## **6. Metrics System**

### **6.1. Metric groups**

| **Group** | **Metrics** |
|---|---|
| **app** | uptime, recovery_mode, active_subsystems |
| **renderer** | fps, frame_time_ms, draw_calls, triangles, texture_count |
| **system** | process_memory_mb, cpu_percent |
| **ai** | calls, latency_ms, token_count, cost_cents, fallback_count |
| **ipc** | command_count, latency_ms, error_count, payload_size |
| **asset** | loaded_assets, asset_load_latency_ms, fallback_count |
| **animation** | current_layer_count, transition_count, dropped_frames |
| **behavior** | triggers, blocked_count, proactive_used |
| **recovery** | errors_by_severity, recovery_success_count |

### **6.2. Metric naming**

Format:

```text
{subsystem}.{metric_name}
```

Examples:

```text
renderer.fps
renderer.frame_time_ms
ai.request_latency_ms
ipc.command_latency_ms
asset.load_latency_ms
behavior.proactive_blocked
recovery.error_count
```

### **6.3. Metrics collector**

```rust
pub struct MetricsCollector {
    buffer: Arc<rwlock<ringbuffer<metricrecord>>>,
    settings: Arc<rwlock<telemetrysettings>>,
}

impl MetricsCollector {
    pub async fn record_gauge(
        &self,
        name: &str,
        value: f64,
        unit: &str,
        tags: HashMap<string, string="">,
    ) {
        if !self.settings.read().await.metrics_enabled {
            return;
        }

        let record = MetricRecord {
            metric_id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            kind: MetricKind::Gauge,
            value,
            unit: unit.to_string(),
            tags,
            recorded_at: Utc::now(),
        };

        self.buffer.write().await.push(record);
    }

    pub async fn increment_counter(&self, name: &str, tags: HashMap<string, string="">) {
        self.record_gauge(name, 1.0, "count", tags).await;
    }
}
```

### **6.4. Timer helper**

```rust
pub struct TelemetryTimer {
    name: String,
    started_at: Instant,
    tags: HashMap<string, string="">,
    collector: Arc<metricscollector>,
}

impl TelemetryTimer {
    pub async fn finish(self) {
        let elapsed = self.started_at.elapsed().as_millis() as f64;

        self.collector
            .record_gauge(&self.name, elapsed, "ms", self.tags)
            .await;
    }
}
```

---

## **7. Logging System**

### **7.1. Log outputs**

```text
user_data/logs/
├── app.log
├── error.log
├── ai_debug.log         (opt-in)
├── ipc_debug.log        (opt-in)
├── renderer_debug.log   (opt-in)
└── recovery.log
```

### **7.2. Logging policy**

| **Log** | **Default** | **Content** |
|---|---|---|
| **app.log** | On | lifecycle, warnings, non-sensitive events |
| **error.log** | On | errors, stack summaries |
| **recovery.log** | On | recovery actions |
| **ai_debug.log** | Off | redacted AI sessions |
| **ipc_debug.log** | Off | command name, latency, size |
| **renderer_debug.log** | Off | WebGL/animation/perf details |

### **7.3. Structured log entry**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StructuredLogEntry {
    pub timestamp: DateTime<utc>,
    pub level: DebugLogLevel,
    pub subsystem: String,
    pub event: String,
    pub message: String,
    pub fields: serde_json::Value,
    pub request_id: Option<string>,
}
```

### **7.4. Log router**

```rust
pub struct DebugLogRouter {
    settings: Arc<rwlock<telemetrysettings>>,
    redactor: Arc<telemetryredactor>,
    writer: Arc<rotatinglogwriter>,
}

impl DebugLogRouter {
    pub async fn log(&self, mut entry: StructuredLogEntry) -> Result<()> {
        let settings = self.settings.read().await.clone();

        if !settings.debug_logging_enabled && entry.level < DebugLogLevel::Warn {
            return Ok(());
        }

        if settings.redact_logs {
            entry = self.redactor.redact_log_entry(entry);
        }

        self.writer.write(entry).await
    }
}
```

### **7.5. Rotation**

```rust
pub struct LogRotationConfig {
    pub max_file_mb: u32,
    pub max_files: u32,
    pub retention_days: u32,
}
```

Rules:

```text
- Rotate khi file > max_file_mb.
- Giữ tối đa max_files.
- Xóa log cũ hơn retention_days.
- Không rotate giữa lúc write: dùng append lock.
```

---

## **8. Event Monitor**

### **8.1. Monitored events**

| **Subsystem** | **Events** |
|---|---|
| **State** | state_changed, milestone, reset |
| **AI** | lifecycle_changed, response_completed, failed |
| **Behavior** | trigger_received, decision_made, action_routed |
| **Awareness** | mode_changed, milestone, fullscreen |
| **Overlay** | shown, hidden, moved, bubble |
| **Asset** | imported, updated, load_failed |
| **Recovery** | error_recorded, recovery_completed |
| **Privacy** | mode_changed, permission_changed |
| **Hotkey** | triggered, conflict |

### **8.2. Event recorder**

```rust
pub struct DebugEventRecorder {
    buffer: Arc<rwlock<ringbuffer<debugevent>>>,
    settings: Arc<rwlock<telemetrysettings>>,
    redactor: Arc<telemetryredactor>,
}

impl DebugEventRecorder {
    pub async fn record(&self, mut event: DebugEvent) {
        let settings = self.settings.read().await.clone();

        if !settings.event_monitor_enabled {
            return;
        }

        event.payload = self.redactor.redact_json(event.payload);

        self.buffer.write().await.push(event);
    }

    pub async fn recent(&self, limit: usize) -> Vec<debugevent> {
        self.buffer.read().await.tail(limit)
    }
}
```

### **8.3. Event filtering**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugEventFilter {
    pub kind: Option<debugeventkind>,
    pub subsystem: Option<string>,
    pub severity_min: Option<debugloglevel>,
    pub request_id: Option<string>,
    pub search: Option<string>,
    pub limit: usize,
}
```

---

## **9. IPC Monitor**

### **9.1. What to record**

Record:

```text
- command name
- started_at/completed_at
- latency
- payload size
- response size
- status
- error code
```

Do not record by default:

```text
- full payload
- chat message content
- settings content
- memory content
- API key
```

### **9.2. IPC monitor wrapper**

```rust
pub async fn monitor_ipc_call<t, f="">(
    telemetry: Arc<telemetrydebugmanager>,
    command: &'static str,
    payload_size: u64,
    fut: F,
) -> Result<t, ipcerror="">
where
    F: Future<output =="" result<t,="" ipcerror="">>,
    T: Serialize,
{
    let call_id = telemetry
        .record_ipc_started(command, payload_size)
        .await;

    let started = Instant::now();

    let result = fut.await;

    let latency_ms = started.elapsed().as_millis() as u64;

    match &result {
        Ok(value) => {
            let response_size = estimate_json_size(value);
            telemetry
                .record_ipc_completed(call_id, latency_ms, response_size)
                .await;
        }
        Err(err) => {
            telemetry
                .record_ipc_failed(call_id, latency_ms, err.code.clone())
                .await;
        }
    }

    result
}
```

### **9.3. IPC slow call threshold**

```text
Warning threshold:
- normal command > 100ms
- asset import excluded
- AI request excluded
- diagnostics/export excluded
```

Slow calls emit:

```text
debug event: ipc.slow_call
```

---

## **10. Performance Monitor**

### **10.1. Backend process metrics**

Metrics:

```text
- process memory MB
- process CPU %
- thread count
- uptime seconds
- open file handles if available
```

### **10.2. Renderer metrics**

Metrics from frontend:

```text
- fps
- frame_time_ms
- dropped_frames
- draw_calls
- triangles
- geometries
- textures
- shader_programs
- current_quality_level
```

### **10.3. Frontend FPS sampler**

```typescript
class FpsSampler {
  private frames = 0;
  private last = performance.now();

  tick() {
    this.frames += 1;
    const now = performance.now();

    if (now - this.last >= 1000) {
      const fps = (this.frames * 1000) / (now - this.last);

      telemetryIpc.recordMetric({
        name: "renderer.fps",
        kind: "gauge",
        value: fps,
        unit: "fps",
        tags: {},
      });

      this.frames = 0;
      this.last = now;
    }
  }
}
```

### **10.4. Renderer info sampler**

```typescript
function collectRendererMetrics(renderer: THREE.WebGLRenderer) {
  const info = renderer.info;

  return {
    draw_calls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    programs: info.programs?.length ?? 0,
  };
}
```

### **10.5. Performance thresholds**

| **Metric** | **Warning** | **Critical** |
|---|---|---|
| **renderer.fps** | < 45 | < 25 |
| **frame_time_ms** | > 22ms | > 40ms |
| **process_memory_mb** | > 500MB | > 1000MB |
| **renderer.textures** | > 100 | > 200 |
| **draw_calls** | > 150 | > 300 |
| **ai.latency_ms** | > 8000ms | > 20000ms |
| **ipc.latency_ms** | > 100ms | > 500ms |

---

## **11. Renderer Debug Overlay**

### **11.1. Overlay content**

Debug overlay hiển thị:

```text
FPS: 58
Frame: 16.8ms
Draw calls: 42
Triangles: 78k
Textures: 18
Animation: talking_gentle
Expression: caring
Mode: focus
AI: idle
Memory: healthy
```

### **11.2. Modes**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DebugOverlayMode {
    Off,
    Compact,
    Full,
}
```

### **11.3. Frontend component**

```tsx
export function PerformanceDebugOverlay() {
  const metrics = useTelemetryStore((s) => s.performanceSnapshot);
  const settings = useSettingsStore((s) => s.settings?.developer);

  if (!settings?.performance_overlay_enabled) return null;

  return (
    <div classname="debug-overlay">
      <div>FPS: {metrics.fps.toFixed(0)}</div>
      <div>Frame: {metrics.frame_time_ms.toFixed(1)}ms</div>
      <div>Draw: {metrics.draw_calls}</div>
      <div>Tex: {metrics.textures}</div>
      <div>Mode: {metrics.mode}</div>
    </div>
  );
}
```

### **11.4. Privacy behavior**

In Streamer Mode:

```text
- Debug overlay auto-hide by default.
- If explicitly allowed, show only performance numbers.
- Hide AI prompt/message/memory/state content.
```

---

## **12. Animation Debug Tools**

### **12.1. Animation inspector**

Shows:

```text
- current animation state
- active layers
- clip names
- weights
- fade progress
- interrupt policy
- expression value
- spring bone enabled
- look-at target
```

### **12.2. AnimationDebugSnapshot**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationDebugSnapshot {
    pub state: String,
    pub active_layers: Vec<animationlayerdebug>,
    pub current_expression: Option<string>,
    pub expression_values: HashMap<string, f32="">,
    pub mixer_time_seconds: f32,
    pub spring_bones_enabled: bool,
    pub look_at_enabled: bool,
    pub last_command_id: Option<string>,
}
```

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimationLayerDebug {
    pub layer: String,
    pub clip_id: Option<string>,
    pub weight: f32,
    pub loop_enabled: bool,
    pub time_seconds: f32,
    pub duration_seconds: f32,
}
```

### **12.3. Debug actions**

| **Action** | **Mục đích** |
|---|---|
| **Force idle** | Reset animation stuck |
| **Play test animation** | Test clip |
| **Toggle skeleton view** | Debug bones |
| **Toggle hitbox mask** | Debug click-through |
| **Reset expression** | Clear stuck expression |
| **Dump animation state** | Export snapshot |

---

## **13. AI Debug Tools**

### **13.1. AI inspector**

Shows per request:

```text
- request_id
- interaction_type
- lifecycle timeline
- source: provider/cache/fallback
- model
- latency
- token usage
- estimated cost
- validation warnings
- memory ops summary
- state delta summary
- fallback reason
```

### **13.2. Prompt logging policy**

Default:

```text
prompt_logging_enabled = false
raw_ai_response_logging_enabled = false
redact_logs = true
```

If enabled:

```text
- Store sanitized prompt preview only.
- Max preview length: 4000 chars.
- Redact secrets.
- Do not store raw desktop data.
```

### **13.3. AiDebugSession recorder**

```rust
pub struct AiDebugRecorder {
    sessions: Arc<rwlock<ringbuffer<aidebugsession>>>,
    settings: Arc<rwlock<telemetrysettings>>,
    redactor: Arc<telemetryredactor>,
}

impl AiDebugRecorder {
    pub async fn start_session(&self, req: &AIInteractionRequest) {
        let session = AiDebugSession {
            request_id: req.request_id.clone(),
            interaction_type: format!("{:?}", req.interaction_type),
            character_id: req.active_character_id.clone(),
            provider_model: "".into(),
            source: "unknown".into(),
            lifecycle: vec![],
            prompt_tokens: None,
            completion_tokens: None,
            estimated_cost_cents: None,
            latency_ms: None,
            sanitized_prompt_preview: None,
            raw_response_preview: None,
            validation_warnings: vec![],
            operation_summary: vec![],
            status: AiDebugStatus::Running,
            created_at: Utc::now(),
        };

        self.sessions.write().await.push(session);
    }
}
```

### **13.4. AI operation summary**

Instead of full content, store:

```json
{
  "memory_operations": 2,
  "state_delta": {
    "mood": 1,
    "affinity": 0
  },
  "suggested_animation": "talking_gentle",
  "interruption_level": 1
}
```

---

## **14. State & Memory Inspector**

### **14.1. State inspector**

Shows:

```text
- active character state
- emotional state
- relationship state
- daily counters
- last mutation
- decay timer
- derived state
```

### **14.2. State mutation timeline**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateMutationDebugRecord {
    pub request_id: String,
    pub character_id: String,
    pub source: String,
    pub proposed_delta: serde_json::Value,
    pub applied_delta: serde_json::Value,
    pub clamped_fields: Vec<string>,
    pub capped_fields: Vec<string>,
    pub reason: Option<string>,
    pub created_at: DateTime<utc>,
}
```

### **14.3. Memory inspector**

Shows:

```text
- total memories
- shared vs character memories
- pending proposals
- rejected sensitive ops
- last retrieved memories for AI context
- memory privacy decisions
```

### **14.4. Privacy rule**

Memory inspector should:

```text
- Hide sensitive memory content by default.
- Show content only after user clicks reveal.
- Never show secret rejected content.
- In Streamer Mode, mask all memory content.
```

### **14.5. Memory retrieval debug**

Store only:

```text
- memory_id
- type
- scope
- importance
- confidence
- retrieval_score
```

Avoid full content unless debug reveal is explicitly enabled.

---

## **15. Asset Debug Tools**

### **15.1. Asset health panel**

Shows:

```text
- total assets
- missing assets
- invalid assets
- active model asset
- active animation set
- bundled asset integrity
- thumbnail status
- asset cache size
```

### **15.2. AssetLoadDebugRecord**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssetLoadDebugRecord {
    pub asset_id: String,
    pub kind: String,
    pub operation: String,
    pub latency_ms: u64,
    pub status: AssetLoadStatus,
    pub fallback_used: bool,
    pub error_code: Option<string>,
    pub recorded_at: DateTime<utc>,
}
```

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetLoadStatus {
    Started,
    Succeeded,
    Failed,
    Fallback,
}
```

### **15.3. Debug actions**

| **Action** | **Mục đích** |
|---|---|
| **Validate all assets** | Recheck registry/files |
| **Rebuild thumbnails** | Fix missing thumbnails |
| **Open asset folder** | Inspect files |
| **Clear asset cache** | Free disk |
| **Force fallback model** | Test default fallback |
| **Reload active model** | Test hot reload |

---

## **16. Recovery Timeline**

### **16.1. Purpose**

Recovery timeline giúp trace:

```text
error occurred → policy selected → action executed → result
```

### **16.2. RecoveryTimelineItem**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryTimelineItem {
    pub id: String,
    pub error_id: Option<string>,
    pub subsystem: ErrorSubsystem,
    pub event: String,
    pub severity: ErrorSeverity,
    pub action: Option<string>,
    pub status: Option<recoverystatus>,
    pub message: String,
    pub timestamp: DateTime<utc>,
}
```

### **16.3. Timeline UI**

```text
02:00:00  asset.file_missing       Error
02:00:00  policy.default_model     Selected
02:00:01  fallback.default_model   Succeeded
02:00:01  app.mode                 Degraded
```

---

## **17. Privacy & Redaction**

### **17.1. Forbidden telemetry data**

Never persist:

```text
- API key
- bearer token
- password
- private key
- raw desktop window title
- PID
- process path
- command line
- clipboard
- screenshot
- raw prompt unless prompt logging is explicitly enabled
- secret memory content
```

### **17.2. Redactor**

```rust
pub struct TelemetryRedactor {
    sensitive_detector: Arc<sensitivedatadetector>,
}

impl TelemetryRedactor {
    pub fn redact_text(&self, text: &str) -> String {
        self.sensitive_detector.redact(text)
    }

    pub fn redact_json(&self, value: serde_json::Value) -> serde_json::Value {
        match value {
            serde_json::Value::String(s) => {
                serde_json::Value::String(self.redact_text(&s))
            }
            serde_json::Value::Array(items) => {
                serde_json::Value::Array(
                    items.into_iter().map(|v| self.redact_json(v)).collect(),
                )
            }
            serde_json::Value::Object(map) => {
                let mut out = serde_json::Map::new();

                for (k, v) in map {
                    if is_forbidden_key(&k) {
                        out.insert(k, serde_json::Value::String("[REDACTED]".into()));
                    } else {
                        out.insert(k, self.redact_json(v));
                    }
                }

                serde_json::Value::Object(out)
            }
            other => other,
        }
    }
}
```

### **17.3. Forbidden keys**

```rust
pub fn is_forbidden_key(key: &str) -> bool {
    matches!(
        key.to_lowercase().as_str(),
        "api_key"
            | "authorization"
            | "token"
            | "password"
            | "secret"
            | "window_title"
            | "process_path"
            | "command_line"
            | "clipboard"
            | "raw_prompt"
            | "private_key"
    )
}
```

### **17.4. Mode behavior**

| **Mode** | **Telemetry behavior** |
|---|---|
| **Normal** | Follow settings |
| **Private** | Disable prompt/memory content logging |
| **Quiet** | No special change |
| **Streamer** | Hide debug overlay content |
| **Restricted** | Minimal telemetry only, no content logging |

---

## **18. Retention & Storage**

### **18.1. Storage layout**

```text
user_data/
├── logs/
│   ├── app.log
│   ├── error.log
│   ├── recovery.log
│   ├── ai_debug.log
│   ├── ipc_debug.log
│   └── renderer_debug.log
│
├── telemetry/
│   ├── metrics.sqlite
│   ├── debug_events.sqlite
│   └── exports/
│       └── diagnostic_bundle_20260527_030000.json
```

### **18.2. MVP storage recommendation**

Use:

```text
- Ring buffer in memory for high-frequency events.
- Rotating log files for persistent logs.
- SQLite optional for aggregated metrics only.
```

Do not:

```text
- Write every frame metric to SQLite.
- Persist every mouse/overlay movement.
```

### **18.3. Retention policy**

| **Data** | **Default retention** |
|---|---|
| App logs | 14 days |
| Error logs | 30 days |
| Recovery logs | 30 days |
| AI debug logs | 7 days if enabled |
| IPC debug logs | 7 days if enabled |
| Metrics ring buffer | Current session |
| Diagnostic exports | Until user deletes |

### **18.4. Cleanup**

```rust
pub async fn cleanup_old_logs(&self) -> Result<telemetrycleanupresult> {
    // Delete old files by retention policy
    // Enforce max log files
    // Enforce max folder size if configured
}
```

---

## **19. Diagnostic Export**

### **19.1. Export contents**

Diagnostic bundle includes:

```text
- app info
- settings summary
- privacy-safe telemetry settings
- subsystem health
- recent errors
- recovery timeline
- metrics summary
- asset summary
- AI usage summary
- IPC latency summary
```

Does not include:

```text
- API key
- raw prompt
- raw desktop title
- memory content by default
- full chat history
```

### **19.2. DiagnosticBundle**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryDiagnosticBundle {
    pub bundle_version: u32,
    pub generated_at: DateTime<utc>,
    pub app_info: AppInfo,
    pub telemetry_settings: TelemetrySettings,
    pub metrics_summary: MetricsSummary,
    pub recent_events: Vec<debugevent>,
    pub recent_ipc_calls: Vec<ipccallrecord>,
    pub ai_sessions_summary: Vec<aidebugsession>,
    pub recovery_summary: serde_json::Value,
    pub asset_summary: serde_json::Value,
}
```

### **19.3. MetricsSummary**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricsSummary {
    pub renderer_avg_fps: Option<f64>,
    pub renderer_min_fps: Option<f64>,
    pub avg_frame_time_ms: Option<f64>,
    pub avg_ai_latency_ms: Option<f64>,
    pub avg_ipc_latency_ms: Option<f64>,
    pub ai_calls: u32,
    pub ai_fallbacks: u32,
    pub errors_count: u32,
    pub warnings_count: u32,
}
```

### **19.4. Export flow**

```text
User clicks Export Diagnostics
  ↓
TelemetryDebugManager.collect_bundle
  ↓
Fetch diagnostics from RecoveryManager
  ↓
Fetch recent event buffers
  ↓
Summarize metrics
  ↓
Redact all JSON
  ↓
Write diagnostic_bundle_<timestamp>.json
  ↓
Return path or file handle
```

---

## **20. Backend: TelemetryDebugManager**

### **20.1. Module trách nhiệm**

```rust
pub struct TelemetryDebugManager {
    settings: Arc<rwlock<telemetrysettings>>,
    metrics: Arc<metricscollector>,
    events: Arc<debugeventrecorder>,
    ipc_monitor: Arc<ipcmonitor>,
    ai_debug: Arc<aidebugrecorder>,
    log_router: Arc<debuglogrouter>,
    performance: Arc<performancesampler>,
    redactor: Arc<telemetryredactor>,
    exporter: Arc<diagnosticexporter>,
    event_bus: Arc<telemetryeventbus>,
}
```

### **20.2. Public methods**

```rust
impl TelemetryDebugManager {
    pub async fn init(config: TelemetryConfig) -> Result<self>;

    pub async fn get_settings(&self) -> Result<telemetrysettings>;
    pub async fn update_settings(&self, patch: TelemetrySettingsPatch) -> Result<telemetrysettings>;

    pub async fn record_metric(&self, metric: MetricRecord) -> Result<()>;
    pub async fn record_event(&self, event: DebugEvent) -> Result<()>;
    pub async fn record_log(&self, entry: StructuredLogEntry) -> Result<()>;

    pub async fn record_ipc_started(&self, command: String, payload_size: u64) -> Result<string>;
    pub async fn record_ipc_completed(
        &self,
        call_id: String,
        latency_ms: u64,
        response_size: u64,
    ) -> Result<()>;

    pub async fn get_recent_events(&self, filter: DebugEventFilter) -> Result<vec<debugevent>>;
    pub async fn get_recent_ipc_calls(&self, limit: usize) -> Result<vec<ipccallrecord>>;
    pub async fn get_recent_ai_sessions(&self, limit: usize) -> Result<vec<aidebugsession>>;

    pub async fn get_performance_snapshot(&self) -> Result<performancesnapshot>;
    pub async fn get_animation_debug_snapshot(&self) -> Result<animationdebugsnapshot>;

    pub async fn export_diagnostics(&self) -> Result<telemetrydiagnosticbundle>;
    pub async fn clear_logs(&self) -> Result<telemetrycleanupresult>;
    pub async fn cleanup_old_data(&self) -> Result<telemetrycleanupresult>;

    pub fn subscribe_events(&self) -> broadcast::Receiver<telemetryevent>;
}
```

### **20.3. TelemetryEvent**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TelemetryEvent {
    MetricRecorded {
        name: String,
    },
    DebugEventRecorded {
        event_id: String,
        kind: DebugEventKind,
    },
    SlowIpcCallDetected {
        command: String,
        latency_ms: u64,
    },
    PerformanceThresholdExceeded {
        metric: String,
        value: f64,
        threshold: f64,
    },
    DiagnosticsExported {
        path: String,
    },
    LogsCleared,
}
```

---

## **21. IPC Contract**

### **21.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `telemetry_get_settings` | `{}` | `TelemetrySettings` |
| `telemetry_update_settings` | `TelemetrySettingsPatch` | `TelemetrySettings` |
| `telemetry_record_metric` | `MetricRecord` | `void` |
| `telemetry_record_event` | `DebugEvent` | `void` |
| `telemetry_get_recent_events` | `DebugEventFilter` | `DebugEvent[]` |
| `telemetry_get_recent_ipc_calls` | `{ limit: number }` | `IpcCallRecord[]` |
| `telemetry_get_recent_ai_sessions` | `{ limit: number }` | `AiDebugSession[]` |
| `telemetry_get_performance_snapshot` | `{}` | `PerformanceSnapshot` |
| `telemetry_get_animation_debug_snapshot` | `{}` | `AnimationDebugSnapshot` |
| `telemetry_export_diagnostics` | `{}` | `TelemetryDiagnosticBundle` |
| `telemetry_clear_logs` | `{}` | `TelemetryCleanupResult` |
| `telemetry_cleanup_old_data` | `{}` | `TelemetryCleanupResult` |

### **21.2. Rust → Frontend events**

| **Event** | **Payload** |
|---|---|
| `telemetry_metric_recorded` | `{ name: string }` |
| `telemetry_debug_event_recorded` | `{ event_id: string, kind: DebugEventKind }` |
| `telemetry_slow_ipc_call_detected` | `{ command: string, latency_ms: number }` |
| `telemetry_performance_threshold_exceeded` | `{ metric: string, value: number, threshold: number }` |
| `telemetry_diagnostics_exported` | `{ path: string }` |
| `telemetry_logs_cleared` | `{}` |

### **21.3. TypeScript types**

```typescript
export type DebugLogLevel =
  | "trace"
  | "debug"
  | "info"
  | "warn"
  | "error";

export type DebugEventKind =
  | "app"
  | "ipc"
  | "ai"
  | "behavior"
  | "state"
  | "memory"
  | "animation"
  | "asset"
  | "overlay"
  | "awareness"
  | "privacy"
  | "recovery"
  | "hotkey"
  | "settings"
  | "renderer";

export interface TelemetrySettings {
  enabled: boolean;
  metrics_enabled: boolean;
  event_monitor_enabled: boolean;
  ipc_monitor_enabled: boolean;
  performance_overlay_enabled: boolean;
  debug_logging_enabled: boolean;
  prompt_logging_enabled: boolean;
  raw_ai_response_logging_enabled: boolean;
  redact_logs: boolean;
  log_retention_days: number;
  max_log_file_mb: number;
  max_log_files: number;
  ring_buffer_events: number;
  ring_buffer_ipc_calls: number;
  ring_buffer_ai_sessions: number;
  sample_performance_interval_ms: number;
  updated_at: string;
}

export interface DebugEvent {
  event_id: string;
  kind: DebugEventKind;
  subsystem: string;
  name: string;
  severity: DebugLogLevel;
  payload: unknown;
  request_id?: string | null;
  timestamp: string;
}
```

---

## **22. Frontend Debug UI**

### **22.1. Debug settings page**

```text
Settings
└─ Developer / Debug
   ├─ Enable developer mode
   ├─ Enable event monitor
   ├─ Enable IPC monitor
   ├─ Enable performance overlay
   ├─ Enable debug logging
   ├─ Enable prompt logging
   ├─ Redact logs
   ├─ Export diagnostics
   └─ Clear logs
```

### **22.2. Debug dashboard**

```text
Debug Dashboard
├─ Overview
│  ├─ Overall health
│  ├─ FPS / memory / CPU
│  ├─ AI status
│  └─ recovery mode
│
├─ Events
│  ├─ event stream
│  ├─ filters
│  └─ request_id trace
│
├─ IPC
│  ├─ recent commands
│  ├─ latency chart
│  └─ error list
│
├─ AI
│  ├─ request timeline
│  ├─ token/cost
│  ├─ validation warnings
│  └─ fallback reason
│
├─ State & Memory
│  ├─ active state
│  ├─ mutation timeline
│  ├─ memory proposals
│  └─ retrieval debug
│
├─ Animation
│  ├─ active layers
│  ├─ expressions
│  ├─ skeleton/hitbox toggles
│  └─ test animation
│
├─ Assets
│  ├─ active model
│  ├─ missing/invalid assets
│  ├─ cache size
│  └─ repair shortcuts
│
└─ Recovery
   ├─ timeline
   ├─ recent errors
   └─ backup/restore shortcuts
```

### **22.3. Telemetry store**

```typescript
interface TelemetryStore {
  settings: TelemetrySettings | null;
  events: DebugEvent[];
  ipcCalls: IpcCallRecord[];
  aiSessions: AiDebugSession[];
  performance: PerformanceSnapshot | null;

  refreshSettings: () => Promise<void>;
  refreshEvents: () => Promise<void>;
  refreshPerformance: () => Promise<void>;
  exportDiagnostics: () => Promise<void>;
  clearLogs: () => Promise<void>;
}
```

### **22.4. Event stream UI**

```tsx
export function DebugEventStream() {
  const events = useTelemetryStore((s) => s.events);

  return (
    <div classname="debug-event-stream">
      {events.map((event) => (
        <div key="{event.event_id}" classname="{`event" ${event.severity}`}="">
          <span>{event.timestamp}</span>
          <span>{event.kind}</span>
          <span>{event.name}</span>
          <code>{JSON.stringify(event.payload)}</code>
        </div>
      ))}
    </div>
  );
}
```

---

## **23. Integration Matrix**

| **Subsystem** | **Telemetry integration** | **Data recorded** |
|---|---|---|
| **AIInteraction** | AiDebugRecorder | lifecycle, latency, tokens, fallback |
| **Behavior** | EventRecorder | trigger, decision, block reason |
| **State** | EventRecorder | mutation delta, milestones |
| **Memory** | EventRecorder | proposal count, privacy decision |
| **Animation** | DebugSnapshot | layers, clips, expressions |
| **Asset** | Metrics + Event | load latency, fallback, validation |
| **Overlay** | EventRecorder | visibility, position, click-through |
| **Awareness** | EventRecorder | mode changes, milestones |
| **Privacy** | EventRecorder | mode/permission changes |
| **Recovery** | Timeline | error, policy, recovery result |
| **IPC** | IpcMonitor | command latency/status |
| **Settings** | EventRecorder | section updated/reset |
| **Hotkey** | EventRecorder | trigger/conflict/dispatch |

---

## **24. Error Handling**

### **24.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum TelemetryError {
    #[error("Telemetry disabled")]
    Disabled,

    #[error("Invalid telemetry payload: {0}")]
    InvalidPayload(String),

    #[error("Log write failed: {0}")]
    LogWriteFailed(String),

    #[error("Diagnostics export failed: {0}")]
    ExportFailed(String),

    #[error("Redaction failed: {0}")]
    RedactionFailed(String),

    #[error("Storage cleanup failed: {0}")]
    CleanupFailed(String),
}
```

### **24.2. Recovery policy**

| **Error** | **Behavior** |
|---|---|
| Telemetry disabled | No-op |
| Log write fail | Disable persistent logging, keep ring buffer |
| Ring buffer full | Drop oldest |
| Export fail | Show error, do not delete data |
| Redaction fail | Drop field or block export |
| Performance sampler fail | Stop sampler, app continues |

### **24.3. Fail-safe**

If telemetry fails:

```text
- App must continue normally.
- Do not block AI/overlay/animation.
- Disable broken telemetry channel.
- Record minimal warning if possible.
```

---

## **25. Performance Considerations**

### **25.1. Overhead budget**

| **Feature** | **Target overhead** |
|---|---|
| Metrics ring buffer | < 0.1% CPU |
| Event monitor | < 0.5MB memory |
| IPC monitor | < 0.1ms per command |
| FPS sampler | < 0.1ms per second sample |
| Debug overlay | < 1ms/frame if visible |
| Log write | async, non-blocking |

### **25.2. Throttling**

| **Data source** | **Throttle** |
|---|---|
| FPS metric | 1s |
| renderer.info | 1s |
| overlay moved | 50ms |
| animation state | 100ms |
| IPC command | every command, metadata only |
| events | on change |
| logs | async batch |

### **25.3. Ring buffer sizes**

Default:

```text
events = 500
ipc_calls = 200
ai_sessions = 50
metrics = 1000
```

### **25.4. Backpressure**

```text
If event rate too high:
  1. Drop trace/debug events first.
  2. Keep warn/error.
  3. Emit telemetry_backpressure warning.
```

---

## **26. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── telemetry/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── metrics.rs
│               ├── event_recorder.rs
│               ├── ipc_monitor.rs
│               ├── ai_debug.rs
│               ├── performance.rs
│               ├── log_router.rs
│               ├── rotation.rs
│               ├── redactor.rs
│               ├── exporter.rs
│               ├── cleanup.rs
│               ├── events.rs
│               └── errors.rs
│
├── src-tauri/
│   └── src/
│       └── ipc/
│           └── telemetry_commands.rs
│
├── src/
│   ├── telemetry/
│   │   ├── components/
│   │   │   ├── DebugDashboard.tsx
│   │   │   ├── PerformanceDebugOverlay.tsx
│   │   │   ├── DebugEventStream.tsx
│   │   │   ├── IpcMonitorPanel.tsx
│   │   │   ├── AiInspectorPanel.tsx
│   │   │   ├── StateInspectorPanel.tsx
│   │   │   ├── MemoryInspectorPanel.tsx
│   │   │   ├── AnimationInspectorPanel.tsx
│   │   │   ├── AssetDebugPanel.tsx
│   │   │   └── RecoveryTimelinePanel.tsx
│   │   │
│   │   ├── stores/
│   │   │   └── telemetryStore.ts
│   │   │
│   │   └── utils/
│   │       ├── fpsSampler.ts
│   │       ├── rendererMetrics.ts
│   │       └── eventFormat.ts
│   │
│   ├── settings/
│   │   └── pages/
│   │       └── Developer.tsx
│   │
│   └── shared/
│       └── types/
│           └── telemetry.ts
│
└── docs/
    └── telemetry-debug-system.md
```

---

## **27. Implementation Checklist**

### **27.1. P0 Core**

- [ ] Define `TelemetrySettings`.
- [ ] Define `MetricRecord`.
- [ ] Define `DebugEvent`.
- [ ] Define `IpcCallRecord`.
- [ ] Define `AiDebugSession`.
- [ ] Implement ring buffer.
- [ ] Implement `MetricsCollector`.
- [ ] Implement `DebugEventRecorder`.
- [ ] Implement `TelemetryDebugManager`.

### **27.2. P0 Privacy & Logging**

- [ ] Implement `TelemetryRedactor`.
- [ ] Block forbidden keys.
- [ ] Integrate SensitiveDataDetector.
- [ ] Implement rotating log writer.
- [ ] Ensure API key never logged.
- [ ] Ensure raw desktop data never logged.
- [ ] Prompt logging off by default.

### **27.3. P0 Performance**

- [ ] Frontend FPS sampler.
- [ ] Renderer metrics collector.
- [ ] Backend process memory metric.
- [ ] IPC command latency monitor.
- [ ] Performance snapshot command.

### **27.4. P0 Event Monitor**

- [ ] Bridge subsystem events to DebugEventRecorder.
- [ ] Behavior decision events.
- [ ] AI lifecycle events.
- [ ] Recovery events.
- [ ] State mutation events.
- [ ] Asset load events.

### **27.5. P1 Debug UI**

- [ ] Developer settings page.
- [ ] Debug dashboard.
- [ ] Event stream.
- [ ] IPC monitor panel.
- [ ] AI inspector panel.
- [ ] Performance overlay.
- [ ] Recovery timeline panel.

### **27.6. P1 Inspectors**

- [ ] Animation debug snapshot.
- [ ] State inspector.
- [ ] Memory inspector.
- [ ] Asset debug panel.
- [ ] Renderer hitbox/skeleton toggles.

### **27.7. P1 Export/Cleanup**

- [ ] Diagnostic bundle export.
- [ ] Metrics summary.
- [ ] Log cleanup.
- [ ] Clear logs button.
- [ ] Retention enforcement.

### **27.8. P2 Polish**

- [ ] Charts for FPS/latency over time.
- [ ] Request trace graph.
- [ ] Event flame chart.
- [ ] Auto performance degradation detection.
- [ ] Debug session recording/replay.
- [ ] Export as ZIP package.
- [ ] Plugin-like custom debug panels.

---

## **28. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Telemetry** | Dữ liệu đo đạc runtime như FPS, latency, memory. |
| **Debug Event** | Event có cấu trúc dùng để quan sát subsystem. |
| **Metric** | Giá trị numeric được ghi theo thời gian. |
| **Ring Buffer** | Buffer giới hạn, đầy thì drop dữ liệu cũ nhất. |
| **IPC Monitor** | Công cụ theo dõi command/event giữa frontend và backend. |
| **AI Inspector** | Công cụ xem lifecycle, latency, token, fallback của AI request. |
| **State Inspector** | Công cụ xem state hiện tại và mutation timeline. |
| **Performance Overlay** | Overlay debug hiển thị FPS/frame/memory. |
| **Diagnostic Bundle** | Gói dữ liệu debug đã redact để export. |
| **Redaction** | Quá trình ẩn secret/dữ liệu nhạy cảm trước khi log/export. |
| **Retention** | Thời gian giữ log/debug data trước khi cleanup. |

---

# **Phụ lục A: Flow record metric**

```text
Subsystem records metric:
  renderer.fps = 58
       ↓
TelemetryDebugManager.record_metric
       ↓
Check telemetry settings:
  metrics_enabled = true?
       ↓
Build MetricRecord
       ↓
Apply tags:
  subsystem=renderer
  window=overlay
       ↓
Push into metrics ring buffer
       ↓
If threshold exceeded:
  emit telemetry_performance_threshold_exceeded
       ↓
Debug UI reads recent metrics
```

---

# **Phụ lục B: Flow inspect AI request**

```text
AIOrchestrator starts request
       ↓
AiDebugRecorder.start_session(request_id)
       ↓
Lifecycle events:
  preparing_context
  thinking
  waiting_provider
  validating
  applying_operations
  responding
       ↓
Recorder appends AiLifecycleStep
       ↓
Provider response arrives
       ↓
Recorder stores:
  - latency
  - token usage
  - source provider/cache/fallback
  - validation warnings
  - operation summary
       ↓
If prompt logging enabled:
  - redact sanitized prompt preview
  - store preview only
       ↓
Debug UI opens AI Inspector
       ↓
User sees timeline and fallback reason
```

---

# **Phụ lục C: Flow export diagnostic bundle**

```text
User clicks Export Diagnostics
       ↓
TelemetryDebugManager.export_diagnostics
       ↓
Collect:
  - app info
  - telemetry settings
  - metrics summary
  - recent events
  - recent IPC calls
  - AI session summaries
  - recovery summary
  - asset summary
       ↓
Redact entire bundle
       ↓
Validate no forbidden keys
       ↓
Write diagnostic_bundle_<timestamp>.json
       ↓
Emit telemetry_diagnostics_exported
       ↓
Return bundle or path to UI
```

---

# **Phụ lục D: JSON mẫu**

## **D.1. TelemetrySettings mẫu**

```json
{
  "enabled": true,
  "metrics_enabled": true,
  "event_monitor_enabled": false,
  "ipc_monitor_enabled": false,
  "performance_overlay_enabled": false,
  "debug_logging_enabled": false,
  "prompt_logging_enabled": false,
  "raw_ai_response_logging_enabled": false,
  "redact_logs": true,
  "log_retention_days": 14,
  "max_log_file_mb": 10,
  "max_log_files": 5,
  "ring_buffer_events": 500,
  "ring_buffer_ipc_calls": 200,
  "ring_buffer_ai_sessions": 50,
  "sample_performance_interval_ms": 1000,
  "updated_at": "2026-05-27T03:00:00Z"
}
```

## **D.2. MetricRecord mẫu**

```json
{
  "metric_id": "met_001",
  "name": "renderer.fps",
  "kind": "gauge",
  "value": 58.4,
  "unit": "fps",
  "tags": {
    "window": "overlay"
  },
  "recorded_at": "2026-05-27T03:00:00Z"
}
```

## **D.3. DebugEvent mẫu**

```json
{
  "event_id": "evt_001",
  "kind": "behavior",
  "subsystem": "behavior",
  "name": "decision_made",
  "severity": "info",
  "payload": {
    "trigger_type": "focus_milestone",
    "decision": "downgrade",
    "reason": "focus_mode_downgrade"
  },
  "request_id": null,
  "timestamp": "2026-05-27T03:00:00Z"
}
```

## **D.4. IpcCallRecord mẫu**

```json
{
  "call_id": "ipc_001",
  "command": "state_get_active",
  "payload_size_bytes": 2,
  "response_size_bytes": 1024,
  "latency_ms": 4,
  "status": "succeeded",
  "error_code": null,
  "started_at": "2026-05-27T03:00:00Z",
  "completed_at": "2026-05-27T03:00:00Z"
}
```

## **D.5. AiDebugSession mẫu**

```json
{
  "request_id": "ai_req_001",
  "interaction_type": "focus_milestone",
  "character_id": "mira_default",
  "provider_model": "gpt-4o-mini",
  "source": "provider",
  "lifecycle": [
    {
      "state": "preparing_context",
      "at": "2026-05-27T03:00:00Z",
      "duration_ms": 12
    },
    {
      "state": "waiting_provider",
      "at": "2026-05-27T03:00:01Z",
      "duration_ms": 820
    }
  ],
  "prompt_tokens": 1200,
  "completion_tokens": 120,
  "estimated_cost_cents": 1,
  "latency_ms": 950,
  "sanitized_prompt_preview": null,
  "raw_response_preview": null,
  "validation_warnings": [],
  "operation_summary": [
    "state_delta:mood+0",
    "animation:talking_gentle",
    "memory_ops:0"
  ],
  "status": "succeeded",
  "created_at": "2026-05-27T03:00:00Z"
}
```

## **D.6. PerformanceSnapshot mẫu**

```json
{
  "fps": 58.4,
  "frame_time_ms": 17.1,
  "draw_calls": 42,
  "triangles": 78000,
  "textures": 18,
  "process_memory_mb": 220,
  "cpu_percent": 2.4,
  "renderer_quality_level": "full",
  "webgl_context_lost": false,
  "sampled_at": "2026-05-27T03:00:00Z"
}
```

## **D.7. TelemetryDiagnosticBundle mẫu**

```json
{
  "bundle_version": 1,
  "generated_at": "2026-05-27T03:00:00Z",
  "app_info": {
    "app_name": "Chiro-Pet",
    "app_version": "0.1.0",
    "ipc_contract_version": 1,
    "platform": "windows"
  },
  "telemetry_settings": {
    "enabled": true,
    "redact_logs": true
  },
  "metrics_summary": {
    "renderer_avg_fps": 57.8,
    "renderer_min_fps": 49.2,
    "avg_frame_time_ms": 17.4,
    "avg_ai_latency_ms": 950,
    "avg_ipc_latency_ms": 6,
    "ai_calls": 12,
    "ai_fallbacks": 1,
    "errors_count": 0,
    "warnings_count": 3
  },
  "recent_events": [],
  "recent_ipc_calls": [],
  "ai_sessions_summary": [],
  "recovery_summary": {},
  "asset_summary": {}
}
```

---
