const sharp = require('sharp');
const QRCode = require('qrcode');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { uploadImage, uploadThumbnail } = require('./uploader');

const ROOT = path.join(__dirname, '..');
const OFFICIAL_URL = "https://exhibit.ckefgisc.org/";

async function generateFinalCollage(sessionID, photoFilenames, layout, slots) {
    const hasVideo = Array.isArray(slots) && slots.some(s => s.effectiveType === 'video');
    if (hasVideo) {
        return generateVideoCollage(sessionID, photoFilenames, layout, slots);
    }
    return generateImageCollage(sessionID, photoFilenames, layout);
}

// ── Image path (sharp) ──────────────────────────────────────────────────────

async function generateImageCollage(sessionID, photoFilenames, layout) {
    const sessionDir = path.join(ROOT, 'sessions', sessionID);
    const photoPaths = photoFilenames.map(name => path.join(sessionDir, name));
    const finalLocalPath = path.join(sessionDir, 'collage.jpg');

    console.log(`[Composer] Image collage: ${sessionID}`);

    const currentDate = dayjs().format('YYYY.MM.DD');
    const qrBuffer = await QRCode.toBuffer(OFFICIAL_URL, {
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
    });

    const photoLayers = await Promise.all(
        photoPaths.map(async (photoPath, i) => {
            const slot = (layout.slots || layout.photo_slots)[i];
            if (!fs.existsSync(photoPath)) {
                console.warn(`[Composer] File not found: ${photoPath}`);
                return null;
            }
            const metadata = await sharp(photoPath).metadata();
            const offsetX = Math.max(0, Math.round((metadata.width - slot.w) / 2));
            const offsetY = Math.max(0, Math.round((metadata.height - slot.h) / 2));
            const cropped = await sharp(photoPath)
                .extract({
                    left: offsetX, top: offsetY,
                    width: Math.min(slot.w, metadata.width - offsetX),
                    height: Math.min(slot.h, metadata.height - offsetY),
                })
                .resize(slot.w, slot.h, { fit: 'fill' })
                .toBuffer();
            return { input: cropped, top: slot.y, left: slot.x };
        })
    );

    const layers = photoLayers.filter(Boolean);

    const overlayBuffer = await sharp(layout.overlay_path)
        .resize({
            width: layout.canvas.w,
            height: layout.canvas.h,
            fit: 'cover',
            position: 'center'
        })
        .toBuffer();

    layers.push({ input: overlayBuffer, top: 0, left: 0 });

    for (const widget of layout.widgets) {
        if (widget.type === 'text') {
            const text = widget.content.replace('{CURRENT_DATE}', currentDate);
            const svgText = Buffer.from(`
                <svg width="${layout.canvas.w}" height="${widget.fontSize * 1.5}">
                    <text x="0" y="${widget.fontSize}"
                          font-family="${widget.fontFamily || 'Arial'}"
                          font-size="${widget.fontSize}"
                          fill="${widget.color}"
                          font-weight="bold">${text}</text>
                </svg>`);
            layers.push({ input: svgText, top: widget.y, left: widget.x });
        } else if (widget.type === 'image') {
            const imgBuffer = widget.content === '{QR_CODE}'
                ? await sharp(qrBuffer).resize(widget.w, widget.h).toBuffer()
                : await sharp(path.resolve(widget.content)).resize(widget.w, widget.h).toBuffer();
            layers.push({ input: imgBuffer, top: widget.y, left: widget.x });
        }
    }

    const finalBuffer = await sharp({
        create: {
            width: layout.canvas.w, height: layout.canvas.h,
            channels: 4, background: layout.canvas.bg,
        },
    }).composite(layers).jpeg({ quality: 95 }).toBuffer();

    await fs.promises.writeFile(finalLocalPath, finalBuffer);
    console.log(`[Composer] Image saved: ${finalLocalPath} (${finalBuffer.length} bytes)`);

    let publicUrl = null;
    try {
        console.log(`[Composer] Uploading image collage for session: ${sessionID}`);
        publicUrl = await uploadImage(sessionID, finalBuffer, 'jpg');
        console.log(`[Composer] Image upload complete, publicUrl: ${publicUrl}`);
    } catch (e) {
        console.error('[Composer] Upload failed:', e.message);
    }

    return { publicUrl, localPath: `/sessions/${sessionID}/collage.jpg` };
}

// ── Video path (ffmpeg) ─────────────────────────────────────────────────────

async function buildBaseFrame(sessionDir, photoFilenames, layout, slots) {
    const { canvas } = layout;
    const layers = await Promise.all(
        slots.map(async (slot, i) => {
            if (slot.effectiveType !== 'image') return null;
            const photoPath = path.join(sessionDir, photoFilenames[i]);
            if (!fs.existsSync(photoPath)) return null;
            const metadata = await sharp(photoPath).metadata();
            const offsetX = Math.max(0, Math.round((metadata.width - slot.w) / 2));
            const offsetY = Math.max(0, Math.round((metadata.height - slot.h) / 2));
            const cropped = await sharp(photoPath)
                .extract({
                    left: offsetX, top: offsetY,
                    width: Math.min(slot.w, metadata.width - offsetX),
                    height: Math.min(slot.h, metadata.height - offsetY),
                })
                .resize(slot.w, slot.h, { fit: 'fill' })
                .toBuffer();
            return { input: cropped, top: slot.y, left: slot.x };
        })
    );

    return sharp({
        create: {
            width: canvas.w, height: canvas.h,
            channels: 4, background: canvas.bg,
        },
    }).composite(layers.filter(Boolean)).png().toBuffer();
}

async function buildTopLayer(layout) {
    const { canvas } = layout;
    const currentDate = dayjs().format('YYYY.MM.DD');
    const qrBuffer = await QRCode.toBuffer(OFFICIAL_URL, {
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
    });

    const overlayBuffer = await sharp(layout.overlay_path)
        .resize(canvas.w, canvas.h, { fit: 'cover', position: 'center' })
        .toBuffer();

    const layers = [{ input: overlayBuffer, top: 0, left: 0 }];

    for (const widget of layout.widgets) {
        if (widget.type === 'text') {
            const text = widget.content.replace('{CURRENT_DATE}', currentDate);
            const svgText = Buffer.from(`
                <svg width="${canvas.w}" height="${widget.fontSize * 1.5}">
                    <text x="0" y="${widget.fontSize}"
                          font-family="${widget.fontFamily || 'Arial'}"
                          font-size="${widget.fontSize}"
                          fill="${widget.color}"
                          font-weight="bold">${text}</text>
                </svg>`);
            layers.push({ input: svgText, top: widget.y, left: widget.x });
        } else if (widget.type === 'image') {
            const imgBuffer = widget.content === '{QR_CODE}'
                ? await sharp(qrBuffer).resize(widget.w, widget.h).toBuffer()
                : await sharp(path.resolve(widget.content)).resize(widget.w, widget.h).toBuffer();
            layers.push({ input: imgBuffer, top: widget.y, left: widget.x });
        }
    }

    // transparent canvas — overlay PNG and widgets composite on top
    return sharp({
        create: {
            width: canvas.w, height: canvas.h,
            channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    }).composite(layers).png().toBuffer();
}

function runFfmpeg(args, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const proc = execFile('ffmpeg', args, { timeout: timeoutMs }, (err, _stdout, stderr) => {
            if (err) reject(new Error(`ffmpeg error: ${stderr.slice(-500)}`));
            else resolve();
        });
        setTimeout(() => { proc.kill(); reject(new Error('ffmpeg timeout')); }, timeoutMs);
    });
}

async function extractVideoThumbnail(videoPath, outputPath) {
    // thumbnail=n=50 analyzes first 50 frames and picks the most visually representative one
    // avoids leading black frames far more reliably than a fixed timestamp seek
    console.log(`[Composer] Extracting thumbnail from: ${path.basename(videoPath)}`);
    await runFfmpeg([
        '-i', videoPath,
        '-vf', 'thumbnail=n=50',
        '-frames:v', '1',
        '-y',
        outputPath,
    ], 30000);
    console.log(`[Composer] Thumbnail extracted: ${path.basename(outputPath)}`);
}

async function generateVideoCollage(sessionID, photoFilenames, layout, slots) {
    const sessionDir = path.join(ROOT, 'sessions', sessionID);
    const finalLocalPath = path.join(sessionDir, 'collage.mp4');
    const baseFramePath = path.join(sessionDir, '_base.png');
    const topLayerPath = path.join(sessionDir, '_top.png');

    console.log(`[Composer] Video collage: ${sessionID}`);

    const [baseBuffer, topBuffer] = await Promise.all([
        buildBaseFrame(sessionDir, photoFilenames, layout, slots),
        buildTopLayer(layout),
    ]);
    await Promise.all([
        fs.promises.writeFile(baseFramePath, baseBuffer),
        fs.promises.writeFile(topLayerPath, topBuffer),
    ]);

    const videoEntries = slots
        .map((slot, i) => ({ slot, filepath: path.join(sessionDir, photoFilenames[i]) }))
        .filter(({ slot, filepath }) => slot.effectiveType === 'video' && fs.existsSync(filepath));

    if (videoEntries.length === 0) {
        throw new Error('[Composer] No valid video files found');
    }

    // Inputs: [0]=base (loop), [1..N]=videos, [N+1]=top (loop)
    const args = ['-y'];
    args.push('-loop', '1', '-framerate', '30', '-i', baseFramePath);
    videoEntries.forEach(({ filepath }) => args.push('-i', filepath));
    args.push('-loop', '1', '-framerate', '30', '-i', topLayerPath);

    // filter_complex: scale each video slot, then chain overlays
    const topIdx = videoEntries.length + 1;
    const scaleParts = videoEntries.map(({ slot }, i) =>
        `[${i + 1}:v]fps=30,scale=${Math.round(slot.w)}:${Math.round(slot.h)}[sv${i}]`
    );
    const overlayParts = [];
    let prev = '0:v';
    videoEntries.forEach(({ slot }, i) => {
        const out = `ov${i}`;
        overlayParts.push(`[${prev}][sv${i}]overlay=${Math.round(slot.x)}:${Math.round(slot.y)}[${out}]`);
        prev = out;
    });
    overlayParts.push(`[${prev}][${topIdx}:v]overlay=0:0[final]`);

    const maxDuration = Math.max(...videoEntries.map(({ slot }) => slot.timedDuration || 5));

    args.push('-filter_complex', [...scaleParts, ...overlayParts].join(';'));
    args.push('-map', '[final]');
    args.push('-t', String(maxDuration));
    // args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
    args.push(finalLocalPath);

    console.log('[Composer] Running ffmpeg for video collage...');
    await runFfmpeg(args);
    console.log(`[Composer] Video saved: ${finalLocalPath}`);

    // Extract thumbnail from the final composited mp4 (non-black representative frame)
    const thumbLocalPath = path.join(sessionDir, '_thumb.jpg');
    try {
        await extractVideoThumbnail(finalLocalPath, thumbLocalPath);
    } catch (e) {
        console.error('[Composer] Thumbnail extraction failed:', e.message);
    }

    const finalBuffer = await fs.promises.readFile(finalLocalPath);
    let publicUrl = null;
    try {
        const thumbBuffer = fs.existsSync(thumbLocalPath)
            ? await fs.promises.readFile(thumbLocalPath)
            : null;
        console.log(`[Composer] Uploading mp4 (${finalBuffer.length} bytes) + thumbnail (${thumbBuffer?.length ?? 0} bytes)`);
        [publicUrl] = await Promise.all([
            uploadImage(sessionID, finalBuffer, 'mp4'),
            thumbBuffer ? uploadThumbnail(sessionID, thumbBuffer) : Promise.resolve(),
        ]);
    } catch (e) {
        console.error('[Composer] Upload failed:', e.message);
    }

    await Promise.all([
        fs.promises.unlink(baseFramePath).catch(() => { }),
        fs.promises.unlink(topLayerPath).catch(() => { }),
        fs.promises.unlink(thumbLocalPath).catch(() => { }),
    ]);

    return { publicUrl, localPath: `/sessions/${sessionID}/collage.mp4` };
}

module.exports = { generateFinalCollage };
