# Unified Fleet Platform / MAMS

Multi-tenant fleet management unifying **Wialon**, **LocoNav**, and **TrackSolid Pro**.

## Production (Hostinger Node + MySQL)

1. Import [`database/mysql/ufp_complete_schema.sql`](database/mysql/ufp_complete_schema.sql) in phpMyAdmin.
2. Follow [`deploy/HOSTINGER_DEPLOY.md`](deploy/HOSTINGER_DEPLOY.md) for Git build settings and env vars.
3. Use [`deploy/hostinger.env.example`](deploy/hostinger.env.example) as the env template.

Health check: `https://your-domain/health` → `database: connected`, `engine: mysql`.

## Local development

Node 18+, MySQL 8 (or MariaDB). Copy `.env.example` → `.env`, fill MySQL credentials, then:

```bash
npm install
npm run build -w @ufp/shared
npm run dev
```

- Frontend (Vite): http://localhost:5173  
- API: http://localhost:3000/health  

Docker/Postgres is no longer the production path. Redis is optional (`REDIS_DISABLED=1`).

## Structure

```
backend/     Express API (serves /api + built PWA in production)
frontend/    Vite React PWA
database/mysql/   phpMyAdmin import schema
deploy/      Hostinger env + deploy notes
migrations/  Legacy Postgres history (reference only)
```
