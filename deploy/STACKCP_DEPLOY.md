# Deploy MAMS on StackCP → mams.mimitotracking.co.ug

**Standard method:** GitHub clone into `repos/mams`.  
**Full guide:** [GITHUB_RECONNECT.md](./GITHUB_RECONNECT.md)

## Quick reference

| Setting | Value |
|---------|--------|
| **Git URL** | `https://github.com/mimitotech/unified-fleet-platform.git` |
| **Clone path** | `repos/mams` |
| **Document root** | `repos/mams` |
| **Full path** | `/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams` |
| **Entry file** | `hostinger-start.mjs` |
| **Node** | 22+ |
| **Branch** | `master` |

## Layout

```
repos/mams/
  hostinger-start.mjs
  package.json
  ecosystem.config.js
  .env                  ← create on server
  backend/
  frontend/
  packages/
  .cpanel.yml
```

## `.env` on server

Copy from [hostinger.env.example](./hostinger.env.example) or `.env.example` in repo root.

Must include **`PORT=3000`**, DB credentials, `JWT_SECRET`, `ENCRYPTION_KEY`.

## Node registration

StackCP → **Node.js Application Registration** → **Discover applications** → **`mams`**

## Checklist

- [ ] Git cloned into `repos/mams`
- [ ] Document root = `repos/mams`
- [ ] `.env` with `PORT=3000` and DB settings
- [ ] MySQL dump imported into `mamsdb-35303030746b`
- [ ] `npm run build` completed (`backend/dist`, `frontend/dist` exist)
- [ ] Node app **`mams`** registered
- [ ] https://mams.mimitotracking.co.ug/health OK

## Manual upload fallback

[ MAMSMAIN_DEPLOY.md](./MAMSMAIN_DEPLOY.md) — build zip on Mac if server cannot run npm.
