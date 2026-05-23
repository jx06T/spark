const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

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

const VERCEL_DOMAIN = 'https://cyber-booth.vercel.app';

const CONTENT_TYPES = { jpg: 'image/jpeg', mp4: 'video/mp4' };

async function uploadToR2(key, buffer, contentType) {
    await r2Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    }));
}

async function uploadImage(sessionID, buffer, ext = 'jpg') {
    if (!isR2Configured) {
        return `${VERCEL_DOMAIN}/deploy-info`;
    }

    const contentType = CONTENT_TYPES[ext] || 'image/jpeg';

    try {
        await uploadToR2(`${sessionID}.${ext}`, buffer, contentType);

        if (supabase) {
            const { error } = await supabase
                .from('collages')
                .insert([{ session_id: sessionID }]);
            if (error) console.error('[Uploader] DB insert error:', error);
        }

        return `${VERCEL_DOMAIN}/?id=${sessionID}`;

    } catch (err) {
        console.error('[Uploader] Error:', err);
        throw err;
    }
}

async function uploadThumbnail(sessionID, buffer) {
    if (!isR2Configured) return;
    try {
        await uploadToR2(`${sessionID}_thumb.jpg`, buffer, 'image/jpeg');
    } catch (err) {
        console.error('[Uploader] Thumbnail upload error:', err);
    }
}

module.exports = { uploadImage, uploadThumbnail };
