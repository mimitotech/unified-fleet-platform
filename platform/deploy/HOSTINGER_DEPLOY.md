# Deploy MAMS on Hostinger — same pattern as HomeBridge+

**Database:** Hostinger MySQL (`u454222977_mams`) via `mysql2`.

Import schema first: `platform/database/mysql/ufp_complete_schema.sql` in phpMyAdmin  
(path relative to **repo root**; if Hostinger Root = `platform`, the file is `database/mysql/ufp_complete_schema.sql`).

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

## Environment variables

Import from `deploy/hostinger.env.example` (inside the `platform` folder on disk).

Critical:

```
DB_USER=u454222977_mams
DB_PASSWORD=…          # exact password from hPanel → Databases (reset if unsure)
DB_NAME=u454222977_mams
API_PUBLIC_URL=https://mams.frontstardigital.com
FRONTEND_URL=https://mams.frontstardigital.com
VITE_API_URL=
REDIS_DISABLED=1
```

`DB_HOST` is optional — the app tries **Unix socket** first, then **TCP 127.0.0.1** (never bare `localhost`, which Node resolves to `::1`).  
Prefer discrete `DB_*` over `DATABASE_URL`. Confirm the same user/password opens **phpMyAdmin**.

## Logos & uploads

Tenant logos/favicons are stored in **MySQL** (`tenant_files.content`) and also written under `UPLOAD_DIR` (default `uploads/`).

On Hostinger, redeploys often wipe the local `uploads/` folder. The app serves `/uploads/...` from disk first, then **falls back to MySQL** and rehydrates the file — so logos survive redeploys after a fresh upload.

After deploy, re-upload any logo that was saved before this change (older rows have no `content` bytes).

Optional: `UPLOAD_DIR=/absolute/persistent/path` if Hostinger gives you durable disk.

## Architecture

```
Mac → GitHub → Hostinger Node (Root=platform)
                    ↓
               Hostinger MySQL
```

Same account pattern as HomeBridge+ (`Root directory = platform`).
