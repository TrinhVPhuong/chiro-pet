# **Chiro-Pet Overlay Window System**

> Tài liệu thiết kế chính thức cho **Overlay Window System** của **Chiro-Pet**.
> Đây là **interface vật lý** của app: cửa sổ trong suốt luôn hiện trên desktop, cho phép click-through, anchor linh hoạt, hỗ trợ multi-monitor và DPI scaling.
>
> **Nguyên tắc lõi:** Overlay phải **tàng hình về mặt UI** (không có title bar, không có border, không có background), nhưng **hiện diện vật lý** (luôn ở trên cùng, không bị OS che). Click-through phải **per-pixel chính xác** để user vẫn tương tác được với app phía dưới ngoài vùng character.

---

## **Mục lục**

1. [Mục tiêu & Phạm vi](#1-mục-tiêu--phạm-vi)
2. [Nguyên tắc thiết kế](#2-nguyên-tắc-thiết-kế)
3. [Window Architecture](#3-window-architecture)
4. [Data Model](#4-data-model)
5. [Transparent Window Setup](#5-transparent-window-setup)
6. [Click-Through System](#6-click-through-system)
7. [Hitbox Computation](#7-hitbox-computation)
8. [Always-On-Top Behavior](#8-always-on-top-behavior)
9. [Anchor System](#9-anchor-system)
10. [Window Movement & Drag](#10-window-movement--drag)
11. [Multi-Monitor Handling](#11-multi-monitor-handling)
12. [DPI Scaling](#12-dpi-scaling)
13. [Z-Order Management](#13-z-order-management)
14. [Auto-Hide System](#14-auto-hide-system)
15. [Resize & Scale](#15-resize--scale)
16. [Sub-Windows (Chat, Bubble)](#16-sub-windows-chat-bubble)
17. [Backend: OverlayWindowManager](#17-backend-overlaywindowmanager)
18. [Platform Adapter (Windows)](#18-platform-adapter-windows)
19. [IPC Contract](#19-ipc-contract)
20. [Frontend Integration](#20-frontend-integration)
21. [Performance Considerations](#21-performance-considerations)
22. [Error Handling](#22-error-handling)
23. [File Structure](#23-file-structure)
24. [Implementation Checklist](#24-implementation-checklist)
25. [Glossary](#25-glossary)
26. [Phụ lục A: Flow khởi tạo overlay](#phụ-lục-a-flow-khởi-tạo-overlay)
27. [Phụ lục B: Flow click-through dynamic](#phụ-lục-b-flow-click-through-dynamic)
28. [Phụ lục C: JSON mẫu](#phụ-lục-c-json-mẫu)

---

## **1. Mục tiêu & Phạm vi**

### **1.1. Mục tiêu**

Overlay Window System của **Chiro-Pet** phải:

- Tạo **transparent window** không title bar, không border, không background.
- **Luôn hiện trên cùng** (always-on-top) nhưng tôn trọng fullscreen apps.
- Hỗ trợ **click-through per-pixel**: click vào vùng trong suốt → xuyên qua xuống app dưới.
- Hỗ trợ **click-catch** trên vùng character: tương tác (click, drag, hover).
- **Anchor flexible**: taskbar, corner, floating, pinned to app.
- Quản lý **multi-monitor** đúng: di chuyển, snap, detect change.
- Xử lý **DPI scaling** đúng (HiDPI 4K, mixed DPI).
- **Auto-hide** khi gặp fullscreen game/video/meeting.
- **Sub-windows** (chat panel, speech bubble) khớp với overlay chính.
- **Performance**: < 50MB RAM, không lag main desktop.

### **1.2. Phạm vi**

Tài liệu này bao quát:

- Window creation và lifecycle.
- Transparency setup (Win32 layered window).
- Click-through implementation (hit-test region).
- Anchor modes và snapping.
- Drag/move/resize.
- Multi-monitor và DPI.
- Z-order và fullscreen detection integration.
- Sub-window management.
- IPC contract.

Tài liệu này **không** mô tả:

- VRM rendering pipeline (xem `animation-system.md`).
- Chat UI logic (xem `ai-interaction-system.md`).
- Desktop detection (xem `desktop-awareness-system.md`).
- Settings UI structure (xem `settings-system.md`).

---

## **2. Nguyên tắc thiết kế**

### **2.1. Nguyên tắc bất biến**

| # | **Nguyên tắc** | **Ý nghĩa** |
|---|---|---|
| **1** | **Invisible by default** | Window không có chrome (title, border, background). User chỉ thấy character. |
| **2** | **Per-pixel hit-test** | Click chỉ catch trên vùng character. Vùng alpha=0 → click-through. |
| **3** | **Always-on-top nhưng polite** | Trên app thường nhưng auto-hide khi fullscreen game/video. |
| **4** | **DPI-aware** | Mọi tọa độ scale theo monitor DPI. |
| **5** | **Multi-monitor safe** | Window không "biến mất" khi unplug monitor. |
| **6** | **No focus stealing** | Overlay không steal focus từ app khác trừ khi user click. |
| **7** | **Anchor persistent** | Vị trí và anchor lưu lại qua restart. |
| **8** | **Sub-windows synced** | Bubble/chat panel theo dõi vị trí overlay chính. |
| **9** | **Recoverable** | Crash 1 window không kéo theo crash cả app. |
| **10** | **Platform-abstracted** | Win32 calls qua adapter, logic chính cross-platform. |

### **2.2. Anti-pattern cần tránh**

- ❌ Dùng full-screen transparent window (lãng phí GPU).
- ❌ Bounding box hit-test (click-through không chính xác).
- ❌ Force always-on-top trên fullscreen game (crash game).
- ❌ Hardcode tọa độ không scale theo DPI.
- ❌ Sub-window là child window cứng (không follow drag mượt).
- ❌ Polling vị trí cursor để hit-test (tốn CPU).
- ❌ Recreate window mỗi lần resize (gây flicker).
- ❌ Để window ngoài bounds tất cả monitors (mất vĩnh viễn).
- ❌ Block UI thread khi gọi Win32.
- ❌ Không lưu state window khi shutdown.

---

## **3. Window Architecture**

### **3.1. Hierarchy**

```text
┌──────────────────────────────────────────────────┐
│            OverlayWindowManager                   │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │ Main Overlay Window (transparent)          │ │
│  │ - VRM canvas                               │ │
│  │ - Hit-test region (per-pixel)              │ │
│  │ - Always-on-top                            │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │ Bubble Sub-window (transparent)            │ │
│  │ - Speech bubble                            │ │
│  │ - Anchored to main overlay                 │ │
│  │ - Click-through                            │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │ Chat Panel Window (normal)                 │ │
│  │ - Input box, history                       │ │
│  │ - Not always-on-top                        │ │
│  │ - Standard window chrome (optional)        │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  ┌────────────────────────────────────────────┐ │
│  │ Settings Window (normal)                   │ │
│  │ - Standard app window                      │ │
│  └────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### **3.2. Window types**

| **Window** | **Transparent** | **Always-on-top** | **Click-through** | **Chrome** |
|---|---|---|---|---|
| **Main Overlay** | Yes | Yes | Per-pixel | No |
| **Bubble** | Yes | Yes (follow main) | Yes (full) | No |
| **Chat Panel** | No | No | No | Optional |
| **Settings** | No | No | No | Yes |
| **Radial Menu** | Yes | Yes | Per-pixel | No |

### **3.3. Window lifecycle**

```text
App start
  ↓
Load saved window state (position, size, anchor)
  ↓
Create Main Overlay (hidden initially)
  ↓
Apply Win32 styles (layered, transparent, tool window)
  ↓
Setup hit-test region
  ↓
Position according to anchor
  ↓
Show window
  ↓
Subscribe to OS events (monitor change, DPI, fullscreen)
  ↓
Running state
  ↓
On shutdown: save state, destroy windows
```

---

## **4. Data Model**

### **4.1. WindowState (Persistent)**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayWindowState {
    pub schema_version: u32,
    pub anchor: AnchorMode,
    pub position: LogicalPosition,
    pub size: LogicalSize,
    pub monitor_id: Option<string>,
    pub scale: f32,
    pub is_visible: bool,
    pub last_updated: DateTime<utc>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LogicalPosition {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LogicalSize {
    pub width: f64,
    pub height: f64,
}
```

### **4.2. AnchorMode**

```rust
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnchorMode {
    Floating,        // Free position, user drag
    TaskbarLeft,     // Snap to taskbar left
    TaskbarRight,    // Snap to taskbar right (default)
    TaskbarCenter,   // Snap to taskbar center
    BottomLeft,      // Corner
    BottomRight,     // Corner
    TopLeft,
    TopRight,
    PinnedToApp,     // Follow foreground window
}
```

### **4.3. HitTestRegion**

```rust
#[derive(Debug, Clone)]
pub struct HitTestRegion {
    pub width: u32,
    pub height: u32,
    pub alpha_threshold: u8,    // Pixels with alpha < this → click-through
    pub pixel_data: Vec<u8>,    // RGBA buffer
    pub updated_at: Instant,
}
```

### **4.4. WindowConfig (Init)**

```rust
#[derive(Debug, Clone)]
pub struct OverlayWindowConfig {
    pub initial_size: LogicalSize,
    pub min_size: LogicalSize,
    pub max_size: LogicalSize,
    pub default_anchor: AnchorMode,
    pub hit_test_alpha_threshold: u8,
    pub always_on_top: bool,
    pub skip_taskbar: bool,
    pub show_on_start: bool,
}

impl Default for OverlayWindowConfig {
    fn default() -> Self {
        Self {
            initial_size: LogicalSize { width: 300.0, height: 400.0 },
            min_size: LogicalSize { width: 200.0, height: 280.0 },
            max_size: LogicalSize { width: 800.0, height: 1000.0 },
            default_anchor: AnchorMode::TaskbarRight,
            hit_test_alpha_threshold: 10,
            always_on_top: true,
            skip_taskbar: true,
            show_on_start: true,
        }
    }
}
```

### **4.5. TypeScript types**

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

export interface OverlayWindowState {
  schema_version: number;
  anchor: AnchorMode;
  position: LogicalPosition;
  size: LogicalSize;
  monitor_id: string | null;
  scale: number;
  is_visible: boolean;
  last_updated: string;
}
```

---

## **5. Transparent Window Setup**

### **5.1. Tauri configuration**

`tauri.conf.json`:

```json
{
  "windows": [
    {
      "label": "overlay",
      "title": "Chiro-Pet",
      "width": 300,
      "height": 400,
      "transparent": true,
      "decorations": false,
      "alwaysOnTop": true,
      "skipTaskbar": true,
      "resizable": false,
      "visible": false,
      "focus": false,
      "acceptFirstMouse": false
    }
  ]
}
```

### **5.2. Win32 extended styles**

Sau khi Tauri tạo window, áp thêm Win32 styles:

```rust
pub fn apply_overlay_styles(hwnd: HWND) -> Result<()> {
    unsafe {
        let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);

        // Layered: per-pixel alpha
        ex_style |= WS_EX_LAYERED.0 as isize;

        // Tool window: không hiện trong Alt-Tab
        ex_style |= WS_EX_TOOLWINDOW.0 as isize;

        // No activate: không steal focus
        ex_style |= WS_EX_NOACTIVATE.0 as isize;

        // Topmost
        ex_style |= WS_EX_TOPMOST.0 as isize;

        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);

        // Force update
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED,
        )?;
    }
    Ok(())
}
```

### **5.3. Style breakdown**

| **Style** | **Tác dụng** |
|---|---|
| `WS_EX_LAYERED` | Cho phép per-pixel alpha (transparent background). |
| `WS_EX_TOOLWINDOW` | Không hiện trong Alt-Tab và taskbar. |
| `WS_EX_NOACTIVATE` | Click không steal focus từ app khác. |
| `WS_EX_TOPMOST` | Luôn trên các window khác. |
| `WS_EX_TRANSPARENT` | (Optional) full click-through, không dùng default. |

### **5.4. WebView2 transparency**

Vì Tauri dùng WebView2 (Edge), cần config:

```rust
// In WebView2 initialization
webview.set_background_color((0, 0, 0, 0))?;
```

Và CSS body:

```css
html, body {
  background: transparent !important;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
```

---

## **6. Click-Through System**

### **6.1. Hai chế độ click-through**

| **Mode** | **Hành vi** | **Khi nào dùng** |
|---|---|---|
| **Full click-through** | Toàn bộ window xuyên qua | Bubble, idle state ngắn |
| **Per-pixel hit-test** | Chỉ vùng character catch click | Mặc định cho main overlay |

### **6.2. Full click-through**

```rust
pub fn set_full_click_through(hwnd: HWND, enabled: bool) -> Result<()> {
    unsafe {
        let mut ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if enabled {
            ex_style |= WS_EX_TRANSPARENT.0 as isize;
        } else {
            ex_style &= !(WS_EX_TRANSPARENT.0 as isize);
        }
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style);
    }
    Ok(())
}
```

### **6.3. Per-pixel hit-test (recommended)**

Dùng `WM_NCHITTEST` subclass hoặc Win32 region:

**Phương pháp 1: SetWindowRgn (static region)**
```rust
pub fn set_hit_test_region(hwnd: HWND, region: &HitTestRegion) -> Result<()> {
    // Build HRGN from alpha mask
    let mut rects = Vec::new();
    for y in 0..region.height {
        let mut in_run = false;
        let mut run_start = 0u32;
        for x in 0..region.width {
            let idx = ((y * region.width + x) * 4 + 3) as usize;
            let alpha = region.pixel_data[idx];
            let opaque = alpha >= region.alpha_threshold;

            if opaque && !in_run {
                in_run = true;
                run_start = x;
            } else if !opaque && in_run {
                rects.push(RECT {
                    left: run_start as i32,
                    top: y as i32,
                    right: x as i32,
                    bottom: (y + 1) as i32,
                });
                in_run = false;
            }
        }
        if in_run {
            rects.push(RECT {
                left: run_start as i32,
                top: y as i32,
                right: region.width as i32,
                bottom: (y + 1) as i32,
            });
        }
    }

    let hrgn = build_region_from_rects(&rects)?;
    unsafe { SetWindowRgn(hwnd, hrgn, TRUE); }
    Ok(())
}
```

**Phương pháp 2: UpdateLayeredWindow (preferred for animation)**

Khi character animation đang chạy, region thay đổi mỗi frame. Dùng `UpdateLayeredWindow` với alpha buffer:

```rust
pub fn update_layered_window(
    hwnd: HWND,
    rgba_buffer: &[u8],
    width: u32,
    height: u32,
    position: (i32, i32),
) -> Result<()> {
    // Create DIB section, blit alpha buffer
    // Call UpdateLayeredWindow with ULW_ALPHA
    // Win32 auto-handles hit-test based on alpha
    unimplemented!("Full Win32 impl")
}
```

### **6.4. Hit-test với WebView2**

Tauri + WebView2 dùng cách khác: JS phát hiện hover qua canvas alpha, thông báo qua IPC:

```typescript
// Frontend: detect cursor on transparent area
canvas.addEventListener("pointermove", (e) => {
  const pixel = readPixelAlpha(canvas, e.clientX, e.clientY);
  const isTransparent = pixel < THRESHOLD;
  invoke("overlay_set_click_through", { enabled: isTransparent });
});
```

```rust
#[tauri::command]
pub async fn overlay_set_click_through(
    window: tauri::Window,
    enabled: bool,
) -> Result<(), String> {
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
    set_full_click_through(hwnd, enabled).map_err(|e| e.to_string())
}
```

### **6.5. Debouncing**

```text
- Cursor move event rate: ~60-120Hz.
- IPC overhead: ~0.5ms per call.
- → Debounce 50ms, chỉ gửi khi state đổi.
```

```typescript
let lastState = false;
let debounceTimer: number | null = null;

function updateClickThrough(transparent: boolean) {
  if (transparent === lastState) return;

  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    if (transparent !== lastState) {
      lastState = transparent;
      invoke("overlay_set_click_through", { enabled: transparent });
    }
  }, 50);
}
```

---

## **7. Hitbox Computation**

### **7.1. Three.js canvas alpha read**

```typescript
export function readPixelAlpha(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): number {
  const gl = canvas.getContext("webgl2");
  if (!gl) return 0;

  const pixels = new Uint8Array(4);
  const flippedY = canvas.height - y;  // WebGL Y flipped
  gl.readPixels(x, flippedY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  return pixels[3]; // alpha channel
}
```

### **7.2. Hitbox cache**

Đọc pixel mỗi pointermove tốn GPU. Cache low-res alpha mask:

```typescript
class HitboxCache {
  private mask: Uint8Array;
  private width: number;
  private height: number;
  private dirty = true;

  constructor(width: number, height: number) {
    this.width = Math.floor(width / 4);   // 1/4 resolution
    this.height = Math.floor(height / 4);
    this.mask = new Uint8Array(this.width * this.height);
  }

  rebuild(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2")!;
    const pixels = new Uint8Array(this.width * this.height * 4);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    for (let i = 0; i < this.width * this.height; i++) {
      this.mask[i] = pixels[i * 4 + 3];
    }
    this.dirty = false;
  }

  isOpaque(x: number, y: number, threshold = 10): boolean {
    const cx = Math.floor(x / 4);
    const cy = Math.floor(y / 4);
    if (cx < 0 || cy < 0 || cx >= this.width || cy >= this.height) return false;
    return this.mask[cy * this.width + cx] >= threshold;
  }

  markDirty() { this.dirty = true; }
}
```

### **7.3. Refresh strategy**

```text
- Rebuild cache: mỗi 100ms khi animation đang chạy.
- Rebuild ngay: khi animation state đổi (idle → talking).
- Skip rebuild: khi character không đổi (full idle).
```

### **7.4. Bounding box fallback**

Nếu WebGL không khả dụng (rare), dùng bounding box:

```typescript
function bboxHitTest(x: number, y: number, charBounds: DOMRect): boolean {
  return x >= charBounds.left
    && x <= charBounds.right
    && y >= charBounds.top
    && y <= charBounds.bottom;
}
```

---

## **8. Always-On-Top Behavior**

### **8.1. Topmost setup**

```rust
unsafe {
    SetWindowPos(
        hwnd,
        HWND_TOPMOST,
        0, 0, 0, 0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
    )?;
}
```

### **8.2. Fullscreen exception**

Khi DesktopAwareness emit `FullscreenEntered`:

```rust
pub async fn handle_fullscreen_entered(&self, category: AppCategory) -> Result<()> {
    match category {
        AppCategory::Game => {
            // Game: hide overlay hoàn toàn
            self.hide().await?;
        }
        AppCategory::Media | AppCategory::Browser => {
            // Video: untopmost, vẫn hiện ở góc
            self.set_topmost(false).await?;
        }
        AppCategory::Communication => {
            // Meeting: hide để tránh che camera
            self.hide().await?;
        }
        _ => {
            // Other fullscreen: untopmost
            self.set_topmost(false).await?;
        }
    }
    Ok(())
}
```

### **8.3. Restore on fullscreen exit**

```rust
pub async fn handle_fullscreen_exited(&self) -> Result<()> {
    let state = self.state.read().await;
    if state.is_visible {
        self.set_topmost(true).await?;
        self.show().await?;
    }
    Ok(())
}
```

### **8.4. Z-order conflicts**

```text
Vấn đề: 2 topmost windows tranh nhau.
Giải pháp:
  - SetForegroundWindow KHÔNG gọi (steal focus).
  - SetWindowPos với HWND_TOPMOST định kỳ (mỗi 5s) để giữ vị trí.
  - Skip nếu fullscreen detected.
```

---

## **9. Anchor System**

### **9.1. Anchor calculation**

```rust
pub fn compute_anchor_position(
    anchor: AnchorMode,
    monitor: &MonitorInfo,
    window_size: LogicalSize,
    taskbar_rect: Option<rect>,
) -> LogicalPosition {
    let mw = monitor.bounds.width as f64;
    let mh = monitor.bounds.height as f64;
    let mx = monitor.bounds.x as f64;
    let my = monitor.bounds.y as f64;
    let ww = window_size.width;
    let wh = window_size.height;

    let taskbar_h = taskbar_rect.map(|r| (r.bottom - r.top) as f64).unwrap_or(40.0);

    match anchor {
        AnchorMode::TaskbarRight => LogicalPosition {
            x: mx + mw - ww - 20.0,
            y: my + mh - wh - taskbar_h - 10.0,
        },
        AnchorMode::TaskbarLeft => LogicalPosition {
            x: mx + 20.0,
            y: my + mh - wh - taskbar_h - 10.0,
        },
        AnchorMode::TaskbarCenter => LogicalPosition {
            x: mx + (mw - ww) / 2.0,
            y: my + mh - wh - taskbar_h - 10.0,
        },
        AnchorMode::BottomRight => LogicalPosition {
            x: mx + mw - ww - 20.0,
            y: my + mh - wh - 20.0,
        },
        AnchorMode::BottomLeft => LogicalPosition {
            x: mx + 20.0,
            y: my + mh - wh - 20.0,
        },
        AnchorMode::TopRight => LogicalPosition {
            x: mx + mw - ww - 20.0,
            y: my + 20.0,
        },
        AnchorMode::TopLeft => LogicalPosition {
            x: mx + 20.0,
            y: my + 20.0,
        },
        AnchorMode::Floating => LogicalPosition { x: 0.0, y: 0.0 },
        AnchorMode::PinnedToApp => LogicalPosition { x: 0.0, y: 0.0 },
    }
}
```

### **9.2. Taskbar detection**

```rust
pub fn get_taskbar_rect() -> Option<rect> {
    unsafe {
        let mut data = APPBARDATA {
            cbSize: std::mem::size_of::<appbardata>() as u32,
            ..Default::default()
        };
        let result = SHAppBarMessage(ABM_GETTASKBARPOS, &mut data);
        if result != 0 {
            Some(data.rc)
        } else {
            None
        }
    }
}
```

### **9.3. Snap zones**

Khi user drag window gần edge, snap về anchor gần nhất:

```rust
pub fn detect_snap_anchor(
    position: LogicalPosition,
    window_size: LogicalSize,
    monitor: &MonitorInfo,
    snap_threshold: f64,
) -> Option<anchormode> {
    let mw = monitor.bounds.width as f64;
    let mh = monitor.bounds.height as f64;
    let dist_left = position.x;
    let dist_right = mw - (position.x + window_size.width);
    let dist_top = position.y;
    let dist_bottom = mh - (position.y + window_size.height);

    let is_near_left = dist_left < snap_threshold;
    let is_near_right = dist_right < snap_threshold;
    let is_near_top = dist_top < snap_threshold;
    let is_near_bottom = dist_bottom < snap_threshold;

    match (is_near_left, is_near_right, is_near_top, is_near_bottom) {
        (true, _, _, true) => Some(AnchorMode::BottomLeft),
        (_, true, _, true) => Some(AnchorMode::BottomRight),
        (true, _, true, _) => Some(AnchorMode::TopLeft),
        (_, true, true, _) => Some(AnchorMode::TopRight),
        (_, _, _, true) => Some(AnchorMode::TaskbarRight),
        _ => None,
    }
}
```

### **9.4. PinnedToApp mode**

Follow foreground window:

```text
Khi anchor = PinnedToApp:
  - Subscribe ForegroundWindowChanged event.
  - On change: GetWindowRect(new_foreground).
  - Move overlay tới góc của window đó (configurable: top-right, bottom-right).
  - Throttle 200ms để tránh jitter.
```

---

## **10. Window Movement & Drag**

### **10.1. Drag detection**

```text
User press mouse down on character (opaque pixel)
  ↓
Frontend emit overlay_drag_start
  ↓
Rust: SetCapture(hwnd)
  ↓
On mousemove: compute delta, SetWindowPos
  ↓
On mouseup: ReleaseCapture, detect snap, save state
```

### **10.2. Frontend drag handler**

```typescript
let dragOrigin: { x: number; y: number } | null = null;

canvas.addEventListener("pointerdown", async (e) => {
  if (!hitbox.isOpaque(e.clientX, e.clientY)) return;

  const winPos = await invoke<logicalposition>("overlay_get_position");
  dragOrigin = {
    x: e.screenX - winPos.x,
    y: e.screenY - winPos.y,
  };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", async (e) => {
  if (!dragOrigin) return;
  await invoke("overlay_move_to", {
    position: {
      x: e.screenX - dragOrigin.x,
      y: e.screenY - dragOrigin.y,
    },
  });
});

canvas.addEventListener("pointerup", async (e) => {
  if (!dragOrigin) return;
  dragOrigin = null;
  canvas.releasePointerCapture(e.pointerId);
  await invoke("overlay_drag_end");
});
```

### **10.3. Rust move command**

```rust
#[tauri::command]
pub async fn overlay_move_to(
    window: tauri::Window,
    position: LogicalPosition,
) -> Result<(), String> {
    window.set_position(tauri::Position::Logical(
        tauri::LogicalPosition::new(position.x, position.y),
    )).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn overlay_drag_end(
    manager: tauri::State<'_, Arc<overlaywindowmanager>>,
) -> Result<(), String> {
    manager.handle_drag_end().await.map_err(|e| e.to_string())
}
```

### **10.4. Snap on drag end**

```rust
pub async fn handle_drag_end(&self) -> Result<()> {
    let pos = self.get_position().await?;
    let size = self.get_size().await?;
    let monitor = self.get_current_monitor().await?;

    if let Some(snap_anchor) = detect_snap_anchor(pos, size, &monitor, 30.0) {
        let snapped_pos = compute_anchor_position(
            snap_anchor,
            &monitor,
            size,
            get_taskbar_rect(),
        );
        self.move_to(snapped_pos).await?;
        self.set_anchor(snap_anchor).await?;
    } else {
        self.set_anchor(AnchorMode::Floating).await?;
    }

    self.save_state().await?;
    Ok(())
}
```

---

## **11. Multi-Monitor Handling**

### **11.1. Monitor enumeration**

```rust
pub fn enumerate_monitors() -> Result<vec<monitorinfo>> {
    let mut monitors = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            HDC::default(),
            None,
            Some(monitor_enum_proc),
            LPARAM(&mut monitors as *mut _ as isize),
        );
    }
    Ok(monitors)
}

unsafe extern "system" fn monitor_enum_proc(
    monitor: HMONITOR,
    _hdc: HDC,
    _rect: *mut RECT,
    data: LPARAM,
) -> BOOL {
    let monitors = &mut *(data.0 as *mut Vec<monitorinfo>);
    let mut mi = MONITORINFOEXW {
        monitorInfo: MONITORINFO {
            cbSize: std::mem::size_of::<monitorinfoexw>() as u32,
            ..Default::default()
        },
        ..Default::default()
    };
    if GetMonitorInfoW(monitor, &mut mi.monitorInfo as *mut _).as_bool() {
        monitors.push(MonitorInfo::from_win32(&mi));
    }
    TRUE
}
```

### **11.2. Monitor change detection**

Subscribe `WM_DISPLAYCHANGE`:

```rust
pub fn install_display_change_handler(hwnd: HWND, callback: Arc<dyn fn()="" +="" send="" sync="">) {
    // Subclass window proc to intercept WM_DISPLAYCHANGE
    // On event: re-enumerate, recompute anchor position
}
```

### **11.3. Monitor remove recovery**

```rust
pub async fn handle_monitor_removed(&self) -> Result<()> {
    let monitors = enumerate_monitors()?;
    let current_pos = self.get_position().await?;

    let still_visible = monitors.iter().any(|m| {
        current_pos.x >= m.bounds.x as f64
            && current_pos.x < (m.bounds.x + m.bounds.width as i32) as f64
            && current_pos.y >= m.bounds.y as f64
            && current_pos.y < (m.bounds.y + m.bounds.height as i32) as f64
    });

    if !still_visible {
        // Move to primary monitor
        let primary = monitors.iter().find(|m| m.is_primary)
            .ok_or_else(|| anyhow!("no primary monitor"))?;
        let size = self.get_size().await?;
        let new_pos = compute_anchor_position(
            AnchorMode::TaskbarRight,
            primary,
            size,
            get_taskbar_rect(),
        );
        self.move_to(new_pos).await?;
    }
    Ok(())
}
```

### **11.4. Per-monitor state**

```rust
pub struct MonitorPreferences {
    pub preferred_monitor_id: Option<string>,
    pub per_monitor_anchor: HashMap<string, anchormode="">,
}
```

User có thể set anchor riêng cho từng monitor (laptop vs external).

---

## **12. DPI Scaling**

### **12.1. DPI awareness manifest**

```xml
<!-- app.manifest -->
<application xmlns="urn:schemas-microsoft-com:asm.v3">
  <windowssettings>
    <dpiawareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">
      PerMonitorV2
    </dpiawareness>
  </windowssettings>
</application>
```

### **12.2. Logical vs Physical pixels**

```text
- Logical: dùng trong code (DPI-independent).
- Physical: dùng khi gọi Win32 API.
- Conversion: physical = logical * (dpi / 96).
```

### **12.3. DPI change handling**

```rust
pub async fn handle_dpi_changed(&self, new_dpi: u32) -> Result<()> {
    let scale = new_dpi as f32 / 96.0;
    let mut state = self.state.write().await;
    state.scale = scale;

    // Recompute size based on logical size
    let physical_size = LogicalSize {
        width: state.size.width * scale as f64,
        height: state.size.height * scale as f64,
    };

    self.apply_physical_size(physical_size).await?;
    self.event_bus.emit(OverlayEvent::DpiChanged { scale });
    Ok(())
}
```

### **12.4. Mixed DPI handling**

```text
Khi user drag window từ monitor 100% sang 150%:
  1. WM_DPICHANGED nhận DPI mới.
  2. Win32 đề xuất rect mới (đã scale).
  3. App accept rect đó (SetWindowPos).
  4. Recompute WebView2 size logically.
  5. Update Three.js canvas resolution.
  6. Rebuild hitbox cache với resolution mới.
```

---

## **13. Z-Order Management**

### **13.1. Z-order policy**

| **Scenario** | **Topmost?** | **Visible?** |
|---|---|---|
| Normal | Yes | Yes |
| Fullscreen game | No | No (hide) |
| Fullscreen video | No | Yes (lower) |
| Meeting (camera) | No | No (hide) |
| Private mode | Yes | Yes |
| User hidden (hotkey) | - | No |

### **13.2. Topmost refresh**

```rust
pub async fn refresh_topmost(&self) -> Result<()> {
    let state = self.state.read().await;
    if !state.is_visible { return Ok(()); }

    let mode = self.awareness.current_mode().await;
    let should_topmost = matches!(
        mode,
        AppMode::Normal | AppMode::Focus | AppMode::Idle | AppMode::Private
    );

    self.set_topmost(should_topmost).await?;
    Ok(())
}
```

### **13.3. Topmost timer**

```rust
pub async fn run_topmost_keeper(manager: Arc<overlaywindowmanager>) {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    loop {
        interval.tick().await;
        if let Err(e) = manager.refresh_topmost().await {
            tracing::warn!("topmost refresh failed: {}", e);
        }
    }
}
```

### **13.4. Awareness event integration**

```rust
pub async fn subscribe_awareness_events(
    manager: Arc<overlaywindowmanager>,
    mut rx: broadcast::Receiver<awarenessevent>,
) {
    while let Ok(event) = rx.recv().await {
        match event {
            AwarenessEvent::FullscreenEntered { category, .. } => {
                let _ = manager.handle_fullscreen_entered(category).await;
            }
            AwarenessEvent::FullscreenExited { .. } => {
                let _ = manager.handle_fullscreen_exited().await;
            }
            AwarenessEvent::ModeChanged { to, .. } => {
                let _ = manager.handle_mode_changed(to).await;
            }
            _ => {}
        }
    }
}
```

---

## **14. Auto-Hide System**

### **14.1. Hide triggers**

```text
- Fullscreen game detected → hide.
- Fullscreen meeting detected → hide.
- User hotkey (default Ctrl+Shift+H) → toggle.
- User radial menu "Hide" → hide.
- Idle mode (optional) → hide after 30min.
- Private mode (optional) → hide.
```

### **14.2. Hide flow**

```rust
pub async fn hide(&self) -> Result<()> {
    self.window.hide()?;

    let mut state = self.state.write().await;
    state.is_visible = false;

    // Save state but don't save is_visible (user wants persistent visibility)
    self.persist_position_only().await?;

    self.event_bus.emit(OverlayEvent::Hidden);
    Ok(())
}

pub async fn show(&self) -> Result<()> {
    self.window.show()?;
    self.refresh_topmost().await?;

    let mut state = self.state.write().await;
    state.is_visible = true;

    self.event_bus.emit(OverlayEvent::Shown);
    Ok(())
}
```

### **14.3. Restore policy**

```text
On fullscreen exit:
  - If user manually hid → stay hidden.
  - If auto-hidden by fullscreen → restore.
  - Track hide_reason in state.
```

```rust
#[derive(Debug, Clone, Copy)]
pub enum HideReason {
    UserManual,
    FullscreenGame,
    FullscreenMeeting,
    IdleTimeout,
    PrivateMode,
}
```

---

## **15. Resize & Scale**

### **15.1. Manual resize**

User có thể resize bằng:
- Scroll wheel trên character (Ctrl+scroll).
- Radial menu → resize handle.
- Settings UI slider.

### **15.2. Scale vs Resize**

| **Operation** | **Window size** | **Character size** |
|---|---|---|
| **Resize** | Đổi | Đổi (fit) |
| **Scale** | Đổi | Tỷ lệ thuận |

```rust
pub async fn set_scale(&self, scale: f32) -> Result<()> {
    let base_size = LogicalSize { width: 300.0, height: 400.0 };
    let new_size = LogicalSize {
        width: base_size.width * scale as f64,
        height: base_size.height * scale as f64,
    };
    self.resize(new_size).await?;

    let mut state = self.state.write().await;
    state.scale = scale;
    Ok(())
}
```

### **15.3. Constraints**

```text
- min_size: 200x280 (character vẫn nhìn rõ).
- max_size: 800x1000 (không che quá nhiều màn hình).
- Aspect ratio: locked (configurable).
```

### **15.4. Re-anchor after resize**

```rust
pub async fn resize(&self, new_size: LogicalSize) -> Result<()> {
    let constrained = self.constrain_size(new_size);
    self.window.set_size(tauri::Size::Logical(
        tauri::LogicalSize::new(constrained.width, constrained.height),
    ))?;

    let state = self.state.read().await;
    if state.anchor != AnchorMode::Floating {
        // Re-apply anchor with new size
        let monitor = self.get_current_monitor().await?;
        let new_pos = compute_anchor_position(
            state.anchor,
            &monitor,
            constrained,
            get_taskbar_rect(),
        );
        drop(state);
        self.move_to(new_pos).await?;
    }
    Ok(())
}
```

---

## **16. Sub-Windows (Chat, Bubble)**

### **16.1. Bubble window**

```text
- Tauri window label: "bubble"
- Transparent, no chrome.
- Topmost, click-through.
- Anchored to main overlay (above character head).
- Auto-hide khi message hết.
```

### **16.2. Bubble position calculation**

```rust
pub fn compute_bubble_position(
    overlay_pos: LogicalPosition,
    overlay_size: LogicalSize,
    bubble_size: LogicalSize,
) -> LogicalPosition {
    LogicalPosition {
        x: overlay_pos.x + (overlay_size.width - bubble_size.width) / 2.0,
        y: overlay_pos.y - bubble_size.height - 10.0,
    }
}
```

### **16.3. Sync on overlay move**

```rust
pub async fn sync_bubble_position(&self) -> Result<()> {
    let overlay_pos = self.get_position().await?;
    let overlay_size = self.get_size().await?;
    let bubble = self.bubble_window.as_ref().ok_or_else(|| anyhow!("no bubble"))?;
    let bubble_size = bubble.size().await?;

    let bubble_pos = compute_bubble_position(overlay_pos, overlay_size, bubble_size);
    bubble.set_position(bubble_pos).await?;
    Ok(())
}
```

### **16.4. Chat panel window**

```text
- Tauri window label: "chat"
- Standard chrome (resizable, close button).
- Not always-on-top (focus có thể switch).
- Spawn near overlay nhưng độc lập.
- User có thể dock vào overlay (optional).
```

### **16.5. Chat panel show**

```rust
pub async fn show_chat_panel(&self) -> Result<()> {
    if let Some(chat) = self.chat_window.as_ref() {
        chat.show().await?;
        chat.set_focus().await?;
    } else {
        self.create_chat_window().await?;
    }
    Ok(())
}
```

---

## **17. Backend: OverlayWindowManager**

### **17.1. Module trách nhiệm**

```rust
pub struct OverlayWindowManager {
    main_window: Arc<tauri::window>,
    bubble_window: RwLock<option<arc<tauri::window>>>,
    chat_window: RwLock<option<arc<tauri::window>>>,
    state: Arc<rwlock<overlaywindowstate>>,
    config: OverlayWindowConfig,
    platform: Arc<dyn platformwindowadapter="">,
    event_bus: Arc<overlayeventbus>,
    persistence: Arc<windowstatepersistence>,
}
```

### **17.2. Public methods**

```rust
impl OverlayWindowManager {
    pub async fn init(
        app: &tauri::AppHandle,
        config: OverlayWindowConfig,
    ) -> Result<self>;

    // Lifecycle
    pub async fn show(&self) -> Result<()>;
    pub async fn hide(&self) -> Result<()>;
    pub async fn toggle(&self) -> Result<()>;
    pub async fn shutdown(&self) -> Result<()>;

    // Position & Size
    pub async fn get_position(&self) -> Result<logicalposition>;
    pub async fn get_size(&self) -> Result<logicalsize>;
    pub async fn move_to(&self, pos: LogicalPosition) -> Result<()>;
    pub async fn resize(&self, size: LogicalSize) -> Result<()>;
    pub async fn set_scale(&self, scale: f32) -> Result<()>;

    // Anchor
    pub async fn set_anchor(&self, anchor: AnchorMode) -> Result<()>;
    pub async fn apply_anchor(&self) -> Result<()>;

    // Click-through
    pub async fn set_click_through(&self, enabled: bool) -> Result<()>;
    pub async fn update_hit_test_region(&self, region: HitTestRegion) -> Result<()>;

    // Topmost
    pub async fn set_topmost(&self, enabled: bool) -> Result<()>;
    pub async fn refresh_topmost(&self) -> Result<()>;

    // Sub-windows
    pub async fn show_bubble(&self, content: BubbleContent) -> Result<()>;
    pub async fn hide_bubble(&self) -> Result<()>;
    pub async fn show_chat_panel(&self) -> Result<()>;
    pub async fn hide_chat_panel(&self) -> Result<()>;

    // Events
    pub async fn handle_fullscreen_entered(&self, category: AppCategory) -> Result<()>;
    pub async fn handle_fullscreen_exited(&self) -> Result<()>;
    pub async fn handle_mode_changed(&self, mode: AppMode) -> Result<()>;
    pub async fn handle_dpi_changed(&self, scale: f32) -> Result<()>;
    pub async fn handle_monitor_change(&self) -> Result<()>;

    // Drag
    pub async fn handle_drag_end(&self) -> Result<()>;

    // Persistence
    pub async fn save_state(&self) -> Result<()>;
    pub async fn load_state(&self) -> Result<()>;

    // Subscription
    pub fn subscribe_events(&self) -> broadcast::Receiver<overlayevent>;
}
```

### **17.3. Events**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum OverlayEvent {
    Shown,
    Hidden,
    Moved { position: LogicalPosition },
    Resized { size: LogicalSize },
    AnchorChanged { anchor: AnchorMode },
    DpiChanged { scale: f32 },
    MonitorChanged { monitor_id: String },
    ClickThroughChanged { enabled: bool },
    BubbleShown,
    BubbleHidden,
    ChatPanelOpened,
    ChatPanelClosed,
}
```

---

## **18. Platform Adapter (Windows)**

### **18.1. PlatformWindowAdapter trait**

```rust
#[async_trait::async_trait]
pub trait PlatformWindowAdapter: Send + Sync {
    async fn apply_overlay_styles(&self, hwnd: u64) -> Result<()>;
    async fn set_click_through(&self, hwnd: u64, enabled: bool) -> Result<()>;
    async fn set_topmost(&self, hwnd: u64, enabled: bool) -> Result<()>;
    async fn set_no_activate(&self, hwnd: u64, enabled: bool) -> Result<()>;
    async fn get_taskbar_rect(&self) -> Option<rect>;
    async fn enumerate_monitors(&self) -> Result<vec<monitorinfo>>;
    async fn get_current_monitor(&self, hwnd: u64) -> Result<monitorinfo>;
}
```

### **18.2. Windows implementation**

```rust
pub struct WindowsAdapter;

#[async_trait::async_trait]
impl PlatformWindowAdapter for WindowsAdapter {
    async fn apply_overlay_styles(&self, hwnd: u64) -> Result<()> {
        let hwnd = HWND(hwnd as isize);
        tokio::task::spawn_blocking(move || {
            apply_overlay_styles(hwnd)
        }).await?
    }

    async fn set_click_through(&self, hwnd: u64, enabled: bool) -> Result<()> {
        let hwnd = HWND(hwnd as isize);
        tokio::task::spawn_blocking(move || {
            set_full_click_through(hwnd, enabled)
        }).await?
    }

    async fn set_topmost(&self, hwnd: u64, enabled: bool) -> Result<()> {
        let hwnd = HWND(hwnd as isize);
        tokio::task::spawn_blocking(move || unsafe {
            let after = if enabled { HWND_TOPMOST } else { HWND_NOTOPMOST };
            SetWindowPos(
                hwnd,
                after,
                0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            ).map_err(|e| anyhow!("SetWindowPos failed: {}", e))
        }).await?
    }

    async fn enumerate_monitors(&self) -> Result<vec<monitorinfo>> {
        tokio::task::spawn_blocking(|| enumerate_monitors()).await?
    }

    async fn get_current_monitor(&self, hwnd: u64) -> Result<monitorinfo> {
        let hwnd = HWND(hwnd as isize);
        tokio::task::spawn_blocking(move || unsafe {
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            get_monitor_info(monitor)
        }).await?
    }

    async fn set_no_activate(&self, hwnd: u64, enabled: bool) -> Result<()> {
        let hwnd = HWND(hwnd as isize);
        tokio::task::spawn_blocking(move || unsafe {
            let mut ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            if enabled {
                ex |= WS_EX_NOACTIVATE.0 as isize;
            } else {
                ex &= !(WS_EX_NOACTIVATE.0 as isize);
            }
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
            Ok(())
        }).await?
    }

    async fn get_taskbar_rect(&self) -> Option<rect> {
        tokio::task::spawn_blocking(|| get_taskbar_rect()).await.ok().flatten()
    }
}
```

---

## **19. IPC Contract**

### **19.1. Frontend → Rust commands**

| **Command** | **Payload** | **Return** |
|---|---|---|
| `overlay_show` | `{}` | `void` |
| `overlay_hide` | `{}` | `void` |
| `overlay_toggle` | `{}` | `void` |
| `overlay_get_state` | `{}` | `OverlayWindowState` |
| `overlay_get_position` | `{}` | `LogicalPosition` |
| `overlay_get_size` | `{}` | `LogicalSize` |
| `overlay_move_to` | `{ position }` | `void` |
| `overlay_resize` | `{ size }` | `void` |
| `overlay_set_scale` | `{ scale }` | `void` |
| `overlay_set_anchor` | `{ anchor }` | `void` |
| `overlay_set_click_through` | `{ enabled }` | `void` |
| `overlay_set_topmost` | `{ enabled }` | `void` |
| `overlay_drag_end` | `{}` | `void` |
| `overlay_show_bubble` | `BubbleContent` | `void` |
| `overlay_hide_bubble` | `{}` | `void` |
| `overlay_show_chat_panel` | `{}` | `void` |
| `overlay_hide_chat_panel` | `{}` | `void` |
| `overlay_list_monitors` | `{}` | `MonitorInfo[]` |

### **19.2. Rust → Frontend events**

| **Event** | **Payload** | **Mục đích** |
|---|---|---|
| `overlay_shown` | `{}` | UI sync visibility |
| `overlay_hidden` | `{ reason }` | UI sync |
| `overlay_moved` | `{ position }` | Bubble follow |
| `overlay_resized` | `{ size }` | Canvas resize |
| `overlay_anchor_changed` | `{ anchor }` | UI indicator |
| `overlay_dpi_changed` | `{ scale }` | Canvas re-render |
| `overlay_monitor_changed` | `{ monitor_id }` | Recompute layout |
| `overlay_click_through_changed` | `{ enabled }` | UI feedback |
| `overlay_bubble_shown` | `BubbleContent` | UI animate |
| `overlay_bubble_hidden` | `{}` | UI cleanup |

### **19.3. TypeScript IPC types**

```typescript
export interface BubbleContent {
  message: string;
  duration_ms: number;
  emotion?: string;
}

export interface OverlayDragEvent {
  position: LogicalPosition;
}

export interface OverlayResizeEvent {
  size: LogicalSize;
}

export interface MonitorInfo {
  index: number;
  name: string;
  bounds: { x: number; y: number; width: number; height: number };
  dpi_scale: number;
  is_primary: boolean;
}
```

---

## **20. Frontend Integration**

### **20.1. Overlay store (Zustand)**

```typescript
interface OverlayStore {
  state: OverlayWindowState | null;
  isClickThrough: boolean;

  refresh: () => Promise<void>;
  show: () => Promise<void>;
  hide: () => Promise<void>;
  toggle: () => Promise<void>;
  setAnchor: (anchor: AnchorMode) => Promise<void>;
  setScale: (scale: number) => Promise<void>;
}

export const useOverlayStore = create<overlaystore>((set, get) => ({
  state: null,
  isClickThrough: true,

  refresh: async () => {
    const state = await invoke<overlaywindowstate>("overlay_get_state");
    set({ state });
  },

  show: async () => {
    await invoke("overlay_show");
    await get().refresh();
  },

  hide: async () => {
    await invoke("overlay_hide");
    await get().refresh();
  },

  toggle: async () => {
    await invoke("overlay_toggle");
    await get().refresh();
  },

  setAnchor: async (anchor) => {
    await invoke("overlay_set_anchor", { anchor });
    await get().refresh();
  },

  setScale: async (scale) => {
    await invoke("overlay_set_scale", { scale });
    await get().refresh();
  },
}));
```

### **20.2. Canvas integration**

```typescript
function setupCanvasInteraction(canvas: HTMLCanvasElement) {
  const hitbox = new HitboxCache(canvas.width, canvas.height);

  // Rebuild hitbox periodically
  setInterval(() => {
    if (animationIsActive()) {
      hitbox.rebuild(canvas);
    }
  }, 100);

  // Update click-through on hover
  canvas.addEventListener("pointermove", (e) => {
    const opaque = hitbox.isOpaque(e.clientX, e.clientY);
    updateClickThrough(!opaque);
  });

  // Drag handler
  setupDragHandler(canvas, hitbox);

  // Right click → radial menu
  canvas.addEventListener("contextmenu", (e) => {
    if (hitbox.isOpaque(e.clientX, e.clientY)) {
      e.preventDefault();
      openRadialMenu(e.clientX, e.clientY);
    }
  });
}
```

### **20.3. Bubble component**

```tsx
export function SpeechBubble() {
  const [content, setContent] = useState<bubblecontent |="" null="">(null);

  useEffect(() => {
    const unlisten = listen<bubblecontent>("overlay_bubble_shown", (e) => {
      setContent(e.payload);
      setTimeout(() => setContent(null), e.payload.duration_ms);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  if (!content) return null;

  return (
    <div classname="speech-bubble">
      <p>{content.message}</p>
    </div>
  );
}
```

---

## **21. Performance Considerations**

### **21.1. RAM budget**

```text
Target: < 50MB for overlay window subsystem.

Breakdown:
  - Main window WebView: ~30MB.
  - Bubble window: ~5MB (loaded on demand).
  - Hitbox cache: ~50KB (1/4 res RGBA).
  - State + config: ~10KB.
```

### **21.2. CPU budget**

| **Operation** | **Frequency** | **CPU** |
|---|---|---|
| Hitbox rebuild | 10 Hz (active) | ~0.1% |
| Topmost refresh | 0.2 Hz | < 0.01% |
| Move/resize event | On user action | Negligible |
| Click-through toggle | Debounced 50ms | < 0.01% |

### **21.3. GPU budget**

```text
- Layered window composition: GPU-accelerated trên Win10+.
- Transparent canvas blend: ~1ms/frame on integrated GPU.
- Avoid: filter/blur effects trên overlay (chậm).
```

### **21.4. Battery**

```text
- Pause rendering khi window hidden.
- Giảm FPS xuống 30 khi battery < 20%.
- Pause topmost refresh khi battery saver mode.
```

---

## **22. Error Handling**

### **22.1. Error types**

```rust
#[derive(Debug, thiserror::Error)]
pub enum OverlayError {
    #[error("Window creation failed: {0}")]
    WindowCreationFailed(String),

    #[error("Win32 API failed: {0}")]
    Win32Failed(String),

    #[error("Monitor not found")]
    MonitorNotFound,

    #[error("Invalid position: {0:?}")]
    InvalidPosition(LogicalPosition),

    #[error("State persistence failed: {0}")]
    StatePersistenceFailed(String),

    #[error("Sub-window not initialized: {0}")]
    SubWindowNotInitialized(String),

    #[error("DPI query failed")]
    DpiQueryFailed,
}
```

### **22.2. Recovery matrix**

| **Lỗi** | **Hành vi** |
|---|---|
| Window creation fail | Retry 1 lần, sau đó alert |
| Win32 style apply fail | Log warn, dùng default Tauri window |
| Monitor không tồn tại | Fallback primary monitor |
| Position ngoài bounds | Clamp về monitor gần nhất |
| State load fail | Dùng default state |
| State save fail | Retry 1 lần, log error |
| Sub-window create fail | Disable feature, không crash main |
| DPI query fail | Assume scale = 1.0 |

### **22.3. Crash recovery**

```text
On app start:
  1. Try load saved state.
  2. Validate position (within any monitor?).
  3. If invalid → reset to default anchor.
  4. Create main window.
  5. Apply Win32 styles.
  6. If style apply fail → log, continue with default.
  7. Show window.
  8. If show fail → retry with default position.
```

---

## **23. File Structure**

```text
chiro-pet/
├── src-tauri/
│   └── src/
│       └── core/
│           └── overlay/
│               ├── mod.rs
│               ├── types.rs
│               ├── manager.rs
│               ├── state.rs
│               ├── anchor.rs
│               ├── hitbox.rs
│               ├── drag.rs
│               ├── resize.rs
│               ├── topmost.rs
│               ├── monitor.rs
│               ├── dpi.rs
│               ├── persistence.rs
│               ├── events.rs
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
│           └── overlay_commands.rs
│
├── src/
│   ├── overlay/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── CharacterCanvas.tsx
│   │   │   ├── SpeechBubble.tsx
│   │   │   ├── RadialMenu.tsx
│   │   │   └── DragHandle.tsx
│   │   ├── hooks/
│   │   │   ├── useHitbox.ts
│   │   │   ├── useDrag.ts
│   │   │   └── useClickThrough.ts
│   │   └── stores/
│   │       └── overlayStore.ts
│   │
│   ├── bubble/
│   │   └── App.tsx
│   │
│   ├── chat/
│   │   └── App.tsx
│   │
│   └── shared/
│       └── types/
│           └── overlay.ts
│
└── docs/
    └── overlay-window-system.md
```

---

## **24. Implementation Checklist**

### **24.1. P0 Core**

- [ ] Tauri overlay window config (`transparent`, `decorations: false`).
- [ ] Apply Win32 extended styles (`WS_EX_LAYERED`, `WS_EX_TOOLWINDOW`, `WS_EX_NOACTIVATE`, `WS_EX_TOPMOST`).
- [ ] CSS transparent body.
- [ ] WebView2 background transparency.
- [ ] Define `OverlayWindowState`, `OverlayWindowConfig`.
- [ ] Implement `OverlayWindowManager`.
- [ ] Show/hide commands.
- [ ] Move/resize commands.

### **24.2. P0 Click-Through**

- [ ] WebGL alpha read function.
- [ ] `HitboxCache` class.
- [ ] Periodic hitbox rebuild (100ms).
- [ ] Pointermove → click-through toggle.
- [ ] Debounce 50ms.
- [ ] IPC `overlay_set_click_through`.

### **24.3. P0 Anchor**

- [ ] `AnchorMode` enum + position computation.
- [ ] Taskbar detection (`SHAppBarMessage`).
- [ ] Apply anchor on init.
- [ ] Snap detection on drag end.
- [ ] Save/load anchor in state.

### **24.4. P0 Drag**

- [ ] Pointerdown on opaque pixel → start drag.
- [ ] Pointermove → move window.
- [ ] Pointerup → drag end + snap.

### **24.5. P0 Topmost & Awareness**

- [ ] `SetWindowPos` topmost.
- [ ] Topmost refresh timer (5s).
- [ ] Subscribe Awareness events.
- [ ] Auto-hide on fullscreen game.
- [ ] Untopmost on fullscreen video.
- [ ] Restore on fullscreen exit.

### **24.6. P0 Persistence**

- [ ] Save state on move/resize/anchor change.
- [ ] Load state on startup.
- [ ] Validate position within monitors.
- [ ] Reset to default if invalid.

### **24.7. P1 Multi-Monitor**

- [ ] Enumerate monitors.
- [ ] Subscribe `WM_DISPLAYCHANGE`.
- [ ] Handle monitor remove (fallback primary).
- [ ] Per-monitor anchor preferences.

### **24.8. P1 DPI**

- [ ] App manifest `PerMonitorV2`.
- [ ] Subscribe `WM_DPICHANGED`.
- [ ] Recompute size on DPI change.
- [ ] Rebuild hitbox cache.

### **24.9. P1 Sub-Windows**

- [ ] Create bubble window (transparent, click-through).
- [ ] Sync bubble position on overlay move.
- [ ] Create chat panel window.
- [ ] Show/hide chat panel commands.

### **24.10. P1 Resize**

- [ ] Scroll wheel + Ctrl → resize.
- [ ] Settings slider for scale.
- [ ] Re-anchor after resize.
- [ ] Constraints (min/max).

### **24.11. P2 Polish**

- [ ] `PinnedToApp` anchor mode.
- [ ] Radial menu window.
- [ ] Custom hotkey integration.
- [ ] Animation crossfade on move.
- [ ] Battery-aware FPS.
- [ ] Performance benchmarks.

---

## **25. Glossary**

| **Thuật ngữ** | **Định nghĩa** |
|---|---|
| **Overlay Window** | Cửa sổ trong suốt hiển thị character trên desktop. |
| **Layered Window** | Win32 window dùng per-pixel alpha. |
| **Click-Through** | Click xuyên qua vùng trong suốt xuống app dưới. |
| **Hit-Test** | Phép kiểm tra pixel tại tọa độ có opaque hay không. |
| **Hitbox Cache** | Bản sao alpha mask low-res để hit-test nhanh. |
| **Anchor** | Chế độ neo vị trí window (taskbar, corner, floating). |
| **Snap** | Tự động neo về anchor gần nhất khi drag gần edge. |
| **Topmost** | Window luôn ở trên các window khác. |
| **WS_EX_NOACTIVATE** | Style chống steal focus khi click. |
| **WS_EX_TOOLWINDOW** | Style ẩn window khỏi Alt-Tab. |
| **DPI Scale** | Hệ số scale theo monitor (1.0 = 96 DPI, 1.5 = 144 DPI). |
| **Per-Monitor DPI** | Mỗi monitor có DPI riêng (laptop vs external 4K). |
| **Sub-Window** | Window con (bubble, chat) anchored vào overlay chính. |

---

# **Phụ lục A: Flow khởi tạo overlay**

```text
App start
  ↓
Load saved OverlayWindowState từ disk
  ↓
Validate state:
  - position trong monitors?
  - size hợp lệ?
  - anchor hợp lệ?
  ↓
If invalid → reset to default
  ↓
Tauri create window "overlay":
  - transparent: true
  - decorations: false
  - alwaysOnTop: true
  - skipTaskbar: true
  - visible: false
  ↓
Get HWND từ Tauri window
  ↓
PlatformAdapter.apply_overlay_styles(hwnd):
  - WS_EX_LAYERED
  - WS_EX_TOOLWINDOW
  - WS_EX_NOACTIVATE
  - WS_EX_TOPMOST
  ↓
WebView2 set transparent background
  ↓
Compute anchor position:
  - get current monitor
  - get taskbar rect
  - compute_anchor_position(anchor, monitor, size, taskbar)
  ↓
Move window to anchor position
  ↓
Setup subscribers:
  - Awareness events (fullscreen, mode change)
  - DPI change events
  - Monitor change events
  ↓
Start topmost keeper (5s timer)
  ↓
Show window (if state.is_visible)
  ↓
Emit OverlayEvent::Shown
  ↓
Frontend receives event, starts rendering character
```

---

# **Phụ lục B: Flow click-through dynamic**

```text
User moves cursor over overlay window
  ↓
Frontend pointermove handler:
  x, y = e.clientX, e.clientY
  ↓
HitboxCache.isOpaque(x, y):
  cx = floor(x / 4)
  cy = floor(y / 4)
  return mask[cy * w + cx] >= 10
  ↓
If opaque (character pixel):
  → want click-catch
  → invoke overlay_set_click_through(false)
  ↓
If transparent (background):
  → want click-through
  → invoke overlay_set_click_through(true)
  ↓
Debounce 50ms before IPC call
  ↓
Rust handler:
  ↓
PlatformAdapter.set_click_through(hwnd, enabled):
  GetWindowLongPtr(GWL_EXSTYLE)
  if enabled: ex |= WS_EX_TRANSPARENT
  else: ex &= !WS_EX_TRANSPARENT
  SetWindowLongPtr(GWL_EXSTYLE, ex)
  ↓
Win32 OS now routes clicks accordingly
  ↓
Emit OverlayEvent::ClickThroughChanged
  ↓
Periodic hitbox rebuild (100ms):
  WebGL readPixels(0, 0, w/4, h/4)
  Update mask buffer
```

---

# **Phụ lục C: JSON mẫu**

## **C.1. OverlayWindowState mẫu**

```json
{
  "schema_version": 1,
  "anchor": "taskbar_right",
  "position": {
    "x": 1620.0,
    "y": 800.0
  },
  "size": {
    "width": 300.0,
    "height": 400.0
  },
  "monitor_id": "DELL_U2720Q_PRIMARY",
  "scale": 1.0,
  "is_visible": true,
  "last_updated": "2026-05-26T22:00:00Z"
}
```

## **C.2. OverlayWindowConfig mẫu**

```json
{
  "initial_size": { "width": 300.0, "height": 400.0 },
  "min_size": { "width": 200.0, "height": 280.0 },
  "max_size": { "width": 800.0, "height": 1000.0 },
  "default_anchor": "taskbar_right",
  "hit_test_alpha_threshold": 10,
  "always_on_top": true,
  "skip_taskbar": true,
  "show_on_start": true
}
```

## **C.3. BubbleContent mẫu**

```json
{
  "message": "Anh tập trung khá lâu rồi. Nghỉ một chút không?",
  "duration_ms": 6000,
  "emotion": "caring"
}
```

## **C.4. ModeChanged → Overlay reaction**

```json
{
  "type": "mode_changed",
  "from": "normal",
  "to": "gaming",
  "at": "2026-05-26T22:30:00Z"
}
```

Reaction:
```json
{
  "type": "hidden",
  "reason": "fullscreen_game"
}
```

## **C.5. MonitorInfo mẫu**

```json
[
  {
    "index": 0,
    "name": "DELL U2720Q",
    "bounds": { "x": 0, "y": 0, "width": 3840, "height": 2160 },
    "dpi_scale": 1.5,
    "is_primary": true
  },
  {
    "index": 1,
    "name": "Laptop Internal",
    "bounds": { "x": 3840, "y": 0, "width": 1920, "height": 1080 },
    "dpi_scale": 1.0,
    "is_primary": false
  }
]
```

## **C.6. AnchorMode change event**

```json
{
  "type": "anchor_changed",
  "anchor": "bottom_right"
}
```

---

**Tài liệu này là source of truth cho Overlay Window System. Mọi thay đổi liên quan đến window phải tuân thủ nguyên tắc: transparency phải per-pixel, click-through phải chính xác qua hitbox, topmost phải polite (nhường fullscreen game/meeting), DPI phải được handle đúng trên mọi monitor, sub-window phải sync với overlay chính, state phải persist qua restart.**

---