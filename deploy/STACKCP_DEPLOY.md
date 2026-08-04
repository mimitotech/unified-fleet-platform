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
| **Node** | **22+** (not 16) |
| **Branch** | `master` |
| **DB name** | `mamsdb-35303030746b` |
| **DB user** | `nsamba` |
| **DB password** | `Mimito@@2026` |

## Layout

```
repos/mams/
  hostinger-start.mjs
  package.json
  ecosystem.config.js
  .env                  ← create on server (PORT=3000 + DB_*)
  backend/
  frontend/
  packages/
  .cpanel.yml
```

## Checklist

- [ ] Document root = `repos/mams`
- [ ] Git Pull latest `master` + Deploy
- [ ] `.env` with `PORT=3000`, `DB_USER=nsamba`, `DB_PASSWORD=Mimito@@2026`
- [ ] Node **22+** on server (not v16)
- [ ] Build OK: `backend/dist/index.js` + `frontend/dist/index.html`
- [ ] Node app **`mams`** registered
- [ ] https://mams.mimitotracking.co.ug/health OK
