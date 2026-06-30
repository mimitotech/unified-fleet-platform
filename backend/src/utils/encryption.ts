import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const KEY = () => {
  const k = process.env.ENCRYPTION_KEY || 'dev-encryption-key-32chars!!!!!!';
  return crypto.createHash('sha256').update(k).digest();
};

export function encryptCredentials(data: Record<string, unknown>): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptCredentials(encrypted: string): Record<string, unknown> {
  if (!encrypted) return {};
  try {
    const buf = Buffer.from(encrypted, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, KEY(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  } catch {
    return {};
  }
}
