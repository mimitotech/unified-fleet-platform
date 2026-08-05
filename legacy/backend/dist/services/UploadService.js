import fs from 'fs';
import path from 'path';
import crypto, { randomUUID } from 'crypto';
import { query } from '../config/database.js';
import { resolveUploadRoot } from '../utils/paths.js';
const UPLOAD_ROOT = resolveUploadRoot();
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/svg+xml',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/gif',
]);
const EXT_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.gif': 'image/gif',
};
let schemaReady = null;
/** Guess MIME when browsers leave file.type empty (common for SVG/ICO). */
export function resolveUploadMime(fileName, mimeType) {
    const raw = String(mimeType || '').trim().toLowerCase();
    if (raw && raw !== 'application/octet-stream')
        return raw;
    const ext = path.extname(fileName).toLowerCase();
    return EXT_MIME[ext] || 'image/png';
}
function toBuffer(value) {
    if (value == null)
        return null;
    if (Buffer.isBuffer(value))
        return value.length ? value : null;
    if (value instanceof ArrayBuffer) {
        const buf = Buffer.from(value);
        return buf.length ? buf : null;
    }
    if (ArrayBuffer.isView(value)) {
        const view = value;
        const buf = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
        return buf.length ? buf : null;
    }
    // mysql2 occasionally returns binary as number[]
    if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
        const buf = Buffer.from(value);
        return buf.length ? buf : null;
    }
    return null;
}
export class UploadService {
    static ensureDir(dir) {
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
    }
    /** Persist bytes in MySQL so logos survive Hostinger redeploys that wipe disk. */
    static async ensureSchema() {
        if (!schemaReady) {
            schemaReady = (async () => {
                try {
                    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'tenant_files'
               AND COLUMN_NAME = 'content'`);
                    if (Number(rows[0]?.cnt) === 0) {
                        await query(`ALTER TABLE tenant_files ADD COLUMN content LONGBLOB NULL`);
                    }
                }
                catch (e) {
                    console.warn('[uploads] could not ensure tenant_files.content:', e.message);
                }
                try {
                    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'tenant_files'
               AND COLUMN_NAME = 'public_url'`);
                    if (Number(rows[0]?.cnt) === 0) {
                        await query(`ALTER TABLE tenant_files ADD COLUMN public_url VARCHAR(512) NULL`);
                        await query(`CREATE INDEX idx_tenant_files_public_url ON tenant_files (public_url)`).catch(() => undefined);
                    }
                }
                catch (e) {
                    console.warn('[uploads] could not ensure tenant_files.public_url:', e.message);
                }
            })();
        }
        await schemaReady;
    }
    static async saveTenantFile(tenantId, fileType, fileName, mimeType, buffer) {
        await this.ensureSchema();
        const mime = resolveUploadMime(fileName, mimeType);
        if (!ALLOWED.has(mime) && fileType !== 'import') {
            throw new Error(`File type ${mime || mimeType || '(empty)'} not allowed`);
        }
        if (buffer.length > MAX_BYTES)
            throw new Error('File exceeds 5MB limit');
        const ext = path.extname(fileName) ||
            (mime.includes('png')
                ? '.png'
                : mime.includes('svg')
                    ? '.svg'
                    : mime.includes('webp')
                        ? '.webp'
                        : mime.includes('gif')
                            ? '.gif'
                            : mime.includes('icon')
                                ? '.ico'
                                : '.jpg');
        const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
        const dir = path.join(UPLOAD_ROOT, 'tenants', tenantId);
        this.ensureDir(dir);
        const filePath = path.join(dir, safeName);
        fs.writeFileSync(filePath, buffer);
        // Always relative — never bake API_PUBLIC_URL / localhost into tenants.logo_url
        const publicUrl = `/uploads/tenants/${tenantId}/${safeName}`;
        const id = randomUUID();
        await query(`INSERT INTO tenant_files (id, tenant_id, file_type, file_name, mime_type, file_path, size_bytes, content, public_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [id, tenantId, fileType, fileName, mime, filePath, buffer.length, buffer, publicUrl]);
        // Bind branding immediately — admin no longer needs a separate Save for logos
        if (fileType === 'logo') {
            await query(`UPDATE tenants SET logo_url = $1, updated_at = NOW() WHERE id = $2`, [
                publicUrl,
                tenantId,
            ]);
        }
        else if (fileType === 'favicon') {
            await query(`UPDATE tenants SET favicon_url = $1, updated_at = NOW() WHERE id = $2`, [
                publicUrl,
                tenantId,
            ]);
        }
        return { url: publicUrl, id };
    }
    /** Look up bytes by public /uploads/... path (DB fallback when disk was wiped). */
    static async findByPublicUrl(publicUrl) {
        await this.ensureSchema();
        const normalized = publicUrl.startsWith('/') ? publicUrl : `/${publicUrl}`;
        const fileName = path.basename(normalized);
        const { rows } = await query(`SELECT content, mime_type, file_path FROM tenant_files
       WHERE public_url = $1
          OR file_path LIKE $2
          OR file_path LIKE $3
       ORDER BY (public_url = $1) DESC, created_at DESC
       LIMIT 1`, [normalized, `%/${fileName}`, `%\\${fileName}`]);
        const row = rows[0];
        const content = toBuffer(row?.content);
        if (!content)
            return null;
        return {
            content,
            mimeType: row.mime_type || 'application/octet-stream',
            filePath: row.file_path,
        };
    }
    /** Rehydrate disk from DB so subsequent static hits succeed. */
    static rehydrateToDisk(filePath, content, relUnderUploads) {
        const targets = [
            filePath,
            relUnderUploads ? path.join(UPLOAD_ROOT, relUnderUploads.replace(/^\/+/, '')) : null,
        ].filter(Boolean);
        for (const target of targets) {
            try {
                this.ensureDir(path.dirname(target));
                if (!fs.existsSync(target))
                    fs.writeFileSync(target, content);
            }
            catch {
                /* best-effort */
            }
        }
    }
}
