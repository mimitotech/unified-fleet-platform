# Unified Fleet Platform / MAMS

Multi-tenant fleet management unifying **Wialon**, **LocoNav**, and **TrackSolid Pro**.

## Layout (Hostinger-aligned)

```
platform/          ← Hostinger Root directory = platform
  hostinger-start.mjs
  backend/         Express API
  frontend/        Vite React PWA
  packages/        Shared types
  database/mysql/  phpMyAdmin schema
  deploy/          Env templates + deploy docs
```

## Production (Hostinger) — live

| Setting | Value |
|---------|--------|
| **Domain** | **https://mams.mimitotracking.com** |
| **MySQL** | **u632889724_mams** (user `u632889724_mams`) |
| **Root directory** | **`platform`** |
| Branch | `master` |
| Node | `22.x` |
| Build command | `npm run build` |
| Output directory | *(empty)* |
| Entry file | **`hostinger-start.mjs`** |

1. Import [`platform/database/mysql/ufp_complete_schema.sql`](platform/database/mysql/ufp_complete_schema.sql) in phpMyAdmin.
2. Env vars: [`platform/deploy/hostinger.env.example`](platform/deploy/hostinger.env.example) — import in hPanel.
3. Full guide: [`platform/deploy/HOSTINGER_DEPLOY.md`](platform/deploy/HOSTINGER_DEPLOY.md)

## Local development

```bash
cd platform
cp .env.example .env   # fill MySQL credentials
npm install
npm run build:local    # or npm run build
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3000/health  

Redis optional (`REDIS_DISABLED=1`). Docker/Postgres is not required for production MySQL.
