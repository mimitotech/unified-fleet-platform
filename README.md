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

## Production

### StackCP / cPanel (`mams.mimitotracking.co.ug`)

cPanel Git Version Control + Node 22. Full guide: [`platform/deploy/STACKCP_DEPLOY.md`](platform/deploy/STACKCP_DEPLOY.md)

| Setting | Value |
|---------|--------|
| Domain | **https://mams.mimitotracking.co.ug** |
| Git / app path | nested cPanel path under `…/home/virtual/…/mams.mimitotracking.co.ug` (see STACKCP_DEPLOY.md) |
| Node app root | **`…/mams.mimitotracking.co.ug/platform`** |
| Entry | **`hostinger-start.mjs`** |
| Node | `22.x` |
| Branch | `master` |
| SSH | `mimitotracking.co.ug@ssh.lhr.stackcp.com:39550` |

### Hostinger (alternate)

| Setting | Value |
|---------|--------|
| **Root directory** | **`platform`** |
| Branch | `master` (or this feature branch) |
| Node | `22.x` |
| Build command | `npm run build` |
| Output directory | *(empty)* |
| Entry file | **`hostinger-start.mjs`** |

1. Import [`platform/database/mysql/ufp_complete_schema.sql`](platform/database/mysql/ufp_complete_schema.sql) in phpMyAdmin.
2. Env vars: [`platform/deploy/hostinger.env.example`](platform/deploy/hostinger.env.example)
3. Hostinger guide: [`platform/deploy/HOSTINGER_DEPLOY.md`](platform/deploy/HOSTINGER_DEPLOY.md)

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
