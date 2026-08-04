import { randomBytes } from 'node:crypto';
import { query } from '../config/database.js';
import { getPublicBaseUrl } from '../utils/publicUrl.js';
function shareBaseUrl() {
    return getPublicBaseUrl();
}
export class VideoShareLinkService {
    static async create(tenantId, clipRef, opts) {
        if (clipRef.source === 'storage' && !clipRef.path) {
            throw new Error('Storage clips require a path');
        }
        if (clipRef.source === 'message' && clipRef.messageId == null) {
            throw new Error('Message clips require messageId');
        }
        const hours = Math.min(Math.max(opts?.expiresInHours ?? 72, 1), 24 * 30);
        const token = randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + hours * 3600_000);
        await query(`INSERT INTO video_share_links (token, tenant_id, clip_ref, label, expires_at, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`, [
            token,
            tenantId,
            JSON.stringify(clipRef),
            opts?.label ?? null,
            expiresAt.toISOString(),
            opts?.createdBy ?? null,
        ]);
        return {
            token,
            tenantId,
            clipRef,
            label: opts?.label ?? null,
            expiresAt: expiresAt.toISOString(),
            shareUrl: `${shareBaseUrl()}/api/public/video/${token}`,
        };
    }
    static async resolve(token) {
        const { rows } = await query(`SELECT tenant_id, clip_ref, label, expires_at
       FROM video_share_links WHERE token = $1`, [token]);
        const row = rows[0];
        if (!row)
            return null;
        if (new Date(row.expires_at).getTime() < Date.now())
            return null;
        return {
            tenantId: row.tenant_id,
            clipRef: row.clip_ref,
            label: row.label,
        };
    }
}
