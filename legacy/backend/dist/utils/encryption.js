import crypto from 'crypto';
const ALGO = 'aes-256-gcm';
const KEY = () => {
    const k = process.env.ENCRYPTION_KEY || 'dev-encryption-key-32chars!!!!!!';
    return crypto.createHash('sha256').update(k).digest();
};
export function encryptCredentials(data) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGO, KEY(), iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
}
export function decryptCredentials(encrypted) {
    if (!encrypted)
        return {};
    try {
        const buf = Buffer.from(encrypted, 'base64');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const data = buf.subarray(28);
        const decipher = crypto.createDecipheriv(ALGO, KEY(), iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(data), decipher.final()]);
        return JSON.parse(dec.toString('utf8'));
    }
    catch (err) {
        const msg = err.message || 'decrypt failed';
        if (msg.includes('authenticate') || msg.includes('Unsupported state')) {
            throw new Error('Stored credentials could not be decrypted — ENCRYPTION_KEY may have changed. Re-save integrations in Admin (Wialon Center / tenant Integrations).');
        }
        throw new Error(`Credential decrypt failed: ${msg}`);
    }
}
