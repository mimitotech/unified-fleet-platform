import { query } from '../config/database.js';
export class AuditService {
    static async log(entry) {
        await query(`INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            entry.tenantId || null,
            entry.userId || null,
            entry.userEmail || null,
            entry.action,
            entry.resourceType || null,
            entry.resourceId || null,
            JSON.stringify(entry.details || {}),
            entry.ipAddress || null,
        ]);
    }
    static async logActivity(tenantId, eventType, title, description, metadata) {
        await query(`INSERT INTO activity_feed (tenant_id, event_type, title, description, metadata)
       VALUES ($1, $2, $3, $4, $5)`, [tenantId, eventType, title, description || null, JSON.stringify(metadata || {})]);
    }
}
