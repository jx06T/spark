# Cyber Booth - Interactive Photo System

###### _version-v3.4.0_

> [!NOTE]
> 本專案是一個結合 **TouchDesigner** 的高性能互動拍貼系統。
>
> 專為實體活動設計，支援即時特效處理、多張照片自動合成、透過 Supabase 實現的私有雲端取圖等功能。

## 簡介 & 功能

- **動態視覺特效**：利用 TouchDesigner 處理仙女棒效果、長曝光與合成。
- **自動合成拍貼**：由 Node.js 背景執行 Sharp 影像處理，自動對齊、裁切並疊加自定義相框。
- **自定義相框**：透過 JSON 配置檔，可自由調整相框及照片之位置與尺寸，並於指定位置添加動態文字或 QR code、圖片貼紙等裝飾。
- **智能狀態管理**：完整的「倒數 -> 拍攝 -> 預覽 -> 保留/重拍 -> 生成」邏輯。
- **私有雲端取圖**：整合 Supabase Storage 與 Vercel，可配置 24 小時自動過期的下載頁面。
- **提前結束機制**：拍攝不足 4 張時將自動循環補齊，可隨時停止拍攝並獲得目前結果。
- **手機控制面板**：除滑鼠或觸控螢幕外，可使用手機作為操作面板（需在同網域下，並搭配螢幕）。

## 安裝要求

在使用此系統前，請確保您的設備已安裝以下軟體：

1.  **[TouchDesigner](https://derivative.ca/download)**：建議版本 2023.xxxxx 以上（用於執行 `.toe` 專案）。
2.  **Node.js**：建議 LTS 版本（用於執行拍貼合成及運行本地操作介面）。
3.  **[NDI 6](https://ndi.video/tools/)**：用於將 TouchDesigner 畫面串流至本地操作介面（透過 NDI Webcam 虛擬攝影機）。
4.  **影像輸入源**：支援 WebCam、DSLR (透過採集卡) 或使用 **[VDO.ninja](https://vdo.ninja/)** 進行遠端虛擬鏡頭輸入。

## 使用方法

1.  **啟動 TD 核心**：開啟 `v7.toe`，確保內部影像輸入源及 NDI 輸出正確，並確保其 Web Server DAT 已啟動 (Port 8080)。
2.  **配置視訊串流**：開啟 **NDI 6 Webcam**，於 Video 1 選擇 `TouchDesigner` 作為輸入來源。
3.  **啟動操作介面**：
    ```bash
    npm install
    npm run start
    ```
4.  **開啟操作界面**：瀏覽器訪問 `http://localhost:5000` 即可開始拍攝。
5.  **開啟手機控制面板（可選）**：透過同網域下的手機訪問 `http://< 你的電腦本地 ip >:5000/remote` 即可透過手機控制快門與選擇照片。
6.  **圖片儲存**：預設情況下，所有拍攝的照片與合成成品均會自動存放於 `sessions/` 資料夾中。**照片不會上傳至公開雲端**

## 私有雲端化 (Cloud Deployment)

若需開啟手機掃碼領圖功能，請完成以下步驟：

1.  **Supabase 設置**：
    - 建立專案並開啟 **Storage**。
    - 建立名為 `photos` 的 **Public Bucket**。
    - 建立 **Table**，配置 `id` 欄資料型態為 `uuid`，並新增一欄 `session_id`（text）。
    - 配置 Edge Functions 清理腳本：將 `public-viewer/supabase/auto-cleanup.ts` 的內容複製至 Supabase 專案的 **Edge Functions** 配置頁面並儲存。
    - 在 SQL Editor 啟用 `pg_cron` 並於 Integrations 頁面配置 Cron 定時呼叫 Edge Functions 清理腳本。
2.  **環境變數**：在 `.env` 中填入 `SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY`（參考 `.env.example`）。
3.  **部署下載頁面**：
    - 修改 `public-viewer/index.html` 中的 `SUPABASE_STORAGE_URL` 為您的專案路徑。
    - 將 `public-viewer` 資料夾內的代碼部署至 **Vercel**。
    - 修改 `uploader.js` 中的 `VERCEL_DOMAIN` 為您的公開下載網站。

## 自訂拍貼相框

參考配置文件 `layout/b.json`，可複製一份後修改。完成後於 `composer.js` 中將以下這行的路徑改為您的配置檔路徑：

```javascript
const layout = require("./layout/b.json");
```

配置文件分為三個核心區塊：畫布設定、照片槽位、以及功能組件。

```json
{
  "name": "Cyber_Booth_Standard",
  "canvas": { "w": 1500, "h": 4000, "bg": "#000000" },
  "overlay_path": "./layout/b.png",
  "photo_slots": [
    { "x": 110, "y": 120, "w": 1280, "h": 720 },
    { "x": 110, "y": 940, "w": 1280, "h": 720 },
    { "x": 110, "y": 1760, "w": 1280, "h": 720 },
    { "x": 110, "y": 2580, "w": 1280, "h": 720 }
  ],
  "widgets": [
    {
      "id": "date_display",
      "type": "text",
      "content": "{CURRENT_DATE}",
      "x": 990,
      "y": 3800,
      "fontSize": 64,
      "color": "#FFFFFF",
      "fontFamily": "Arial"
    },
    {
      "id": "session_qr",
      "type": "image",
      "content": "{QR_CODE}", // 或填入靜態圖片路徑，例如 "assets/qr.png"
      "x": 110,
      "y": 3700,
      "w": 200,
      "h": 200
    }
  ]
}
```

- **canvas**（畫布）：定義最終輸出的圖片尺寸與底色。
- **overlay_path**：指定透明相框圖檔的路徑。合成引擎會將此圖疊加在照片上方。
- **photo_slots**（照片槽）：定義 4 張照片在畫布上的精確位置 (x, y) 與預留空間 (w, h)。
- **widgets**（功能組件，覆蓋於圖片最上方）：
  - **Text（文字）**：支援動態佔位符 `{CURRENT_DATE}`。
  - **Image（圖片）**：支援指定路徑（如 Logo）或動態生成的 `{QR_CODE}`。

## 技術棧

- **Visuals**: TouchDesigner, Python (TD Scripts)
- **Backend**: Node.js, Express, Socket.io
- **Image Process**: Sharp (High-performance Node.js image processing)
- **Frontend**: Vanilla JS, Tailwind CSS, QRious
- **Cloud**: Supabase (DB & Storage), Vercel (Hosting), Edge Functions (Auto-cleanup)

## 更新紀錄

### 3.3

```
3.4.0 (Latest)
- 添加手機遙控面板
- 降低追蹤開銷
- 修改仙女棒粒子效果

3.3.0
- 補全專案 README 與自定義相框開發文檔
- 撰寫部署提示頁面 (deploy-info.html) 邏輯

3.2.0
- 實作 Vercel 端動態 OG Tag 注入 (api/index.js)，支援 LINE/FB 分享預覽
- 增加「過期圖片」佔位圖機制
- 修復下載頁面「分享」按鈕在非 HTTPS 環境下的相容性報錯

3.1.0
- 強化手機端下載體驗：實作 Blob 下載機制，強制觸發檔案儲存對話框
- 增加 Web Share API 支援，優先直接分享實體照片檔案至通訊軟體
- 修復下載頁面 Icon 覆蓋錯誤
```

### 2.0

```
2.5.0
- 實作 Supabase Edge Function (auto-cleanup) 定時清理任務
- 整合 pg_cron 與 pg_net 實現資料庫紀錄與 Storage 實體檔案同步刪除
- 增加 Service Role Key 認證機制，確保清理任務安全性

2.2.0
- 實作 Session ID 加密與混淆邏輯 (Timestamp + Random String)，防止使用者惡意掃描他人圖片
- 修復 uploader 模組在連線失敗時可能導致 server 當掉之錯誤
- 增加資料庫欄位 created_at 自動索引優化

2.0.0
- 雲端手機取圖功能上線
- 建立 uploader.js 模組，對接 Supabase Storage 與 Database
- 完成部署於 Vercel 的純 JS 下載前端頁面
- 實作雲端/本地自動切換邏輯 (Cloud/Mock Toggle)

```

### 1.0

```
1.5.0
- 實作「提前結束」邏輯，不足 4 張照片時自動循環補齊
- 增加「Reset」機制，確保重整頁面時 TD 狀態機同步重置
- 實作動態文字渲染功能，支援自動產生當前日期

1.2.0
- 整合 Sharp 影像合成引擎，支援 JSON 格式的 Layout 佈局設定
- 完成自動置中裁切與 16:9 出血邏輯優化，解決合成圖層重疊變黑問題
- 實作前端狀態機 (State Machine) 邏輯與狀態切換
- 統一組件 ID 命名規範與事件監聽分離邏輯

1.0.0
- 完成本地操作介面 (Local Web UI) 與 Node.js 中控通訊
- 實作 Socket.io 即時狀態同步 (Status Update)
- 建立 Node.js 與 TD 的 HTTP API 交互協議 (Start/Stop/Preview)
- 完成 TD Web Server DAT 基礎路由配置 (GET/POST 處理)
- 實作 NDI 影像串流

```

### 0.0

```
0.4.0
- 完成拍攝狀態控制器與計時器邏輯
- 完成存檔邏輯

0.3.0
- 製作長曝光效果
- 改善仙女棒粒子效果

0.2.0
- 完成初步仙女棒粒子效果

0.1.0
- 實作光點追蹤算法，優化平滑度與準度

```
