# MAMS PHP site (no Node)

Apache + PHP rewrite of MAMS. Same MySQL database and domain.

## Paths

| Item | Value |
|------|--------|
| Local folder | `/Users/mimac/Desktop/MAMS/site` |
| GitHub | `https://github.com/mimitotech/unified-fleet-platform.git` |
| Document root on StackCP | **`repos/mams/site`** (or `site`) |
| Domain | https://mams.mimitotracking.co.ug |
| DB | `mamsdb-35303030746b` / user `nsamba` |

## Deploy on StackCP

1. **Manage Domains** → `mams.mimitotracking.co.ug` → document root:

```
repos/mams/site
```

2. Git **Pull** latest `master` into `repos/mams`

3. Copy env:

File Manager → `repos/mams/site/.env` (from `.env.example`):

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nsamba
DB_PASSWORD=Mimito@@2026
DB_NAME=mamsdb-35303030746b
JWT_SECRET=8f905f233b59625107bdaab8c1edc083f6ce9e60543450a0ff1982d81ddd4db0
ENCRYPTION_KEY=3c339ed094c4cfcfe44fd6b0c0c8726e
API_PUBLIC_URL=https://mams.mimitotracking.co.ug
FRONTEND_URL=https://mams.mimitotracking.co.ug
```

4. PHP version **8.1+** (Change PHP Version)

5. **Unregister / ignore** the Node `mams` app (no port 3000 needed)

6. Test:

- https://mams.mimitotracking.co.ug/health  
- https://mams.mimitotracking.co.ug/auth/login  

## What works in this phase

- Health + MySQL
- Login / me / terms / password flows
- Client dashboard KPIs, fleet snapshot, assets, alerts
- Admin dashboard, tenants, users
- HTML/CSS/JS shells for `/app` and `/admin`

## Still being ported (same APIs, same DB)

Full Wialon live map, fuel intelligence, surveillance video, workshop CRUD, webhooks, sync cron — controllers are stubbed or partial; Node reference remains under `backend/` / `frontend/` while PHP modules expand.

## Local test (optional)

```bash
cd site
php -S 127.0.0.1:8080
# open http://127.0.0.1:8080/health
```
