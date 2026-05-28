const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const R2_FOLDER = 'collages';

const isR2Configured = !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
);

const r2Client = isR2Configured
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    })
    : null;

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

// Startup config check
console.log('[Uploader] R2 configured:', isR2Configured);
if (isR2Configured) {
    console.log(`[Uploader] R2 bucket: ${process.env.R2_BUCKET_NAME}, folder: ${R2_FOLDER}`);
    console.log(`[Uploader] R2 endpoint: https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
}
console.log('[Uploader] Supabase configured:', !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY));

const VERCEL_DOMAIN = 'https://cyber-booth.vercel.app';

const CONTENT_TYPES = { jpg: 'image/jpeg', mp4: 'video/mp4' };

async function uploadToR2(filename, buffer, contentType) {
    const key = `${R2_FOLDER}/${filename}`;
    console.log(`[Uploader] Uploading to R2: ${key} (${buffer.length} bytes, ${contentType})`);
    await r2Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    }));
    console.log(`[Uploader] R2 upload success: ${key}`);
}

async function uploadImage(sessionID, buffer, ext = 'jpg') {
    if (!isR2Configured) {
        console.warn('[Uploader] R2 not configured, skipping upload');
        return `${VERCEL_DOMAIN}/deploy-info`;
    }

    const contentType = CONTENT_TYPES[ext] || 'image/jpeg';

    try {
        await uploadToR2(`${sessionID}.${ext}`, buffer, contentType);

        if (supabase) {
            console.log(`[Uploader] Inserting DB record for session: ${sessionID}`);
            const { error } = await supabase
                .from('collages')
                .insert([{ session_id: sessionID }]);
            if (error) {
                console.error('[Uploader] DB insert error:', error.message, error.code);
            } else {
                console.log(`[Uploader] DB insert success: ${sessionID}`);
            }
        }

        const publicUrl = `${VERCEL_DOMAIN}/?id=${sessionID}`;
        console.log(`[Uploader] Public URL: ${publicUrl}`);
        return publicUrl;

    } catch (err) {
        console.error('[Uploader] uploadImage error:', err.message);
        throw err;
    }
}

async function uploadThumbnail(sessionID, buffer) {
    if (!isR2Configured) return;
    try {
        await uploadToR2(`${sessionID}_thumb.jpg`, buffer, 'image/jpeg');
    } catch (err) {
        console.error('[Uploader] Thumbnail upload error:', err.message);
    }
}

module.exports = { uploadImage, uploadThumbnail };
