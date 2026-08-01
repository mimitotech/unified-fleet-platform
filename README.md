# Unified Fleet Platform / MAMS

Multi-tenant fleet management unifying **Wialon**, **LocoNav**, and **TrackSolid Pro**.

## Layout (clone = run root)

```
unified-fleet-platform/     ← Git clone AND domain document root
  hostinger-start.mjs       ← entry file
  package.json
  backend/
  frontend/
  packages/
  database/mysql/           ← schema SQL
  deploy/                   ← env examples + deploy docs
  .env                      ← create on server (not in git)
```

## Production (StackCP)

| Setting | Value |
|---------|--------|
| Domain | https://mams.mimitotracking.co.ug |
| Document root | clone folder (e.g. `repos/mams` or `mams.mimitotracking.co.ug`) |
| Entry | **`hostinger-start.mjs`** |
| Node | `22.x` |
| Branch | `master` |

1. Clone `https://github.com/mimitotech/unified-fleet-platform.git` into the document root.
2. Create `.env` from [`.env.example`](.env.example).
3. Import live MySQL dump (or [`database/mysql/ufp_complete_schema.sql`](database/mysql/ufp_complete_schema.sql)).
4. `npm install --legacy-peer-deps --ignore-scripts && npm run build`
5. Run with Node: `node hostinger-start.mjs` (or PM2 / Node selector).

Guide: [`deploy/STACKCP_DEPLOY.md`](deploy/STACKCP_DEPLOY.md)

## Local development

```bash
cp .env.example .env   # fill MySQL credentials
npm install
npm run build:local    # or npm run build
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3000/health  

Redis optional (`REDIS_DISABLED=1`).
