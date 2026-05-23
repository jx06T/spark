const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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
        return { ...slot, effectiveType };
    });
}

function loadModuleManifest(moduleName, layoutId = null) {
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
                layouts: manifest.layouts.map(l => ({ id: l.id, label: l.label })),
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
        ...payload,
        captureMode,
        timedDuration,
        currentLayoutId: activeLayout?.id ?? '',
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
        if (captureMode === 'instant') {
            broadcastStatusUpdate({ message: 'Capturing...', state: 1 });
            await axios.post(`${TD_URL}/capture_snapshot`, {}, { timeout: 3000 });
        } else {
            // manual or timed — both start recording
            broadcastStatusUpdate({ message: 'DRAW NOW!', state: 0 });
            await axios.post(`${TD_URL}/start_recording`, {}, { timeout: 3000 });

            if (captureMode === 'timed' && timedDuration) {
                timedStopTimer = setTimeout(async () => {
                    timedStopTimer = null;
                    if (currentSystemState === 0) {
                        try {
                            await axios.post(`${TD_URL}/stop_and_save`, {}, { timeout: 3000 });
                        } catch (e) {
                            console.error('Timed auto-stop error:', e.message);
                        }
                    }
                }, timedDuration * 1000);
            }
        }
    } catch (e) {
        console.error('TD capture error:', e.response?.status);
        broadcastStatusUpdate({ message: 'TD Error', state: 2, kept: selectedPhotos.length });
    }
}

async function systemFullReset() {
    console.log("--- 完全重置 ---");
    cancelTimedStop();
    selectedPhotos = [];
    const randomStr = Math.random().toString(36).substring(2, 10);
    currentSessionID = `ssn_${Date.now()}_${randomStr}`;

    try {
        await axios.post(`${TD_URL}/reset`, { sessionID: currentSessionID, module: activeModuleName }, { timeout: 3000 });
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

    socket.emit('status_update', {
        message: selectedPhotos.length > 0 ? 'Connected - Resuming' : 'Ready',
        state: currentSystemState,
        kept: selectedPhotos.length,
        captureMode,
        timedDuration,
        capabilities: activeCaps,
        modules: availableModules,
        currentModule: activeModuleName,
        currentLayoutId: activeLayout?.id ?? '',
    });

    socket.on('user_clicked_start', async (data) => {
        if (data?.moduleId && data.moduleId !== activeModuleName) {
            activeModuleName = data.moduleId;
        }
        if (data?.layoutId) {
            try {
                const { layout, slots } = loadModuleManifest(activeModuleName, data.layoutId);
                activeLayout = layout;
                activeSlots = slots;
            } catch (e) {
                console.error('Layout not found:', data.layoutId);
            }
        }
        if (data?.captureMode) captureMode = data.captureMode;
        if (data?.timedDuration != null) timedDuration = data.timedDuration;

        await systemFullReset();
        const caps = availableModules.find(m => m.id === activeModuleName)?.capabilities;
        broadcastStatusUpdate({
            message: 'Ready for new session',
            state: 2,
            kept: 0,
            capabilities: caps,
            currentModule: activeModuleName,
        });
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
        if (!data.moduleId || currentSystemState !== 2) return;
        try {
            await axios.post(`${TD_URL}/set_module`, { module: data.moduleId }, { timeout: 5000 });
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
            await axios.post(`${TD_URL}/stop_and_save`, {}, { timeout: 3000 });
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
                const result = await generateFinalCollage(currentSessionID, selectedPhotos, activeLayout);
                if (!result.publicUrl) result.publicUrl = `sessions/${currentSessionID}/collage.jpg`;
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
            const result = await generateFinalCollage(currentSessionID, selectedPhotos, activeLayout);
            if (!result.publicUrl) result.publicUrl = `sessions/${currentSessionID}/collage.jpg`;
            broadcastStatusUpdate({ message: 'Finished', state: 5, result });
        } catch (e) {
            console.error('Collage generation failed:', e.message);
            await systemFullReset();
            broadcastStatusUpdate({ message: 'Composition Failed', state: 2 });
        }
    });
});

// TD Webhooks
app.post('/td_state_update', (req, res) => {
    const body = req.body;
    if (body.state === 4 && body.currentFile) {
        body.previewUrl = `/sessions/${currentSessionID}/${body.currentFile}`;
    }
    broadcastStatusUpdate(body);
    res.send('ok');
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
