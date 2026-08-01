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

## D. Build & run (20i Node.js Application Registration)

20i discovers apps that have **both** in the document root (`repos/mams`):

1. `.env` with `PORT=3000`
2. `ecosystem.config.js` (already in the repo)

### Steps

1. Git Version Control → **Pull** latest `master` into `repos/mams`
2. In File Manager, confirm these exist in `repos/mams`:
   - `ecosystem.config.js`
   - `hostinger-start.mjs`
   - `.env` (create from `.env.example` — must include `PORT=3000`)
3. In StackCP / My20i open **Node.js Application Registration**
4. Click **Discover applications**
5. Register **mams** when listed

### First-time install/build

Before (or right after) discovery, dependencies must be installed once. Prefer SSH when Elmot fixes it:

```bash
cd /home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams
npm install --legacy-peer-deps --ignore-scripts
npm run build
```

Or ask Elmot/support to run those two commands in `repos/mams`, then Rediscover.

`npm start` runs `node hostinger-start.mjs` (see `package.json`).


## E. Checklist

- [ ] Domain document root = clone root (has `hostinger-start.mjs`)
- [ ] `.env` present with correct DB_*  
- [ ] Live SQL imported  
- [ ] Node 22 build + start  
- [ ] https://mams.mimitotracking.co.ug/health responds  
