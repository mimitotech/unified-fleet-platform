import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { resolveUploadRoot } from '../utils/paths.js';

const UPLOAD_ROOT = resolveUploadRoot();
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']);

export class UploadService {
  static ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  static async saveTenantFile(
    tenantId: string,
    fileType: 'logo' | 'favicon' | 'document' | 'import',
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ url: string; id: string }> {
    if (!ALLOWED.has(mimeType) && fileType !== 'import') {
      throw new Error(`File type ${mimeType} not allowed`);
    }
    if (buffer.length > MAX_BYTES) throw new Error('File exceeds 5MB limit');

    const ext = path.extname(fileName) || (mimeType.includes('png') ? '.png' : '.jpg');
    const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const dir = path.join(UPLOAD_ROOT, 'tenants', tenantId);
    this.ensureDir(dir);
    const filePath = path.join(dir, safeName);
    fs.writeFileSync(filePath, buffer);

    const { rows } = await query<{ id: string }>(
      `INSERT INTO tenant_files (tenant_id, file_type, file_name, mime_type, file_path, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, fileType, fileName, mimeType, filePath, buffer.length]
    );

    const url = `/uploads/tenants/${tenantId}/${safeName}`;
    return { url, id: rows[0].id };
  }
}
