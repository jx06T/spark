const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const { generateFinalCollage } = require('./composer');
const TD_URL = 'http://127.0.0.1:8080';

const ROOT = path.join(__dirname, '..');

// App state
let selectedPhotos = [];
let currentSessionID = "";
let currentSystemState = 2;
let currentResult = null; // 紀錄最後一次合成結果
let captureMode = 'instant'; // 'instant' | 'timed' | 'manual'
let timedDuration = null;    // number | null (seconds)
let timedStopTimer = null;   // NodeJS.Timeout for auto-stop

// Module / layout / slot state
let activeModuleName = '';
let activeLayout = null;
let activeSlots = [];        // resolved slots with effectiveType
let availableModules = [];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.use(express.json());
app.use('/sessions', express.static(path.join(ROOT, 'sessions')));
app.use('/module-assets', express.static(path.join(ROOT, 'modules')));
app.use(express.static(path.join(ROOT, 'client', 'dist')));

// ── Module / Layout helpers ──────────────────────────────────────────────────

function resolveSlots(layout, capabilities) {
    const supportsVideo = capabilities.output.types.includes('video');
    return (layout.slots || []).map(slot => {
        const declaredType = slot.type || 'image';
        const effectiveType = (declaredType === 'video' && !supportsVideo) ? 'image' : declaredType;
        const capture = slot.capture || 'instant';
        const timedDuration = slot.timedDuration ?? null;
        return { ...slot, effectiveType, capture, timedDuration };
    });
}

function clientSlots() {
    return activeSlots.map(s => ({
        capture: s.capture,
        timedDuration: s.timedDuration,
        type: s.effectiveType,
    }));
}

function loadModuleManifest(moduleName, layoutId = null) {
    console.log("[loadModuleManifest]",moduleName,layoutId)
    const moduleDir = path.join(ROOT, 'modules', moduleName);
    const manifest = JSON.parse(fs.readFileSync(path.join(moduleDir, 'manifest.json'), 'utf-8'));
    const target = layoutId
        ? manifest.layouts.find(l => l.id === layoutId)
        : manifest.layouts.find(l => l.id === manifest.defaultLayout);
    if (!target) throw new Error(`Layout '${layoutId}' not found in module '${moduleName}'`);
    const layout = { ...target, overlay_path: path.join(moduleDir, target.overlay_path) };
    return {
        capabilities: manifest.capabilities,
        layout,
        slots: resolveSlots(layout, manifest.capabilities),
    };
}

function scanAvailableModules() {
    const modulesDir = path.join(ROOT, 'modules');
    if (!fs.existsSync(modulesDir)) { availableModules = []; return; }
    availableModules = fs.readdirSync(modulesDir)
        .filter(name => fs.existsSync(path.join(modulesDir, name, 'manifest.json')))
        .map(name => {
            const manifest = JSON.parse(fs.readFileSync(path.join(modulesDir, name, 'manifest.json'), 'utf-8'));
            return {
                id: name,
                name: manifest.name,
                capabilities: manifest.capabilities,
                layouts: manifest.layouts.map(l => ({
                    id: l.id,
                    label: l.label,
                    previewUrl: l.preview ? `/module-assets/${name}/${l.preview}` : undefined,
                })),
                previewUrl: `/module-assets/${name}/${manifest.preview_image || 'preview.jpg'}`
            };
        });
    if (availableModules.length > 0 && !activeLayout) {
        const firstId = availableModules[0].id;
        activeModuleName = activeModuleName || firstId;
        try {
            const { capabilities: caps, layout, slots } = loadModuleManifest(activeModuleName);
            activeLayout = layout;
            activeSlots = slots;
            // Ensure captureMode is valid for this module
            if (!caps.capture.modes.includes(captureMode)) {
                captureMode = caps.capture.modes[0] || 'instant';
            }
        } catch (e) {
            activeModuleName = firstId;
            const { layout, slots } = loadModuleManifest(activeModuleName);
            activeLayout = layout;
            activeSlots = slots;
        }
    }
    console.log(`[Modules] Available: ${availableModules.map(m => m.id).join(', ')}`);
}

function broadcastStatusUpdate(payload) {
    if (payload.state !== undefined) {
        currentSystemState = payload.state;
    }
    io.emit('status_update', {
        result: currentResult,
        captureMode,
        timedDuration,
        currentLayoutId: activeLayout?.id ?? '',
        slots: clientSlots(),
        ...payload,
    });
}

function cancelTimedStop() {
    if (timedStopTimer) {
        clearTimeout(timedStopTimer);
        timedStopTimer = null;
    }
}

async function runCountdown() {
    broadcastStatusUpdate({ message: '3', state: 3, countdown: 3 });
    await sleep(1000);
    broadcastStatusUpdate({ message: '2', state: 3, countdown: 2 });
    await sleep(1000);
    broadcastStatusUpdate({ message: '1', state: 3, countdown: 1 });
    await sleep(1000);

    try {
        const currentSlot = activeSlots[selectedPhotos.length];
        const isVideoSlot = currentSlot?.effectiveType === 'video';
        const slotCapture = currentSlot?.capture ?? 'instant';
        const slotDuration = currentSlot?.timedDuration ?? null;

        if (slotCapture === 'instant') {
            broadcastStatusUpdate({ message: 'Capturing...', state: 1 });
            await axios.post(`${TD_URL}/capture_snapshot`, {}, { timeout: 3000 });
        } else {
            // manual or timed — both start recording
            broadcastStatusUpdate({ message: isVideoSlot ? 'RECORDING!' : 'DRAW NOW!', state: 0 });
            const startEndpoint = isVideoSlot ? '/start_video_record' : '/start_recording';
            await axios.post(`${TD_URL}${startEndpoint}`, {}, { timeout: 3000 });

            if (slotCapture === 'timed' && slotDuration) {
                timedStopTimer = setTimeout(async () => {
                    timedStopTimer = null;
                    if (currentSystemState === 0) {
                        try {
                            const stopEndpoint = isVideoSlot ? '/stop_video_record' : '/stop_and_save';
                            await axios.post(`${TD_URL}${stopEndpoint}`, {}, { timeout: 3000 });
                            broadcastStatusUpdate({ message: 'Processing...', state: 1 });
                        } catch (e) {
                            console.error('Timed auto-stop error:', e.message);
                        }
                    }
                }, slotDuration * 1000);
            }
        }
    } catch (e) {
        console.error('TD capture error:', e.response?.status);
        broadcastStatusUpdate({ message: 'TD Error', state: 2, kept: selectedPhotos.length });
    }
}

async function systemFullReset() { // 不再接收 moduleNameForTD 參數
    console.log("--- 完全重置 ---");
    cancelTimedStop();
    selectedPhotos = [];
    currentResult = null;
    const randomStr = Math.random().toString(36).substring(2, 10);
    currentSessionID = `ssn_${Date.now()}_${randomStr}`;

    try {
        // 不再傳遞 'module' 參數給 TD 的 /reset 端點
        await axios.post(`${TD_URL}/reset`, { sessionID: currentSessionID }, { timeout: 3000 });
        console.log("TD Reset Success");
    } catch (e) {
        console.error("TD Reset Failed (Is TD running?)");
    }

    try {
        const { capabilities: caps, layout, slots } = loadModuleManifest(activeModuleName, activeLayout?.id);
        activeLayout = layout;
        activeSlots = slots;
        if (!caps.capture.modes.includes(captureMode)) {
            captureMode = caps.capture.modes[0] || 'instant';
        }
        console.log(`[Modules] Active: ${activeModuleName}, Layout: ${activeLayout.id}, Mode: ${captureMode}`);
    } catch (e) {
        console.error('[Modules] Failed to load manifest:', activeModuleName, e.message);
    }
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    const activeCaps = availableModules.find(m => m.id === activeModuleName)?.capabilities;
    const currentModuleCaps = availableModules.find(m => m.id === activeModuleName)?.capabilities;

    socket.emit('status_update', {
        message: selectedPhotos.length > 0 ? 'Connected - Resuming' : 'Ready',
        state: currentSystemState,
        // 確保在連接時發送正確的 capabilities
        capabilities: currentModuleCaps,
        modules: availableModules,
        currentModule: activeModuleName,
        currentLayoutId: activeLayout?.id ?? '',
        slots: clientSlots()
    });

    socket.on('user_clicked_start', async (data) => {
        const newLayoutId = data?.layoutId;
        const layoutChanged = newLayoutId && newLayoutId !== activeLayout?.id;
        // 處理佈局變更 (這不涉及 TD 的 /set_module，只涉及 manifest 重新載入)
        if (layoutChanged) {
            try {
                const { layout, slots } = loadModuleManifest(activeModuleName, newLayoutId);
                activeLayout = layout;
                activeSlots = slots;
            } catch (e) {
                console.error('Layout not found:', newLayoutId);
            }
        }

        if (data?.captureMode) captureMode = data.captureMode;
        if (data?.timedDuration != null) timedDuration = data.timedDuration;

        // 2. 執行重置，但不阻塞最後的成功廣播
        // 這裡可以先更新 SessionID 並加載佈局
        await systemFullReset();

        // 3. 發送正式 Ready 訊號
        broadcastStatusUpdate({ message: 'Ready for new session' ,state: 2, kept: selectedPhotos.length});
    });

    socket.on('trigger_shot', async () => {
        if (currentSystemState !== 2) return;
        console.log('Triggering countdown');
        await runCountdown();
    });

    socket.on('set_capture_mode', (data) => {
        const caps = availableModules.find(m => m.id === activeModuleName)?.capabilities;
        if (!caps?.capture.modes.includes(data.mode)) return;
        captureMode = data.mode;
        console.log(`Capture mode set to: ${captureMode}`);
        broadcastStatusUpdate({ message: `Mode: ${captureMode}`, state: currentSystemState, kept: selectedPhotos.length });
    });

    socket.on('set_timed_duration', (data) => {
        if (typeof data.duration === 'number') {
            timedDuration = data.duration;
            console.log(`Timed duration set to: ${timedDuration}s`);
            broadcastStatusUpdate({ state: currentSystemState, kept: selectedPhotos.length });
        }
    });

    socket.on('set_layout', (data) => {
        if (!data.layoutId) return;
        try {
            const { layout, slots } = loadModuleManifest(activeModuleName, data.layoutId);
            activeLayout = layout;
            activeSlots = slots;
            console.log(`Layout set to: ${data.layoutId}`);
            broadcastStatusUpdate({ message: `Layout: ${data.layoutId}`, state: currentSystemState, kept: selectedPhotos.length });
        } catch (e) {
            console.error('Layout switch failed:', e.message);
        }
    });

    socket.on('set_module', async (data) => {
        if (!data.moduleId || currentSystemState !== 2) return; // 僅在 IDLE 狀態下允許模組切換
        try {
            await axios.post(`${TD_URL}/set_module`, { module: data.moduleId }, { timeout: 10000 });
            await sleep(500);
            activeModuleName = data.moduleId;
            const { capabilities: caps, layout, slots } = loadModuleManifest(activeModuleName);
            activeLayout = layout;
            activeSlots = slots;
            if (!caps.capture.modes.includes(captureMode)) captureMode = caps.capture.modes[0] || 'instant';
            console.log(`Module switched to: ${activeModuleName}`);
            broadcastStatusUpdate({
                message: `Module: ${activeModuleName}`,
                state: 2,
                kept: selectedPhotos.length,
                capabilities: caps,
                modules: availableModules,
                currentModule: activeModuleName,
            });
        } catch (e) {
            console.error('Module switch failed:', e.message);
        }
    });

    socket.on('user_clicked_stop', async () => {
        cancelTimedStop();
        console.log('Stop and save requested');
        try {
            const currentSlot = activeSlots[selectedPhotos.length];
            const isVideo = currentSlot?.effectiveType === 'video';
            const stopEndpoint = isVideo ? '/stop_video_record' : '/stop_and_save';
            await axios.post(`${TD_URL}${stopEndpoint}`, {}, { timeout: 3000 });
            broadcastStatusUpdate({ message: 'Processing...', state: 1 });
        } catch (e) {
            console.error('TD error:', e.response?.status);
        }
    });

    socket.on('choice_keep', async (data) => {
        selectedPhotos.push(data.filename);
        const totalSlots = activeSlots.length || 4;
        console.log(`Photo kept: ${data.filename}. Total: ${selectedPhotos.length}/${totalSlots}`);

        if (selectedPhotos.length >= totalSlots) {
            broadcastStatusUpdate({ message: 'Processing final collage...', kept: selectedPhotos.length, state: 1 });
            console.log("currentSessionID:", currentSessionID);
            console.log('Session complete. List:', selectedPhotos);

            try {
                const result = await generateFinalCollage(currentSessionID, selectedPhotos, activeLayout, activeSlots);
                if (!result.publicUrl) result.publicUrl = `/sessions/${currentSessionID}/collage.jpg`;
                currentResult = result;
                broadcastStatusUpdate({ message: 'Finished', state: 5, result });
            } catch (e) {
                console.error('Collage generation failed:', e.message);
                await systemFullReset();
                broadcastStatusUpdate({ message: 'Composition Failed', state: 2 });
            }
        } else {
            broadcastStatusUpdate({ message: `Keep success! ${selectedPhotos.length}/${totalSlots}`, state: 2, kept: selectedPhotos.length });
            try {
                await axios.post(`${TD_URL}/ready_for_next_attempt`, {}, { timeout: 3000 });
            } catch (e) { console.log("Error notifying TD for next attempt"); }
        }
    });

    socket.on('choice_retake', async () => {
        console.log('User chose to retake');
        broadcastStatusUpdate({ message: 'Retake! Try again.', state: 2, kept: selectedPhotos.length });
        try {
            await axios.post(`${TD_URL}/ready_for_next_attempt`, {}, { timeout: 3000 });
        } catch (e) { console.log("Error notifying TD for next attempt"); }
    });

    socket.on('user_clicked_reset', async () => {
        await systemFullReset();
        broadcastStatusUpdate({ message: 'System Reset Done', state: 2, kept: 0 });
    });

    socket.on('user_clicked_finish_early', async () => {
        if (selectedPhotos.length === 0) return;
        cancelTimedStop();
        console.log("currentSessionID:", currentSessionID);
        console.log(`Finish early requested. Current count: ${selectedPhotos.length}`);
        broadcastStatusUpdate({ message: 'Finishing with current shots...', state: 1 });

        const totalSlots = activeSlots.length || 4;
        const originalCount = selectedPhotos.length;
        while (selectedPhotos.length < totalSlots) {
            selectedPhotos.push(selectedPhotos[selectedPhotos.length % originalCount]);
        }

        try {
            const result = await generateFinalCollage(currentSessionID, selectedPhotos, activeLayout, activeSlots);
            if (!result.publicUrl) result.publicUrl = `/sessions/${currentSessionID}/collage.jpg`;
            currentResult = result;
            broadcastStatusUpdate({ message: 'Finished', state: 5, result });
        } catch (e) {
            console.error('Collage generation failed:', e.message);
            await systemFullReset();
            broadcastStatusUpdate({ message: 'Composition Failed', state: 2 });
        }
    });
});

function transcodeToMp4(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        console.log(`[transcode] start: ${path.basename(inputPath)}`);
        execFile('ffmpeg', [
            '-i', inputPath,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-an', '-y',
            outputPath,
        ], (err, _stdout, stderr) => {
            if (err) { console.error('[transcode] failed:', stderr); reject(err); }
            else { console.log(`[transcode] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`); resolve(); }
        });
    });
}

// TD Webhooks
app.post('/td_state_update', async (req, res) => {
    res.send('ok');
    const body = req.body;

    if (body.state === 4 && body.currentFile) {
        const isVideo = /\.(mov|avi)$/i.test(body.currentFile);
        if (isVideo) {
            const sessionDir = path.join(ROOT, 'sessions', currentSessionID);
            const inputPath = path.join(sessionDir, body.currentFile);
            const mp4Name = body.currentFile.replace(/\.[^.]+$/, '.mp4');
            const outputPath = path.join(sessionDir, mp4Name);
            try {
                await transcodeToMp4(inputPath, outputPath);
                body.currentFile = mp4Name;
            } catch (e) {
                console.error('[transcode] failed, using original:', e.message);
            }
        }
        body.previewUrl = `/sessions/${currentSessionID}/${body.currentFile}`;
    }

    broadcastStatusUpdate(body);
});

app.post('/td_trigger_shot', async (req, res) => {
    res.send('ok');
    if (currentSystemState !== 2) return;
    await runCountdown();
});

// SPA catch-all — must come after all API routes
app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(ROOT, 'client', 'dist', 'index.html'));
});

scanAvailableModules();

const PORT = 5000;
server.listen(PORT, () => console.log(`Server running: http://localhost:${PORT}`));
