# Unified Fleet Platform / MAMS

Multi-tenant fleet management unifying **Wialon**, **LocoNav**, and **TrackSolid Pro**.

## Standard layout (Git clone = app root)

```
repos/mams/                 ← Git clone AND domain document root
  hostinger-start.mjs       ← entry file
  package.json
  ecosystem.config.js
  backend/
  frontend/
  packages/
  .env                      ← create on server (not in git)
```

## Production (StackCP + GitHub)

| Setting | Value |
|---------|--------|
| Domain | https://mams.mimitotracking.co.ug |
| Git repo | https://github.com/mimitotech/unified-fleet-platform.git |
| Clone path | `repos/mams` |
| Document root | `repos/mams` |
| Entry | `hostinger-start.mjs` |
| Node | 22.x |
| Branch | `master` |

**Reconnect guide:** [`deploy/GITHUB_RECONNECT.md`](deploy/GITHUB_RECONNECT.md)

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3000/health  

```bash
npm run build          # production build
node hostinger-start.mjs
```

Redis optional (`REDIS_DISABLED=1`).
