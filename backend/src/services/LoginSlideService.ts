import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { query } from '../config/database.js';
import { resolveUploadRoot } from '../utils/paths.js';
import { resolveUploadMime } from './UploadService.js';

const UPLOAD_ROOT = resolveUploadRoot();
const MAX_BYTES = 5 * 1024 * 1024;

export type LoginSlideRow = {
  id: string;
  title: string;
  details: string | null;
  eyebrow: string | null;
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

function mapRow(r: Record<string, unknown>): LoginSlideRow {
  return {
    id: String(r.id),
    title: String(r.title || ''),
    details: r.details != null ? String(r.details) : null,
    eyebrow: r.eyebrow != null ? String(r.eyebrow) : null,
    imageUrl: r.image_url != null ? String(r.image_url) : null,
    mimeType: r.mime_type != null ? String(r.mime_type) : null,
    sortOrder: Number(r.sort_order ?? 0),
    isEnabled: Boolean(Number(r.is_enabled ?? 1)),
    createdAt: r.created_at != null ? String(r.created_at) : undefined,
    updatedAt: r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

export class LoginSlideService {
  static async ensureSchema(): Promise<void> {
    if (!schemaReady) {
      schemaReady = (async () => {
        await query(`
          CREATE TABLE IF NOT EXISTS login_slides (
            id CHAR(36) NOT NULL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            details TEXT NULL,
            eyebrow VARCHAR(128) NULL,
            image_url VARCHAR(512) NULL,
            image_content LONGBLOB NULL,
            mime_type VARCHAR(128) NULL,
            sort_order INT NOT NULL DEFAULT 0,
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
            updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
            KEY idx_login_slides_enabled_sort (is_enabled, sort_order)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
      })().catch((e) => {
        console.warn('[login-slides] ensureSchema:', (e as Error).message);
      });
    }
    await schemaReady;
  }

  static async listAll(): Promise<LoginSlideRow[]> {
    await this.ensureSchema();
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, title, details, eyebrow, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
       FROM login_slides
       ORDER BY sort_order ASC, created_at ASC`,
    );
    return rows.map(mapRow);
  }

  /** Enabled slides for the public login page. */
  static async listPublic(): Promise<LoginSlideRow[]> {
    await this.ensureSchema();
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, title, details, eyebrow, image_url, mime_type, sort_order, is_enabled
       FROM login_slides
       WHERE is_enabled = 1
       ORDER BY sort_order ASC, created_at ASC`,
    );
    return rows.map(mapRow);
  }

  static async get(id: string): Promise<LoginSlideRow | null> {
    await this.ensureSchema();
    const { rows } = await query<Record<string, unknown>>(
      `SELECT id, title, details, eyebrow, image_url, mime_type, sort_order, is_enabled, created_at, updated_at
       FROM login_slides WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  static async create(input: {
    title: string;
    details?: string | null;
    eyebrow?: string | null;
    sortOrder?: number;
    isEnabled?: boolean;
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
  }): Promise<LoginSlideRow> {
    await this.ensureSchema();
    const id = randomUUID();
    const title = String(input.title || '').trim();
    if (!title) throw new Error('Title is required');

    let imageUrl: string | null = null;
    let mimeType: string | null = null;
    let content: Buffer | null = null;

    if (input.dataBase64 && input.fileName) {
      const saved = await this.saveImage(id, input.fileName, input.mimeType, input.dataBase64);
      imageUrl = saved.imageUrl;
      mimeType = saved.mimeType;
      content = saved.content;
    }

    const sortOrder = Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : await this.nextSortOrder();
    const isEnabled = input.isEnabled === false ? 0 : 1;

    await query(
      `INSERT INTO login_slides
         (id, title, details, eyebrow, image_url, image_content, mime_type, sort_order, is_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        title,
        input.details?.trim() || null,
        input.eyebrow?.trim() || null,
        imageUrl,
        content,
        mimeType,
        sortOrder,
        isEnabled,
      ],
    );

    const row = await this.get(id);
    if (!row) throw new Error('Failed to create login slide');
    return row;
  }

  static async update(
    id: string,
    input: {
      title?: string;
      details?: string | null;
      eyebrow?: string | null;
      sortOrder?: number;
      isEnabled?: boolean;
      fileName?: string;
      mimeType?: string;
      dataBase64?: string;
    },
  ): Promise<LoginSlideRow> {
    await this.ensureSchema();
    const existing = await this.get(id);
    if (!existing) throw new Error('Slide not found');

    let imageUrl = existing.imageUrl;
    let mimeType = existing.mimeType;
    let content: Buffer | null | undefined;

    if (input.dataBase64 && input.fileName) {
      const saved = await this.saveImage(id, input.fileName, input.mimeType, input.dataBase64);
      imageUrl = saved.imageUrl;
      mimeType = saved.mimeType;
      content = saved.content;
    }

    const title = input.title != null ? String(input.title).trim() : existing.title;
    if (!title) throw new Error('Title is required');

    await query(
      `UPDATE login_slides SET
         title = $1,
         details = $2,
         eyebrow = $3,
         image_url = $4,
         mime_type = $5,
         sort_order = $6,
         is_enabled = $7,
         image_content = CASE WHEN $8 IS NOT NULL THEN $8 ELSE image_content END,
         updated_at = NOW(3)
       WHERE id = $9`,
      [
        title,
        input.details !== undefined ? input.details?.trim() || null : existing.details,
        input.eyebrow !== undefined ? input.eyebrow?.trim() || null : existing.eyebrow,
        imageUrl,
        mimeType,
        input.sortOrder != null && Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : existing.sortOrder,
        input.isEnabled != null ? (input.isEnabled ? 1 : 0) : existing.isEnabled ? 1 : 0,
        content ?? null,
        id,
      ],
    );

    const row = await this.get(id);
    if (!row) throw new Error('Slide not found after update');
    return row;
  }

  static async remove(id: string): Promise<boolean> {
    await this.ensureSchema();
    const existing = await this.get(id);
    if (!existing) return false;
    await query(`DELETE FROM login_slides WHERE id = $1`, [id]);
    if (existing.imageUrl?.startsWith('/uploads/login-slides/')) {
      const disk = path.join(UPLOAD_ROOT, existing.imageUrl.replace(/^\/uploads\//, ''));
      try {
        if (fs.existsSync(disk)) fs.unlinkSync(disk);
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  static async findImageByPublicUrl(publicUrl: string): Promise<{ content: Buffer; mimeType: string; filePath: string } | null> {
    await this.ensureSchema();
    const { rows } = await query<Record<string, unknown>>(
      `SELECT image_content, mime_type, image_url FROM login_slides WHERE image_url = $1 LIMIT 1`,
      [publicUrl],
    );
    const row = rows[0];
    if (!row) return null;
    const content = toBuffer(row.image_content);
    if (!content) return null;
    const rel = String(row.image_url || '').replace(/^\/uploads\//, '');
    return {
      content,
      mimeType: String(row.mime_type || 'image/jpeg'),
      filePath: path.join(UPLOAD_ROOT, rel),
    };
  }

  private static async nextSortOrder(): Promise<number> {
    const { rows } = await query<{ m: number | null }>(`SELECT MAX(sort_order) AS m FROM login_slides`);
    return Number(rows[0]?.m ?? -1) + 1;
  }

  private static async saveImage(
    slideId: string,
    fileName: string,
    mimeType: string | undefined,
    dataBase64: string,
  ): Promise<{ imageUrl: string; mimeType: string; content: Buffer }> {
    const base64 = dataBase64.includes(',') ? dataBase64.split(',')[1] : dataBase64;
    const content = Buffer.from(base64, 'base64');
    if (!content.length) throw new Error('Empty image data');
    if (content.length > MAX_BYTES) throw new Error('Image must be 5 MB or smaller');

    const mime = resolveUploadMime(fileName, mimeType);
    if (!mime.startsWith('image/')) throw new Error('Only image uploads are allowed');

    const ext = path.extname(fileName).toLowerCase() || '.jpg';
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    const dir = path.join(UPLOAD_ROOT, 'login-slides');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safeName = `${slideId}${safeExt}`;
    const diskPath = path.join(dir, safeName);
    fs.writeFileSync(diskPath, content);

    return {
      imageUrl: `/uploads/login-slides/${safeName}`,
      mimeType: mime,
      content,
    };
  }
}
