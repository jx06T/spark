# Cyber Booth — 系統架構說明

> 版本 v3.6 | 最後更新 2026-05-29

---

## 系統概覽

Cyber Booth 是一套結合 **TouchDesigner（視覺引擎）** 與 **Node.js（中控伺服器）** 的互動拍貼系統。系統有兩條獨立的資料流：

- **控制流**：Browser ↔ Node.js ↔ TD，透過 Socket.io 與 HTTP 同步狀態與指令
- **視訊流**：實體攝影機 → TD 處理 → NDI 輸出 → 瀏覽器預覽（單向）

```
實體攝影機                                   Node.js Server
(WebCam / DSLR / VDO.ninja)                  server.js / port 5000
       │                                      ▲         │
       │ Video In                    Socket.io│         │HTTP (axios)
       ▼                                      │         ▼
┌──────────────────────────────┐    ┌─────────┴─────────────────┐
│  TouchDesigner  v7.toe       │◄───┤  瀏覽器（前端）             │
│  port 8080                   │    │  index.html（桌面）         │
│                              │    │  remote.html（手機）        │
│  VideoInput → Processing     │    │                            │
│            → NDI Out         ├───►│  vid-webcam                │
│            → File Saver      │    │  （顯示 TD 處理後畫面）      │
└──────────────────────────────┘    └────────────────────────────┘
       │ NDI 6 Webcam（虛擬攝影機驅動）
       └──────────────────────────────► getUserMedia
```

瀏覽器的 `vid-webcam` 讀取的是 **NDI 6 Webcam 虛擬攝影機**（由 NDI 6 工具安裝），而非實體攝影機。因此預覽畫面已包含 TD 的即時特效（長曝光累積、仙女棒粒子等）。`raw_X.png` 存的也是 TD 處理後的輸出幀，不是原始攝影機畫面。

---

## 模組化設計實踐 (Modular Design Implementation)

自 v3.5 起，系統導入了完整的插件化模組架構，旨在達成「視覺特效」與「輸出佈局」的完全解耦。

### 1. 模組解構
每個模組存放於 `modules/{module_name}/`，包含：
- **`effect.tox`**：TouchDesigner 的特效實體，負責即時運算。
- **`manifest.json`**：模組的「身分證」，定義能力、支援的佈局（Layouts）與元件位置。
- **資產文件**：如 `overlay.png` 或其他自定義貼圖。

### 2. 動態載入機制
1. **伺服器掃描**：Node.js 啟動時掃描 `modules/` 資料夾並快取 `manifest.json`。
2. **切換指令**：前端發送 `set_module` 事件。
3. **TD 同步**：Node.js 透過 `POST /set_module` 通知 TD 更換 `.tox`。
4. **配置重載**：Node.js 根據新模組的 `manifest.json` 更新 `activeLayout` 與 `tdCapabilities`，並廣播給所有前端更新 UI。

### 3. 資料驅動合成 (Data-driven Composition)
`composer.js` 不再持有任何硬編碼的佈局資訊。它僅接收由 `server.js` 解析後的 `layout` 物件，並根據其中定義的 `photo_slots` 與 `widgets` 進行繪製。這使得新增主題只需建立 JSON 與圖片，無需修改任何 Javascript 邏輯。

---

## 狀態機（State Machine）

系統共用一套整數狀態定義，Node.js 持有 `currentSystemState` 作為唯一來源，並透過 `status_update` Socket 事件廣播給所有連線裝置。

| State | 名稱 | 誰進入 | 說明 |
|---|---|---|---|
| `0` | RECORDING | Node | 長曝光模式快門開啟，使用者可作畫 |
| `1` | PROCESSING | Node | 合成拍貼圖中（或 snapshot 等待 TD 存檔）|
| `2` | IDLE | Node | 待機，等待拍攝觸發 |
| `3` | COUNTDOWN | Node | 倒數中（Node 的 setTimeout 管理）|
| `4` | REVIEWING | TD → Node | TD 存檔後推送，顯示 KEEP / RETAKE 畫面 |
| `5` | FINISHED | Node | 合成完成，顯示成品與 QR Code |

### 狀態流轉圖

```
                    ┌─────────────────────────┐
                    │   2: IDLE               │◄────────────────────────┐
                    └────────────┬────────────┘                         │
                                 │ trigger_shot                         │
                                 ▼                                       │
                    ┌─────────────────────────┐                         │
                    │   3: COUNTDOWN          │  Node 廣播 3→2→1        │
                    └────────────┬────────────┘                         │
                                 │ 3秒後                                 │
                    ┌────────────▼────────────┐                         │
                    │  依 captureMode 分支    │                         │
                    └──────┬──────────┬───────┘                         │
          recording          │          │ snapshot                        │
                    ┌───────▼──┐  ┌────▼──────┐                        │
                    │ 0: REC   │  │ 1: PROC   │ TD 存檔                 │
                    └───────┬──┘  └────┬──────┘                        │
                    按 STOP │          │ TD → /td_state_update           │
                    ┌───────▼──────────▼──────┐                         │
                    │   4: REVIEWING          │                         │
                    └──────────┬──────────────┘                         │
                 KEEP ◄────────┤────────► RETAKE ──────────────────────►┘
                               │
                 4張集齊 or finish_early
                               │
                    ┌──────────▼──────────────┐
                    │   1: PROCESSING         │ generateFinalCollage()
                    └──────────┬──────────────┘
                               │
                    ┌──────────▼──────────────┐
                    │   5: FINISHED           │
                    └─────────────────────────┘
```

---

## 文件結構與職責

```
spark/
├── server.js           # Node.js 中控伺服器
├── composer.js         # Sharp 影像合成引擎
├── uploader.js         # Supabase 雲端上傳模組
├── public/
│   ├── index.html      # 桌面操作介面
│   └── remote.html     # 手機遙控介面
├── TD/
│   ├── main.toe        # TouchDesigner 專案
│   └── scripts/
│       ├── webserver_callbacks.py  # comm_server Web Server DAT 回調
│       └── trigger_shot.py        # TD 主動觸發快門（選用）
├── modules/            # 視覺效果 + 佈局模組（每個資料夾為一個主題）
│   └── cyber_standard/
│       ├── effect.tox      # TD processing_module（手動在 TD 內建立）
│       ├── manifest.json   # 能力聲明 + 佈局定義
│       └── overlay.png     # 相框圖片
├── docs/               # 說明文件
│   ├── architecture.md
│   └── td-setup.md
└── sessions/           # 拍攝產出（自動建立）
    └── {sessionID}/
        ├── raw_1.png ~ raw_4.png
        └── collage.jpg
```

### TD 模組層次（`v7.toe` 內部）

```
project1/
├── state_holder/           # Base COMP：狀態儲存
│   └── states              # Constant CHOP，3 channels：
│                           #   value0 = state (0/1/2)
│                           #   value1 = session_id (數字，實際路徑由 Python 管理)
│                           #   value2 = photo_index
├── comm_server/            # Base COMP：HTTP 通訊
│   └── webserver1          # Web Server DAT，port 8080
│                           # 回調腳本：TD/scripts/webserver_callbacks.py
└── video_pipeline/         # Container COMP：視覺管線
    ├── video_input_module/ # 攝影機輸入（可抽換 .tox）
    ├── processing_module/  # 特效處理（可抽換 .tox）
    │   ├── switch1         # TOP switch：0=passthrough, 1=特效 feedback
    │   ├── states_ref      # Select CHOP，指向 /project1/state_holder/states
    │   └── chop_exec1      # CHOP Execute DAT，watch states_ref，自管 switch1
    │   # Custom Parameters：SupportsRecording (Toggle), SupportsSnapshot (Toggle)
    └── out_module/         # 輸出模組
        └── final_output    # TOP：供 .save() 存檔用
```

---

## Node.js 伺服器（`server.js`）

### 全域狀態變數

| 變數 | 型別 | 說明 |
|---|---|---|
| `selectedPhotos` | `string[]` | 本次 session 已保留的照片檔名陣列 |
| `currentSessionID` | `string` | 當前 session ID（格式：`ssn_{timestamp}_{random}`）|
| `currentSystemState` | `number` | 當前系統狀態（0–5）|
| `captureMode` | `string` | 拍攝模式：`'recording'` 或 `'snapshot'` |
| `tdCapabilities` | `object` | 當前模組能力：`{ recording: bool, snapshot: bool }`（從 manifest 讀取）|
| `activeModuleName` | `string` | 當前使用的模組資料夾名稱（例如 `'cyber_standard'`）|
| `activeLayout` | `object` | 當前 layout 物件（從 manifest 解析，overlay_path 已為絕對路徑）|
| `availableModules` | `object[]` | 掃描 `modules/` 得到的可用模組清單 |

### 核心函式

#### `broadcastStatusUpdate(payload)`
統一廣播函式。自動更新 `currentSystemState` 並在 payload 附加 `mode`，透過 `io.emit('status_update', ...)` 發送給所有連線裝置。

#### `runCountdown()`
倒數核心邏輯。廣播 state=3 並依序發送 `countdown: 3/2/1`，3 秒後依 `captureMode` 決定後續動作：
- `recording`：廣播 state=0，呼叫 TD `POST /start_recording`
- `snapshot`：廣播 state=1，呼叫 TD `POST /capture_snapshot`

#### `systemFullReset()`
完整重置：清空 `selectedPhotos`、產生新 `sessionID`、呼叫 TD `POST /reset`，再以 `GET /` 取得 TD 回傳的 `module` 名稱，最後從 `manifest.json` 更新 `tdCapabilities` 與 `activeLayout`。TD 離線時沿用上次的模組設定。

#### `loadModuleManifest(moduleName, layoutId?)`
讀取 `modules/{moduleName}/manifest.json`，解析指定的 layout variant（省略時使用 `defaultLayout`），並將 `overlay_path` 轉換為絕對路徑後回傳 `{ capabilities, layout }`。

#### `scanAvailableModules()`
伺服器啟動時掃描 `modules/` 目錄，建立 `availableModules` 清單，並初始化 `activeLayout`。

---

## Socket.io 事件

### 前端 → 伺服器

| 事件 | 觸發時機 | Payload | 行為 |
|---|---|---|---|
| `user_clicked_start` | 頁面載入、START NEW | — | `systemFullReset()` → state 2 |
| `trigger_shot` | TAKE PHOTO 按鈕 | — | 若 state=2，執行 `runCountdown()` |
| `user_clicked_stop` | STOP & SAVE 按鈕 | — | 呼叫 TD `POST /stop_and_save` |
| `choice_keep` | KEEP 按鈕 | `{filename}` | 加入 `selectedPhotos`，滿 4 張進入合成 |
| `choice_retake` | RETAKE 按鈕 | — | state → 2，呼叫 TD `ready_for_next_attempt` |
| `user_clicked_reset` | Emergency Reset | — | `systemFullReset()` → state 2 |
| `user_clicked_finish_early` | Finish Early | — | 循環補齊至 4 張，進入合成 |
| `set_capture_mode` | Mode toggle 按鈕 | `{mode}` | 更新 `captureMode`，廣播給所有裝置 |
| `set_layout` | Layout toggle | `{layoutId}` | 切換 layout variant（不動 TD），廣播新狀態 |
| `set_module` | Module selector | `{moduleId}` | 僅 state=2 時有效，通知 TD 換 .tox，重載 manifest |

### 伺服器 → 前端

| 事件 | Payload | 說明 |
|---|---|---|
| `status_update` | `{state, message, kept?, countdown?, currentFile?, previewUrl?, result?, mode, capabilities?, modules?, currentModule?}` | 所有狀態變化的統一廣播 |

> `previewUrl`：state=4 時由 Node.js 附加，格式為 `/sessions/{sessionID}/{filename}`，供前端直接顯示預覽圖。  
> `capabilities`：從 manifest 讀取，格式為 `{ recording: bool, snapshot: bool }`。  
> `modules`：初次連線及 `set_module` 完成後附帶，`availableModules` 清單的精簡版。  
> `currentModule`：初次連線及 `set_module` 完成後附帶，當前模組資料夾名稱。

---

## HTTP 通訊

### Node.js → TouchDesigner（`http://127.0.0.1:8080`）

| 端點 | 觸發時機 | Body | 說明 |
|---|---|---|---|
| `GET /` | reset 後 | — | 回傳 `{state, photo_index, fps, module}`，Node.js 以 `module` 名稱載入對應 manifest |
| `POST /start_recording` | recording 模式倒數結束 | — | TD 設 state=0，processing_module 自行啟動特效 |
| `POST /capture_snapshot` | snapshot 模式倒數結束 | — | TD 設 state=1，立即排程存檔 |
| `POST /stop_and_save` | 使用者按 STOP | — | TD 設 state=1，processing_module 自行凍結，排程存檔 |
| `POST /ready_for_next_attempt` | KEEP / RETAKE 後 | — | TD 設 state=2（IDLE） |
| `POST /reset` | 系統重置 | `{sessionID}` | TD 重置狀態機與計數器，建立新 session 資料夾 |
| `POST /set_module` | `set_module` socket 事件 | `{module}` | TD 更換 `processing_module` 的 externaltox 並 reinitnet |

> **注意**：所有 axios 呼叫均設有 `timeout: 3000`，TD 未啟動時 3 秒後 fail-fast。

### TouchDesigner → Node.js（`http://127.0.0.1:5000`）

| 端點 | 呼叫時機 | Body | 說明 |
|---|---|---|---|
| `POST /td_state_update` | TD 存檔完成後 | `{state:4, message, currentFile}` | Node 附加 `previewUrl` 後廣播給前端 |
| `POST /td_trigger_shot` | TD 主動觸發（手勢等） | — | 若 state=2，Node 執行 `runCountdown()` |

---

## TD 視覺管線

TD 是系統的視覺核心，負責攝影機輸入、即時特效與畫面輸出。

### 影像輸入來源（擇一）

| 來源 | 方式 |
|---|---|
| USB WebCam | Video Device In TOP，直接存取本機攝影機 |
| DSLR / 攝影機 | 透過採集卡（Capture Card）接入 Video Device In TOP |
| 遠端虛擬鏡頭 | 透過 [VDO.ninja](https://vdo.ninja/) WebRTC → Syphon/Spout → TD |

### Processing 行為

`processing_module` 持續輸出一個「當前可用畫面」，並透過內部的 **CHOP Execute DAT**（watch `states_ref`）自主管理畫面切換，comm_server 只負責設定 state 值。

| 狀態 | processing_module 行為 |
|---|---|
| IDLE (2) / COUNTDOWN (3) | switch1 index=0，直接 passthrough 攝影機輸入 |
| RECORDING (0) | switch1 index=1，啟動 Feedback TOP 幀疊加（由模組自行切換） |
| FINISHED (1) | switch1 index=0，凍結輸出，等待 comm_server 呼叫 `.save()` |

CHOP Execute DAT 核心邏輯：
```python
def onValueChange(channel, sampleIndex, val, prev):
    if channel.name == 'state':
        me.parent().op('switch1').par.index = 1 if val == 0 else 0
```

幀累積（feedback loop）完全由 TD 內部 Feedback TOP 管理，Node.js 不介入幀邏輯。

### processing_module 能力宣告（Capabilities）

自 v3.5 起，**`manifest.json` 為能力的唯一來源**。
- **舊版行為**：Node.js 讀取 TD 節點上的 Custom Parameters。
- **現行行為**：Node.js 根據 `activeModuleName` 讀取硬碟上的 `manifest.json`。
這解決了 TD 在未完全 cook 完成前回傳錯誤參數的問題，並讓前端能在 TD 離線時依然正確顯示 UI 模式。

### 輸出

- **NDI Out**：即時串流給 NDI 6 Webcam 虛擬驅動，瀏覽器透過 `getUserMedia` 讀取預覽
- **final_output (TOP)**：供 `webserver_callbacks.py` 呼叫 `.save()`。路徑由 Node.js 在 `/reset` 時指派，存於 `sessions/{sessionID}/`。

---

## TD 腳本（`TD/scripts/`）

### `webserver_callbacks.py` — comm_server Web Server DAT 回調

掛載於 `comm_server/webserver1`（port 8080），處理來自 Node.js 的所有 HTTP 指令。

路徑約定（腳本位於 `comm_server` Base COMP 內）：
- `me.parent()` = `comm_server`
- `me.parent().parent()` = `project1` 根節點

| 函式 | 說明 |
|---|---|
| `onHTTPRequest` | HTTP 路由入口，dispatch 至各 handler |
| `_handle_reset` | 建立 session 資料夾，重置計數器與 states CHOP |
| `_handle_start_recording` | 設 state=0（processing_module 自行切換 switch） |
| `_handle_stop_and_save` | 設 state=1，排程延遲存檔 |
| `_handle_capture_snapshot` | 設 state=1，排程延遲存檔 |
| `_handle_ready_for_next_attempt` | 設 state=2（IDLE） |
| `_handle_set_module` | 更換 `processing_module` 的 externaltox，呼叫 reinitnet，更新 `active_module` |
| `_schedule_save` | 累加 `attempt_count`，用 `run(..., delayFrames=2)` 延遲 2 幀執行存檔 |
| `do_delayed_save` | 實際呼叫 `final_output.save(filepath)`，完成後呼叫 `notify_node` |
| `notify_node` | `POST /td_state_update`，通知 Node.js 進入 state=4（REVIEWING） |

延遲 2 幀的原因：stop 指令後 processing_module 的輸出幀需要一個 cook cycle 才完全穩定。

### `trigger_shot.py` — TD 主動觸發快門（選用）

可由 TD 內任意 Execute DAT 或按鈕以 `op('trigger_shot').run()` 呼叫，向 Node.js 發送 `POST /td_trigger_shot`。Node.js 收到後若 state=2 則執行 `runCountdown()`。

---

## 影像合成（`composer.js`）

### `generateFinalCollage(sessionID, photoFilenames, layout)`

`layout` 由 `server.js` 的 `activeLayout` 傳入（`loadModuleManifest` 解析後的物件，`overlay_path` 已為絕對路徑）。

1. **動態解析**：依傳入的 `layout` 物件讀取畫布尺寸、照片槽位、widgets（支援多種 Layout Variant）。
2. **並行**處理 4 張照片（`Promise.all`），各自裁切至 slot 尺寸
3. 疊加相框 overlay（`layout.overlay_path`，絕對路徑）
4. 渲染文字（支援 `{CURRENT_DATE}` 佔位符）與 QR Code widget
5. 執行 Sharp 合成，**只跑一次 pipeline**（`toBuffer()`），再寫檔
6. 嘗試上傳至 Supabase；**上傳失敗不影響本機結果**

### Module Manifest（`modules/{name}/manifest.json`）

```jsonc
{
  "name": "Cyber Standard",
  "capabilities": { "recording": true, "snapshot": true },
  "defaultLayout": "4v",
  "layouts": [
    {
      "id": "4v",
      "label": "4 Shots Vertical",
      "canvas": { "w": 1500, "h": 4000, "bg": "#000000" },
      "overlay_path": "overlay.png",          // 相對於 manifest 資料夾
      "photo_slots": [                        // 4 個照片位置 {x, y, w, h}
        { "x": 110, "y": 120, "w": 1280, "h": 720 },
        ...
      ],
      "widgets": [                            // 文字或圖片覆蓋層
        { "type": "text", "content": "{CURRENT_DATE}", ... },
        { "type": "image", "content": "{QR_CODE}", ... }
      ]
    }
  ]
}
```

---

## 雲端上傳（`uploader.js`）

環境變數 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 皆設定時啟用雲端上傳：

1. 上傳圖片至 Supabase Storage（bucket: `photos`）
2. 寫入 `collages` 資料表（欄位：`session_id`）
3. 回傳 Vercel 部署的下載頁面網址（`{VERCEL_DOMAIN}/?id={sessionID}`）

未設定時回傳 `deploy-info` 頁面（本機模式）。

---

## 前端介面

### `public/index.html`（桌面）

`vid-webcam` 透過 `getUserMedia` 讀取 **NDI 6 Webcam 虛擬攝影機**，顯示的是 TD 處理後的即時畫面（含特效），非原始攝影機畫面。倒數數字、狀態提示均以 HTML/CSS overlay 疊加於 `vid-webcam` 上方，不依賴 TD。

| UI 區塊 | 顯示條件 | 說明 |
|---|---|---|
| `sec-capture` | state 0/1/2/3/4 | 攝影機畫面 + 控制按鈕 |
| `sec-result` | state 5 | 成品圖 + QR Code + START NEW |
| `img-preview` | state 4 | 疊加於 `vid-webcam` 上方，顯示 `previewUrl` 圖片 |
| `ui-idle`（TAKE PHOTO） | state 2/3 | state 3 時按鈕禁用並顯示倒數數字 |
| `ui-rec`（STOP & SAVE） | state 0 | 錄影模式錄影中 |
| `ui-rev`（KEEP/RETAKE） | state 4 | 照片預覽選擇 |
| `ui-fin`（GENERATING） | state 1 | 合成中提示 |
| `btn-finish` | state 2 且已保留 ≥1 張 | 提前完成 |
| `btn-mode` | state 2 且雙模式均支援 | 切換拍攝模式（由 `tdCapabilities` 控制顯示） |
| `btn-layout` | state 2 且目前模組有 ≥2 個 layout | 循環切換 layout variant（emit `set_layout`）|
| `btn-module` | state 2 且 `availableModules.length > 1` | 循環切換整個視覺模組（emit `set_module`）|

### `public/remote.html`（手機）

與桌面版接收相同的 Socket.io 事件，提供大按鈕介面。State 3 倒數時於 busy 區顯示數字（3→2→1）。footer 提供 FINISH EARLY、MODE 切換、RESET。

---

## 拍攝模式

透過 `btn-mode` 或 `set_capture_mode` Socket 事件切換，設定儲存於 `server.js` 的 `captureMode`，所有 `status_update` 廣播會帶出當前模式。

| 模式 | `captureMode` | 流程 |
|---|---|---|
| 錄影 | `'recording'` | 倒數 → state 0（快門開）→ 使用者按 STOP → state 4 |
| 快拍 | `'snapshot'` | 倒數 → TD 自動擷取 → state 4（state 0 不出現）|

模式切換按鈕只在 `tdCapabilities.recording && tdCapabilities.snapshot` 皆為 true 時顯示；若模組只支援其中一種則不顯示切換選項。

---

## Session 管理

每次重置產生唯一 ID：`ssn_{Date.now()}_{randomStr}`（8 位亂數），防止掃描他人 QR Code。

Session 資料夾：`sessions/{sessionID}/`
- `raw_1.png` ~ `raw_4.png`：原始截圖
- `collage.jpg`：合成成品

---

## 環境變數（`.env`）

| 變數 | 必填 | 說明 |
|---|---|---|
| `SUPABASE_URL` | 選填 | Supabase 專案 URL，未設定則為本機模式 |
| `SUPABASE_SERVICE_ROLE_KEY` | 選填 | Supabase Service Role Key |
