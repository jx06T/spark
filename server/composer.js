const sharp = require('sharp');
const QRCode = require('qrcode');
const dayjs = require('dayjs');
const fs = require('fs');
const path = require('path');
const { uploadImage } = require('./uploader');

const ROOT = path.join(__dirname, '..');

async function generateFinalCollage(sessionID, photoFilenames, layout) {
    const sessionDir = path.join(ROOT, 'sessions', sessionID);
    const photoPaths = photoFilenames.map(name => path.join(sessionDir, name));
    const finalLocalPath = path.join(sessionDir, 'collage.jpg');

    try {
        console.log(`[Composer] Processing session: ${sessionID}`);

        const officialWebsiteUrl = "https://club.cksc.tw/";
        const currentDate = dayjs().format('YYYY.MM.DD');

        const qrBuffer = await QRCode.toBuffer(officialWebsiteUrl, {
            margin: 1,
            color: { dark: '#000000', light: '#FFFFFF' }
        });

        const photoLayers = await Promise.all(
            photoPaths.map(async (photoPath, i) => {
                const slot = (layout.slots || layout.photo_slots)[i];
                if (!fs.existsSync(photoPath)) {
                    console.warn(`[Composer] Warning: File not found ${photoPath}`);
                    return null;
                }

                const metadata = await sharp(photoPath).metadata();
                const offsetX = Math.max(0, Math.round((metadata.width - slot.w) / 2));
                const offsetY = Math.max(0, Math.round((metadata.height - slot.h) / 2));

                const croppedPhoto = await sharp(photoPath)
                    .extract({
                        left: offsetX,
                        top: offsetY,
                        width: Math.min(slot.w, metadata.width - offsetX),
                        height: Math.min(slot.h, metadata.height - offsetY)
                    })
                    .resize(slot.w, slot.h, { fit: 'fill' })
                    .toBuffer();

                return { input: croppedPhoto, top: slot.y, left: slot.x };
            })
        );
        const layers = photoLayers.filter(Boolean);

        layers.push({ input: layout.overlay_path, top: 0, left: 0 });

        for (const widget of layout.widgets) {
            if (widget.type === 'text') {
                const text = widget.content.replace('{CURRENT_DATE}', currentDate);
                const svgText = Buffer.from(`
                    <svg width="${layout.canvas.w}" height="${widget.fontSize * 1.5}">
                        <text x="0" y="${widget.fontSize}"
                              font-family="${widget.fontFamily || 'Arial'}"
                              font-size="${widget.fontSize}"
                              fill="${widget.color}"
                              font-weight="bold">
                            ${text}
                        </text>
                    </svg>
                `);
                layers.push({ input: svgText, top: widget.y, left: widget.x });
            } else if (widget.type === 'image') {
                let imgBuffer;
                if (widget.content === '{QR_CODE}') {
                    imgBuffer = await sharp(qrBuffer).resize(widget.w, widget.h).toBuffer();
                } else {
                    imgBuffer = await sharp(path.resolve(widget.content)).resize(widget.w, widget.h).toBuffer();
                }
                layers.push({ input: imgBuffer, top: widget.y, left: widget.x });
            }
        }

        const finalBuffer = await sharp({
            create: {
                width: layout.canvas.w,
                height: layout.canvas.h,
                channels: 4,
                background: layout.canvas.bg
            }
        }).composite(layers).jpeg({ quality: 95 }).toBuffer();

        await fs.promises.writeFile(finalLocalPath, finalBuffer);
        console.log(`[Composer] Saved locally to: ${finalLocalPath}`);

        const relativePath = `sessions/${sessionID}/collage.jpg`;
        let publicUrl = null;
        try {
            publicUrl = await uploadImage(sessionID, finalBuffer);
        } catch (uploadErr) {
            console.error('[Composer] Upload failed, local result still available:', uploadErr.message);
        }

        return { publicUrl, localPath: relativePath };

    } catch (err) {
        console.error('[Composer] Failed:', err);
        throw err;
    }
}

module.exports = { generateFinalCollage };
