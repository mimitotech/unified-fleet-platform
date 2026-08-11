# Deploy MAMS on Hostinger — production go-live

**Permanent domain:** [https://mams.mimitotracking.com](https://mams.mimitotracking.com)  
**Permanent MySQL:** `u632889724_mams` / user `u632889724_mams` via `mysql2`.

Import schema first: `platform/database/mysql/ufp_complete_schema.sql` in phpMyAdmin  
(path relative to **repo root**; if Hostinger Root = `platform`, the file is `database/mysql/ufp_complete_schema.sql`).

Optional bootstrap admin (once): `database/mysql/ufp_bootstrap_admin.sql`.

## Hostinger Node settings

| Setting | Value |
|---------|--------|
| **Root directory** | **`platform`** |
| Node.js | `22.x` |
| Branch | `master` |
| **Build command** | `npm run build` |
| Package manager | `npm` |
| **Output directory** | *(leave empty)* |
| **Entry file** | **`hostinger-start.mjs`** |

Hostinger installs dependencies automatically, then runs `npm run build`  
(which runs `scripts/hostinger-build.mjs` — chmod-safe, no `.bin` EACCES).

## Environment variables (required)

Import **`deploy/hostinger.env.example`** (or `deploy/hostinger.env` if you keep a local copy).

Critical values:

```
NODE_ENV=production
PORT=3000
DB_USER=u632889724_mams
DB_PASSWORD=<exact password from hPanel → Databases>
DB_NAME=u632889724_mams
DB_CONNECTION_LIMIT=20
DB_QUEUE_LIMIT=100
API_PUBLIC_URL=https://mams.mimitotracking.com
FRONTEND_URL=https://mams.mimitotracking.com
VITE_APP_URL=https://mams.mimitotracking.com
VITE_API_URL=
JWT_SECRET=<long random — keep forever once set>
ENCRYPTION_KEY=<32+ chars — never rotate after go-live>
REDIS_DISABLED=1
```

A local fill-in copy (gitignored) lives at `deploy/hostinger.env` — import that into Hostinger, or paste the password from hPanel into the example before import.

`DB_HOST` is optional — the app tries **Unix socket** first, then **TCP 127.0.0.1** (never bare `localhost`, which Node resolves to `::1`).  
Prefer discrete `DB_*` over `DATABASE_URL`. Confirm the same user/password opens **phpMyAdmin**.

**Do not change `ENCRYPTION_KEY` after tenants have saved Wialon/LocoNav/TrackSolid credentials** — stored tokens become undecryptable.

## Domain / SSL

1. Point `mams.mimitotracking.com` DNS A/CNAME to this Hostinger Node app.
2. Enable SSL in hPanel for that hostname.
3. Ensure the Node app is assigned to **mams.mimitotracking.com** (not an old frontstardigital host).

## Logos & uploads

Tenant logos/favicons are stored in **MySQL** (`tenant_files.content`) and also written under `UPLOAD_DIR` (default `uploads/`).

On Hostinger, redeploys often wipe the local `uploads/` folder. The app serves `/uploads/...` from disk first, then **falls back to MySQL** and rehydrates the file — so logos survive redeploys after a fresh upload.

After deploy, re-upload any logo that was saved before this change (older rows have no `content` bytes).

Optional: `UPLOAD_DIR=/absolute/persistent/path` if Hostinger gives you durable disk.

## Concurrency / stability

- MySQL pool: `DB_CONNECTION_LIMIT` (default 20) + `DB_QUEUE_LIMIT` (default 100).
- Redis off on Hostinger (`REDIS_DISABLED=1`) — in-process caches only.
- Workshop alert backfill is per-tenant throttled so many open browsers cannot stampede MySQL.
- HTTP app attaches **before** DB connect so nginx does not 504 during brief MySQL blips.

## Architecture

```
Mac → GitHub (mimitotech/unified-fleet-platform) → Hostinger Node (Root=platform)
                                                         ↓
                                                    Hostinger MySQL
                                                 u632889724_mams
```

Same account pattern as HomeBridge+ (`Root directory = platform`).

## Go-live checklist

1. [ ] phpMyAdmin: schema imported on `u632889724_mams`
2. [ ] Hostinger env imported from `deploy/hostinger.env.example`
3. [ ] Domain `mams.mimitotracking.com` + SSL on this Node app
4. [ ] Redeploy / restart Node after env save
5. [ ] Open `https://mams.mimitotracking.com/health` (or login page)
6. [ ] Login, confirm Monitoring / Workshop / Inbox load without React #310
