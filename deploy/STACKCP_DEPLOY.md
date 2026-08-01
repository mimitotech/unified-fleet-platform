# Deploy MAMS on StackCP → mams.mimitotracking.co.ug

**Live domain:** https://mams.mimitotracking.co.ug  
**Repo:** https://github.com/mimitotech/unified-fleet-platform (branch `master`)  
**Layout:** clone root = app root = document root

## A. Clone into the domain folder

Git Version Control → Clone:

| Field | Value |
|-------|--------|
| **Clone Url** | `https://github.com/mimitotech/unified-fleet-platform.git` |
| **Repository Path** | `repos/mams` (or empty the subdomain folder and use that name) |
| **Repository Name** | `mams` |

Manage Domains → `mams.mimitotracking.co.ug` document root:

```
repos/mams
```

Full path example:

```
/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams
```

That folder must contain `hostinger-start.mjs` at the top level (no nested `platform/`).

## B. Environment

Create `.env` in the clone root from `.env.example`:

```
DB_HOST=127.0.0.1
DB_USER=nsamba
DB_PASSWORD=…
DB_NAME=mamsdb-35303030746b
API_PUBLIC_URL=https://mams.mimitotracking.co.ug
FRONTEND_URL=https://mams.mimitotracking.co.ug
```

## C. Database

Import your live dump into `mamsdb-35303030746b` (phpMyAdmin).

## D. Build & run

Needs **Node 22** on the host (VPS / Node selector / PM2):

```bash
cd /home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams
npm install --legacy-peer-deps --ignore-scripts
npm run build
node hostinger-start.mjs
```

Or enable automatic deploy via `.cpanel.yml` after Pull in Git Version Control.

## E. Checklist

- [ ] Domain document root = clone root (has `hostinger-start.mjs`)
- [ ] `.env` present with correct DB_*  
- [ ] Live SQL imported  
- [ ] Node 22 build + start  
- [ ] https://mams.mimitotracking.co.ug/health responds  
