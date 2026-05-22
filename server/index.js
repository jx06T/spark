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
let captureMode = 'recording'; // 'recording' | 'snapshot'
let tdCapabilities = { recording: true, snapshot: true };

// Module / layout state
let activeModuleName = 'cyber_standard';
let activeLayout = null;
let availableModules = [];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.use(express.json());
app.use('/sessions', express.static(path.join(ROOT, 'sessions')));
app.use('/module-assets', express.static(path.join(ROOT, 'modules')));
app.use(express.static(path.join(ROOT, 'client', 'dist')));

// ── Module / Layout helpers ──────────────────────────────────────────────────

function loadModuleManifest(moduleName, layoutId = null) {
    const moduleDir = path.join(ROOT, 'modules', moduleName);
    const manifest = JSON.parse(fs.readFileSync(path.join(moduleDir, 'manifest.json'), 'utf-8'));
    const target = layoutId
        ? manifest.layouts.find(l => l.id === layoutId)
        : manifest.layouts.find(l => l.id === manifest.defaultLayout);
    if (!target) throw new Error(`Layout '${layoutId}' not found in module '${moduleName}'`);
    return {
        capabilities: manifest.capabilities,
        layout: { ...target, overlay_path: path.join(moduleDir, target.overlay_path) }
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
        try {
            const { capabilities, layout } = loadModuleManifest(activeModuleName);
            tdCapabilities = capabilities;
            activeLayout = layout;
        } catch (e) {
            const first = availableModules[0];
            activeModuleName = first.id;
            const { capabilities, layout } = loadModuleManifest(activeModuleName);
            tdCapabilities = capabilities;
            activeLayout = layout;
        }
    }
    console.log(`[Modules] Available: ${availableModules.map(m => m.id).join(', ')}`);
}

function broadcastStatusUpdate(payload) {
    if (payload.state !== undefined) {
        currentSystemState = payload.state;
    }
    io.emit('status_update', { ...payload, mode: captureMode });
}

async function runCountdown() {
    broadcastStatusUpdate({ message: '3', state: 3, countdown: 3 });
    await sleep(1000);
    broadcastStatusUpdate({ message: '2', state: 3, countdown: 2 });
    await sleep(1000);
    broadcastStatusUpdate({ message: '1', state: 3, countdown: 1 });
    await sleep(1000);

    try {
        if (captureMode === 'recording') {
            broadcastStatusUpdate({ message: 'DRAW NOW!', state: 0 });
            await axios.post(`${TD_URL}/start_recording`, {}, { timeout: 3000 });
        } else {
            broadcastStatusUpdate({ message: 'Capturing...', state: 1 });
            await axios.post(`${TD_URL}/capture_snapshot`, {}, { timeout: 3000 });
        }
    } catch (e) {
        console.error('TD capture error:', e.response?.status);
        broadcastStatusUpdate({ message: 'TD Error', state: 2, kept: selectedPhotos.length });
    }
}

async function systemFullReset() {
    console.log("--- 完全重置 ---");
    selectedPhotos = [];
    const randomStr = Math.random().toString(36).substring(2, 10);
    currentSessionID = `ssn_${Date.now()}_${randomStr}`;

    try {
        await axios.post(`${TD_URL}/reset`, { sessionID: currentSessionID, module: activeModuleName }, { timeout: 3000 });
        console.log("TD Reset Success");
    } catch (e) {
        console.error("TD Reset/Capabilities Failed (Is TD running?)");
    }

    try {
        const { capabilities, layout } = loadModuleManifest(activeModuleName);
        tdCapabilities = capabilities;
        activeLayout = layout;
        if (!tdCapabilities[captureMode]) {
            captureMode = tdCapabilities.recording ? 'recording' : 'snapshot';
        }
        console.log(`[Modules] Active: ${activeModuleName}, Layout: ${activeLayout.id}, Mode: ${captureMode}`);
    } catch (e) {
        console.error('[Modules] Failed to load manifest:', activeModuleName, e.message);
    }
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.emit('status_update', {
        message: selectedPhotos.length > 0 ? 'Connected - Resuming' : 'Ready',
        state: currentSystemState,
        kept: selectedPhotos.length,
        mode: captureMode,
        capabilities: tdCapabilities,
        modules: availableModules,
        currentModule: activeModuleName,
    });

    socket.on('user_clicked_start', async (data) => {
        // Apply module/mode selection atomically before reset to avoid race conditions
        if (data?.moduleId && data.moduleId !== activeModuleName) {
            activeModuleName = data.moduleId;
        }
        if (data?.mode === 'recording' || data?.mode === 'snapshot') {
            captureMode = data.mode;
        }
        await systemFullReset();
        broadcastStatusUpdate({ message: 'Ready for new session', state: 2, kept: 0 });
    });

    socket.on('trigger_shot', async () => {
        if (currentSystemState !== 2) return;
        console.log('Triggering countdown');
        await runCountdown();
    });

    socket.on('set_capture_mode', (data) => {
        if ((data.mode === 'recording' || data.mode === 'snapshot') && tdCapabilities[data.mode]) {
            captureMode = data.mode;
            console.log(`Capture mode set to: ${captureMode}`);
            broadcastStatusUpdate({ message: `Mode: ${captureMode}`, state: currentSystemState, kept: selectedPhotos.length });
        }
    });

    socket.on('set_layout', (data) => {
        if (!data.layoutId) return;
        try {
            const { layout } = loadModuleManifest(activeModuleName, data.layoutId);
            activeLayout = layout;
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
            const { capabilities, layout } = loadModuleManifest(activeModuleName);
            tdCapabilities = capabilities;
            activeLayout = layout;
            if (!tdCapabilities[captureMode]) captureMode = tdCapabilities.recording ? 'recording' : 'snapshot';
            console.log(`Module switched to: ${activeModuleName}`);
            broadcastStatusUpdate({
                message: `Module: ${activeModuleName}`,
                state: 2,
                kept: selectedPhotos.length,
                modules: availableModules,
                currentModule: activeModuleName,
            });
        } catch (e) {
            console.error('Module switch failed:', e.message);
        }
    });

    socket.on('user_clicked_stop', async () => {
        console.log('Stop and save requested');
        try {
            await axios.post(`${TD_URL}/stop_and_save`, {}, { timeout: 3000 });
        } catch (e) {
            console.error('TD error:', e.response?.status);
        }
    });

    socket.on('choice_keep', async (data) => {
        selectedPhotos.push(data.filename);
        console.log(`Photo kept: ${data.filename}. Total: ${selectedPhotos.length}/4`);

        if (selectedPhotos.length >= 4) {
            broadcastStatusUpdate({ message: 'Processing final collage...', kept: 4, state: 1 });
            console.log("currentSessionID:", currentSessionID);
            console.log('Session complete. List:', selectedPhotos);

            try {
                const result = await generateFinalCollage(currentSessionID, selectedPhotos, activeLayout);
                if (!result.publicUrl) result.publicUrl = `sessions/${currentSessionID}/collage.jpg`;
                broadcastStatusUpdate({ message: 'Finished', state: 5, result });
            } catch (e) {
                await systemFullReset();
                broadcastStatusUpdate({ message: 'Composition Failed', state: 2 });
            }
        } else {
            broadcastStatusUpdate({ message: `Keep success! ${selectedPhotos.length}/4`, state: 2, kept: selectedPhotos.length });
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
        console.log("currentSessionID:", currentSessionID);
        console.log(`Finish early requested. Current count: ${selectedPhotos.length}`);
        broadcastStatusUpdate({ message: 'Finishing with current shots...', state: 1 });

        const originalCount = selectedPhotos.length;
        while (selectedPhotos.length < 4) {
            selectedPhotos.push(selectedPhotos[selectedPhotos.length % originalCount]);
        }

        try {
            const result = await generateFinalCollage(currentSessionID, selectedPhotos, activeLayout);
            if (!result.publicUrl) result.publicUrl = `sessions/${currentSessionID}/collage.jpg`;
            broadcastStatusUpdate({ message: 'Finished', state: 5, result });
        } catch (e) {
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
