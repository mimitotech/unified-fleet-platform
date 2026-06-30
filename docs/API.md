# API Reference

Base URL: `http://localhost:3000`

All JSON responses: `{ success: boolean, data?: T, error?: string }`

## Auth

| Method | Path | Body |
|--------|------|------|
| POST | `/api/auth/login` | `{ email, password }` |
| GET | `/api/auth/me` | Bearer token |

## Client (tenant context)

Headers: `Authorization: Bearer <token>`, `X-Tenant-Slug: <slug>`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/client/tenant` | Branding info |
| GET | `/api/client/modules` | Enabled sidebar modules |
| GET | `/api/client/dashboard/kpis` | Dashboard KPIs |
| GET | `/api/client/assets` | Unified assets |
| GET | `/api/client/assets/statuses` | All asset statuses |
| GET | `/api/client/assets/:id/status` | Single asset status |
| GET | `/api/client/alerts` | Alert list |
| POST | `/api/client/alerts/:id/acknowledge` | Acknowledge alert |

## Admin (platform_admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/tenants` | List tenants |
| POST | `/api/admin/tenants` | Create tenant |
| PATCH | `/api/admin/tenants/:id` | Update branding |
| PUT | `/api/admin/tenants/:id/integrations/:sourceType` | Save credentials |
| GET | `/api/admin/tenants/:id/modules` | List modules |
| PUT | `/api/admin/tenants/:id/modules` | Toggle modules |

`sourceType`: `wialon` | `loconav` | `tracksolid`

## Webhooks

| Method | Path |
|--------|------|
| POST | `/api/webhooks/loconav/:tenantSlug` |
| POST | `/api/webhooks/tracksolid/:tenantSlug` |

## Health

`GET /health` → `{ status: "ok" }`
