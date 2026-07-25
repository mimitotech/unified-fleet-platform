import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { query } from '../config/database.js';
import { resolveUploadRoot } from '../utils/paths.js';
import { resolveUploadMime } from './UploadService.js';

const UPLOAD_ROOT = resolveUploadRoot();
const MAX_BYTES = 2 * 1024 * 1024;

export type LoginTrustLogoRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  mimeType: string | null;
  sortOrder: number;
  isEnabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

let schemaReady: Promise<void> | null = null;

function toBuffer(value: unknown): Buffer | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) return value.length ? value : null;
  if (value instanceof ArrayBuffer) {
    const buf = Buffer.from(value);
    return buf.length ? buf : null;
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const buf = Buffer.from(view.buffer, view.byteOffset, view.byteLength);
    return buf.length ? buf : null;
  }
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
    const buf = Buffer.from(value);
    return buf.length ? buf : null;
  }
  return null;
}

function mapRow(r: Record<string, unknown>): LoginTrustLogoRow {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    imageUrl: r.image_url != null ? String(r.image_url) : null,
    mimeType: r.mime_type != null ? String(r.mime_type) : null,
    sortOrder: Number(r.sort_order ?? 0),
    isEnabled: Boolean(Number(r.is_enabled ?? 1)),
    createdAt: r.created_at != null ? String(r.created_at) : undefined,
    updatedAt: r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

/** Client logos shown in the “trusted by” strip on the public login page. */
export class LoginTrustLogoService {
  static async ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await query(`
          CREATE TABLE IF NOT EXISTS login_trust_logos (
            id CHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            image_url VARCHAR(512) NULL,
            image_content LONGBLOB NULL,
            mime_type VARCHAR(128) NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            KEY idx_login_trust_logos_enabled_sort (is_enabled, sort_order)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      })().catch((e) => {
        console.warn('[login-trust-logos] ensureSchema:', (e as Error).message);
      });
    }
    await schemaReady;
  }

  static async listAll(): Promise<LoginTrustLogoRow[]> {
    await this.ensureSchema();
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, name, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
       FROM login_trust_logos
       ORDER BY sort_order ASC, created_at ASC`,
    );
    return rows.map(mapRow);
  }

  static async listPublic(): Promise<LoginTrustLogoRow[]> {
    await this.ensureSchema();
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, name, image_url, mime_type, sort_order, is_enabled
       FROM login_trust_logos
       WHERE is_enabled = 1
       ORDER BY sort_order ASC, created_at ASC`,
    );
    return rows.map(mapRow);
  }

  static async get(id: string): Promise<LoginTrustLogoRow | null> {
    await this.ensureSchema();
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, name, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
       FROM login_trust_logos WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  static async create(input: {
    name: string;
    sortOrder?: number;
    isEnabled?: boolean;
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
  }): Promise<LoginTrustLogoRow> {
    await this.ensureSchema();
    const id = randomUUID();
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Client name is required');
    if (!input.dataBase64 || !input.fileName) throw new Error('Logo image is required');

    const saved = await this.saveImage(id, input.fileName, input.mimeType, input.dataBase64);
    const sortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : await this.nextSortOrder();
    const isEnabled = input.isEnabled === false ? 0 : 1;

    await query(
      `INSERT INTO login_trust_logos
         (id, name, image_url, image_content, mime_type, sort_order, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, name, saved.imageUrl, saved.content, saved.mimeType, sortOrder, isEnabled],
    );

    const row = await this.get(id);
    if (!row) throw new Error('Failed to create trust logo');
    return row;
  }

  static async update(
    id: string,
    input: {
      name?: string;
      sortOrder?: number;
      isEnabled?: boolean;
      fileName?: string;
      mimeType?: string;
      dataBase64?: string;
    },
  ): Promise<LoginTrustLogoRow> {
    await this.ensureSchema();
    const existing = await this.get(id);
    if (!existing) throw new Error('Logo not found');

    let imageUrl = existing.imageUrl;
    let mimeType = existing.mimeType;
    let content: Buffer | null | undefined;

    if (input.dataBase64 && input.fileName) {
      const saved = await this.saveImage(id, input.fileName, input.mimeType, input.dataBase64);
      imageUrl = saved.imageUrl;
      mimeType = saved.mimeType;
      content = saved.content;
    }

    const name = input.name != null ? String(input.name).trim() : existing.name;
    if (!name) throw new Error('Client name is required');

    await query(
      `UPDATE login_trust_logos SET
         name = $1,
         image_url = $2,
         mime_type = $3,
         sort_order = $4,
         is_enabled = $5,
         image_content = CASE WHEN $6 IS NOT NULL THEN $6 ELSE image_content END,
         updated_at = NOW(3)
       WHERE id = $7`,
      [
        name,
        imageUrl,
        mimeType,
        input.sortOrder != null && Number.isFinite(input.sortOrder)
          ? Number(input.sortOrder)
          : existing.sortOrder,
        input.isEnabled != null ? (input.isEnabled ? 1 : 0) : existing.isEnabled ? 1 : 0,
        content ?? null,
        id,
      ],
    );

    const row = await this.get(id);
    if (!row) throw new Error('Logo not found after update');
    return row;
  }

  static async remove(id: string): Promise<boolean> {
    await this.ensureSchema();
    const existing = await this.get(id);
    if (!existing) return false;
    await query(`DELETE FROM login_trust_logos WHERE id = $1`, [id]);
    if (existing.imageUrl?.startsWith('/uploads/login-trust-logos/')) {
      const disk = path.join(UPLOAD_ROOT, existing.imageUrl.replace(/^\/uploads\//, ''));
      try {
        if (fs.existsSync(disk)) fs.unlinkSync(disk);
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  static async findImageByPublicUrl(
    publicUrl: string,
  ): Promise<{ content: Buffer; mimeType: string; filePath: string } | null> {
    await this.ensureSchema();
    const { rows } = await query<Record<string, unknown>>(
      `SELECT image_content, mime_type, image_url FROM login_trust_logos WHERE image_url = $1 LIMIT 1`,
      [publicUrl],
    );
    const row = rows[0];
    if (!row) return null;
    const content = toBuffer(row.image_content);
    if (!content) return null;
    const rel = String(row.image_url || '').replace(/^\/uploads\//, '');
    return {
      content,
      mimeType: String(row.mime_type || 'image/png'),
      filePath: path.join(UPLOAD_ROOT, rel),
    };
  }

  private static async nextSortOrder(): Promise<number> {
    const { rows } = await query<{ m: number | null }>(`SELECT MAX(sort_order) AS m FROM login_trust_logos`);
    return Number(rows[0]?.m ?? -1) + 1;
  }

  private static async saveImage(
    logoId: string,
    fileName: string,
    mimeType: string | undefined,
    dataBase64: string,
  ): Promise<{ imageUrl: string; mimeType: string; content: Buffer }> {
    const base64 = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
    const content = Buffer.from(base64, 'base64');
    if (!content.length) throw new Error('Empty image data');
    if (content.length > MAX_BYTES) throw new Error('Logo must be 2 MB or smaller');

    const mime = resolveUploadMime(fileName, mimeType);
    if (!mime.startsWith('image/')) throw new Error('Only image uploads are allowed');

    const ext = path.extname(fileName).toLowerCase() || '.png';
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext) ? ext : '.png';
    const dir = path.join(UPLOAD_ROOT, 'login-trust-logos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = `${logoId}${safeExt}`;
    const diskPath = path.join(dir, safeName);
    fs.writeFileSync(diskPath, content);

    return {
      imageUrl: `/uploads/login-trust-logos/${safeName}`,
      mimeType: mime,
      content,
    };
  }
}
