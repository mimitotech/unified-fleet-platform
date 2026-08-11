import { query } from '../config/database.js';

export interface AuditEntry {
  tenantId?: string;
  userId?: string;
  userEmail?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

export class AuditService {
  static async log(entry: AuditEntry): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details, ip_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.tenantId || null,
          entry.userId || null,
          entry.userEmail || null,
          entry.action,
          entry.resourceType || null,
          entry.resourceId || null,
          JSON.stringify(entry.details || {}),
          entry.ipAddress || null,
        ]
      );
    } catch (err) {
      // Never fail a user-facing write because audit logging failed.
      console.warn('[audit] log failed:', (err as Error).message);
    }
  }

  static async logActivity(
    tenantId: string | null,
    eventType: string,
    title: string,
    description?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await query(
      `INSERT INTO activity_feed (tenant_id, event_type, title, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, eventType, title, description || null, JSON.stringify(metadata || {})]
    );
  }
}
