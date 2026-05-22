# TouchDesigner 手動設定指南

> 適用版本：TD 2023.11760+（或任何支援 Web Server DAT 與 externaltox 的版本）

本文件說明在 TouchDesigner 中需要**手動操作**的節點設定，這些設定無法透過代碼自動完成。

---

## 必要節點架構

`.toe` 內必須存在以下路徑的節點（comm_server 的回調腳本以此為假設）：

```
project1/
├── state_holder/
│   └── states              ← Constant CHOP
├── comm_server/
│   └── webserver          ← Web Server DAT
└── video_pipeline/
    ├── processing_module/  ← Base COMP（外掛 .tox）
    └── out_module/
        └── final_output    ← TOP（供存檔用）
```

---

## 1. `state_holder/states`（Constant CHOP）

建立一個 **Constant CHOP**，命名為 `states`，放在 `state_holder` Base COMP 內。

新增三個 Channel：

| Channel Name | 初始值 | 說明 |
|---|---|---|
| `state` | `2` | 系統狀態（0=RECORDING, 1=PROCESSING, 2=IDLE） |
| `session_id` | `0` | 僅佔位，實際 session 路徑由 Python 模組變數管理 |
| `photo_index` | `0` | 當前拍攝張數 |

> Parameters → Value0 / Value1 / Value2 對應三個 channel（預設命名即為 `value0`、`value1`、`value2`，腳本使用 `_chop().par.value0` 存取）。

---

## 2. `comm_server/webserver1`（Web Server DAT）

建立一個 **Web Server DAT**，命名為 `webserver1`，放在 `comm_server` Base COMP 內。

**Parameters 設定：**

| Parameter | 值 |
|---|---|
| Port | `8080` |
| Active | `On` |
| Callbacks DAT | 指向 `callbacks` Text DAT（見下方） |

**建立回調腳本：**

1. 在 `comm_server` 內新增一個 **Text DAT**，命名為 `callbacks`
2. 將 `TD/scripts/webserver_callbacks.py` 的內容貼入（或設定 External File 指向該路徑）
3. 在 `webserver1` 的 Parameters → Callbacks DAT 欄位填入 `callbacks`

> 若使用 External File：Text DAT → Parameters → External File → 填入相對於 `.toe` 的路徑 `../scripts/webserver_callbacks.py`，並勾選 **Sync to File**。

---

## 3. `video_pipeline/processing_module`（Base COMP / 外掛 .tox）

這是可替換的視覺效果模組，對應 `modules/{module_name}/effect.tox`。

### 3-1. 初始掛載 .tox

1. 在 `video_pipeline` 內新增 **Base COMP**，命名為 `processing_module`
2. Parameters → External .tox → 填入初始模組路徑：`../../modules/cyber_standard/effect.tox`
3. 勾選 **Reload Custom Parameters**

### 3-2. 內部必要結構（每個 .tox 需自行建立）

每個 `effect.tox` 內部需包含：

```
processing_module/
├── switch1         ← TOP Switch，index=0 時 passthrough，index=1 時特效
├── states_ref      ← Select CHOP，指向 /project1/state_holder/states
└── chop_exec1      ← CHOP Execute DAT，watch states_ref
```

**`chop_exec1` 核心邏輯**（CHOP Execute DAT 的 `onValueChange`）：

```python
def onValueChange(channel, sampleIndex, val, prev):
    if channel.name == 'state':
        me.parent().op('switch1').par.index = 1 if val == 0 else 0
```

> `state == 0`（RECORDING）時切換到特效幀；其他狀態回到 passthrough。

### 3-3. Custom Parameters（Capabilities 宣告）

> ⚠️ 注意：自 v3.5 架構更新後，`capabilities` 改由 `manifest.json` 定義，**不再從 TD Custom Parameters 讀取**。  
> 這兩個 Custom Parameter 可選擇保留（供 TD 內部邏輯參考）或移除。

若要保留作為 TD 內部參考：

- **Custom Parameter Page**：`Capabilities`
- `SupportsRecording`（Toggle）：是否支援錄影模式
- `SupportsSnapshot`（Toggle）：是否支援快拍模式

---

## 4. `video_pipeline/out_module/final_output`（TOP）

這是存檔用的最終輸出 TOP，`do_delayed_save()` 會呼叫 `final_output.save(filepath)`。

**設定要求：**
- 命名嚴格為 `final_output`（Python 腳本以此名稱查找）
- 路徑：`/project1/video_pipeline/out_module/final_output`
- 輸出解析度建議與 `manifest.json` 的 `photo_slots` 長寬相符（或更大）

> 若使用 NDI 輸出，`final_output` 可以是 NDI In TOP 接收後的最終 TOP，也可以是直接來自 `processing_module` 的輸出。

---

## 5. NDI 輸出設定（瀏覽器預覽）

瀏覽器 `vid-webcam` 透過 NDI 6 Webcam 虛擬驅動讀取 TD 的即時畫面。

**TD 端：**
1. 在 `out_module` 內新增 **NDI Out TOP**
2. Stream Name：填任意名稱（例如 `CyberBooth`）
3. Active：`On`

**主機端：**
1. 安裝 [NDI 6 Tools](https://ndi.video/tools/)（含 NDI 6 Webcam 虛擬驅動）
2. 開啟 NDI Webcam Input 工具，選擇 TD 的 NDI 串流
3. 瀏覽器的 `getUserMedia` 即可讀取到「NDI 6 Webcam」這個虛擬攝影機

---

## 6. 建立新視覺效果模組（.tox）

建立一個與現有系統相容的新模組：

1. **建立資料夾**：`modules/{your_module_name}/`
2. **建立 `manifest.json`**（參考 `modules/cyber_standard/manifest.json` 格式）
   - 填入 `capabilities`（recording/snapshot 支援情況）
   - 定義至少一個 `layouts` 項目
3. **放入 `overlay.png`**（相框圖片，尺寸需與 canvas 相符）
4. **建立 `effect.tox`**：
   - 在 TD 內複製 `cyber_standard` 的 `processing_module` 作為起點
   - 修改 `switch1` 的兩個輸入（index=0 passthrough，index=1 特效）
   - 確認 `states_ref` Select CHOP 路徑仍指向 `/project1/state_holder/states`
   - 確認 `chop_exec1` 的 `onValueChange` 邏輯正確
   - 存成 `effect.tox`：右鍵 → Save Component...
5. **在 Node.js 端切換**：透過前端或直接呼叫
   ```
   socket.emit('set_module', { moduleId: 'your_module_name' });
   ```
   Node.js 會呼叫 `POST /set_module`，TD 動態載入新 `.tox`。

---

## 常見問題

### `comm_server` 找不到 `processing_module`

確認路徑是否正確：`webserver_callbacks.py` 的 `_processing_module()` 函式假設路徑為：
```
me.parent().parent().op('video_pipeline/processing_module')
```
即腳本的父節點是 `comm_server`，`comm_server` 的父節點是 `project1`。

### `final_output.save()` 存出空白圖

`_schedule_save()` 使用 `delayFrames=2` 等待幀穩定。若仍為空白，可嘗試增加延遲：

```python
run("...", filepath, filename, photo_index, delayFrames=4)
```

### `POST /set_module` 回傳 404

確認 `webserver_callbacks.py` 的 `routes` 字典包含 `'/set_module': _handle_set_module`，且腳本已在 TD 內重新載入（Text DAT → Pulse `Reload`）。

### `reinitnet.pulse()` 後模組未更新

TD 的 `reinitnet` 是同步的，但某些節點需要額外的 cook 週期。Node.js 端已有 `await sleep(500)` 緩衝；若仍有問題，可在 `_handle_set_module` 後加一幀延遲再回應。
