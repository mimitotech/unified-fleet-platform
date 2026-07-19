import { randomBytes } from 'node:crypto';
import { query } from '../config/database.js';

export type VideoClipRef = {
  unitId: number;
  source: 'storage' | 'message';
  path?: string;
  storageType?: 1 | 2;
  messageId?: number;
};

export type VideoShareLink = {
  token: string;
  tenantId: string;
  clipRef: VideoClipRef;
  label: string | null;
  expiresAt: string;
  shareUrl: string;
};

function shareBaseUrl(): string {
  return (
    process.env.API_PUBLIC_URL ||
    process.env.BACKEND_URL ||
    `http://localhost:${process.env.PORT || '3000'}`
  ).replace(/\/$/, '');
}

export class VideoShareLinkService {
  static async create(
    tenantId: string,
    clipRef: VideoClipRef,
    opts?: { label?: string; expiresInHours?: number; createdBy?: string }
  ): Promise<VideoShareLink> {
    if (clipRef.source === 'storage' && !clipRef.path) {
      throw new Error('Storage clips require a path');
    }
    if (clipRef.source === 'message' && clipRef.messageId == null) {
      throw new Error('Message clips require messageId');
    }

    const hours = Math.min(Math.max(opts?.expiresInHours ?? 72, 1), 24 * 30);
    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + hours * 3600_000);

    await query(
      `INSERT INTO video_share_links (token, tenant_id, clip_ref, label, expires_at, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [
        token,
        tenantId,
        JSON.stringify(clipRef),
        opts?.label ?? null,
        expiresAt.toISOString(),
        opts?.createdBy ?? null,
      ]
    );

    return {
      token,
      tenantId,
      clipRef,
      label: opts?.label ?? null,
      expiresAt: expiresAt.toISOString(),
      shareUrl: `${shareBaseUrl()}/api/public/video/${token}`,
    };
  }

  static async resolve(token: string): Promise<{
    tenantId: string;
    clipRef: VideoClipRef;
    label: string | null;
  } | null> {
    const { rows } = await query<{
      tenant_id: string;
      clip_ref: VideoClipRef;
      label: string | null;
      expires_at: Date;
    }>(
      `SELECT tenant_id, clip_ref, label, expires_at
       FROM video_share_links WHERE token = $1`,
      [token]
    );
    const row = rows[0];
    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return {
      tenantId: row.tenant_id,
      clipRef: row.clip_ref,
      label: row.label,
    };
  }
}
