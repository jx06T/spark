const { generateFinalCollage } = require('./server/composer');
const fs = require('fs');
const path = require('path');
async function runTest() {
    // --- 測試設定 ---
    const TEST_SESSION_ID = 'ssn_1780166281684_5xpfk23u';
    const MODULE_NAME = 'cyber_standard';
    const LAYOUT_ID = '4vml';
    // -------------------------------

    const ROOT = path.join(__dirname);
    const sessionDir = path.join(ROOT, 'sessions', TEST_SESSION_ID);

    // 1. 讀取 Layout
    const manifestPath = path.join(ROOT, 'modules', MODULE_NAME, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const layout = manifest.layouts.find(l => l.id === LAYOUT_ID);

    // 2. 掃描並分類檔案
    const allFiles = fs.readdirSync(sessionDir);
    const imagePile = allFiles.filter(f => /^raw_\d+\.(png|jpg|jpeg)$/i.test(f)).sort();
    const videoPile = allFiles.filter(f => /^raw_\d+\.(mp4|mov|avi)$/i.test(f)).sort();

    console.log(`[Test] 圖片庫: ${imagePile.length} 張, 影片庫: ${videoPile.length} 部`);

    // 3. 依照 Slots 定義，從對應的堆疊中「抽」出檔案
    const finalFiles = [];

    let imageIndex = 0;
    let videoIndex = 0;

    // 使用普通的 for 迴圈來取代 map，這樣就能自由修改 index 了
    const slotsWithCapability = [];
    for (const slot of layout.slots) {
        let filename;
        if (slot.type === 'video') {
            filename = videoPile[videoIndex++];
        } else {
            filename = imagePile[imageIndex++];
        }

        if (!filename) {
            throw new Error(`[Test] Slot 需要 ${slot.type} 但庫存不足！`);
        }

        finalFiles.push(filename);
        slotsWithCapability.push({ ...slot, effectiveType: slot.type });
    }

    console.log(`[Test] 最終匹配檔案:`, finalFiles);

    // 4. 合成
    try {
        layout.overlay_path = path.join(ROOT, 'modules', MODULE_NAME, layout.overlay_path);
        const result = await generateFinalCollage(TEST_SESSION_ID, finalFiles, layout, slotsWithCapability);
        console.log("[Test] 合成成功！");
    } catch (e) {
        console.error("[Test] 合成失敗:", e);
    }
}
runTest();