# Hostinger Node.js deploy — MAMS

## 1. Import MySQL schema

1. hPanel → **Databases** → **phpMyAdmin** → select `u454222977_mams`
2. **Import** → choose [`database/mysql/ufp_complete_schema.sql`](../database/mysql/ufp_complete_schema.sql)
3. Confirm tables appear (tenants, users, module_definitions, …)

## 2. Create first admin (after import)

In phpMyAdmin SQL tab (replace the bcrypt hash by running locally `node -e "console.log(require('bcryptjs').hashSync('YourPassword',10))"`):

```sql
INSERT INTO tenants (id, name, slug, status, is_active)
VALUES (UUID(), 'Mimito', 'mimito', 'active', 1);

INSERT INTO users (id, tenant_id, email, password_hash, full_name, role, is_active)
SELECT UUID(), t.id, 'admin@mimito.ug', '$2a$10$REPLACE_WITH_BCRYPT', 'Platform Admin', 'super_admin', 1
FROM tenants t WHERE t.slug = 'mimito' LIMIT 1;
```

## 3. Hostinger Git / Node build settings

| Field | Value |
|--------|--------|
| Framework | Other |
| Branch | `master` |
| Node | `22.x` |
| Root directory | `./` |
| **Build command** | `npm run build` *(dropdown — repo `build` runs Hostinger-safe script)* |
| **Output / entry** | Output: *(empty)* · Entry: **`hostinger-start.mjs`** |
| Start command (if asked) | `node hostinger-start.mjs` |

## 4. Environment variables

Paste from [`hostinger.env.example`](./hostinger.env.example).  
Set real `DB_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`.

**Important:** In hPanel MySQL details, if hostname is not `localhost` (e.g. `auth-db…` / `*.hstgr.io`), put that exact host in `DB_HOST`.

## 5. After deploy

- Open `https://mams.frontstardigital.com/health` → `{"status":"ok","database":"connected","engine":"mysql"}`
- Open `/` → PWA shell / login
- Install on phone via browser “Add to Home Screen”

## Security

Rotate the DB password that was shared in chat. Never commit `.env` with real secrets.
