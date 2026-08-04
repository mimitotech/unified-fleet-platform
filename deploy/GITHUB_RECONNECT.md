# Reconnect MAMS with GitHub (StackCP)

Standard layout: **Git clone root = app root = document root**.

```
/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams/
  hostinger-start.mjs      ← entry
  package.json
  ecosystem.config.js      ← Node discovery (in repo)
  .env                     ← you create on server (not in git)
  backend/
  frontend/
  packages/
  .cpanel.yml              ← runs build after pull
```

**Repo:** https://github.com/mimitotech/unified-fleet-platform.git  
**Branch:** `master`

---

## Step 1 — Prepare the folder on StackCP

1. **File Manager** → go to account root
2. If old clones exist, either **delete** `repos/mams` contents or use a fresh empty folder
3. **Manage Domains** → `mams.mimitotracking.co.ug` → set **Document Root**:

```
repos/mams
```

Full path:

```
/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams
```

---

## Step 2 — Clone from GitHub

**Git Version Control** → **Clone**:

| Field | Value |
|-------|--------|
| **Clone URL** | `https://github.com/mimitotech/unified-fleet-platform.git` |
| **Repository Path** | `repos/mams` |
| **Repository Name** | `mams` |

If clone fails (“directory not empty”), empty `repos/mams` first, then clone again.

After clone, File Manager → `repos/mams` must show:

- `hostinger-start.mjs`
- `package.json`
- `ecosystem.config.js`
- `backend/`, `frontend/`

---

## Step 3 — Create `.env` on the server

In File Manager → `repos/mams` → **New File** → `.env`

Paste (adjust JWT if you use different secrets):

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nsamba
DB_PASSWORD=Mimito@123
DB_NAME=mamsdb-35303030746b

API_PUBLIC_URL=https://mams.mimitotracking.co.ug
FRONTEND_URL=https://mams.mimitotracking.co.ug
VITE_API_URL=

JWT_SECRET=8f905f233b59625107bdaab8c1edc083f6ce9e60543450a0ff1982d81ddd4db0
ENCRYPTION_KEY=3c339ed094c4cfcfe44fd6b0c0c8726e

UPLOAD_DIR=uploads
FRONTEND_DIST=frontend/dist
REDIS_DISABLED=1
```

**`PORT=3000` is required** for Node.js Application Registration.

---

## Step 4 — Database

Import your live SQL dump into **`mamsdb-35303030746b`** (phpMyAdmin, user **`nsamba`**).

---

## Step 5 — Build on the server

After clone (or each **Pull** / **Deploy**), the app must be built.

**Option A — Git Deploy button** (uses `.cpanel.yml` in the repo):

Git Version Control → `mams` → **Pull** → **Deploy**

**Option B — Scheduled Task** (if Deploy fails — npm not on PATH):

```bash
/bin/bash /home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams/scripts/stackcp-build.sh
```

**Option C — Ask Elmot** to run once in `repos/mams`:

```bash
npm install --legacy-peer-deps --ignore-scripts
npm run build
```

Success = these files exist:

- `backend/dist/index.js`
- `frontend/dist/index.html`
- `node_modules/`

---

## Step 6 — Register Node app (20i)

Requirements (both in `repos/mams/`):

1. `.env` with `PORT=3000`
2. `ecosystem.config.js` (already in repo)

1. **Node.js Application Registration**
2. Unregister any old app pointing at `mamsmain` or wrong path
3. **Discover applications** → wait 2–5 min
4. Register **`mams`**

See also: [NODEJS_REGISTRATION.md](./NODEJS_REGISTRATION.md)

---

## Step 7 — Verify

- https://mams.mimitotracking.co.ug/health → `"database": "connected"`
- https://mams.mimitotracking.co.ug → login page

---

## Updating after code changes

1. Push to GitHub `master` from your Mac
2. StackCP → Git Version Control → **Pull** → **Deploy**
3. **Rediscover** / restart **`mams`** if needed

---

## Local Mac (development)

Unchanged:

```bash
npm install
npm run dev
```

Production build test locally:

```bash
npm run build
node hostinger-start.mjs
```

---

## Alternative: manual zip upload

If Git build on server keeps failing, see [MAMSMAIN_DEPLOY.md](./MAMSMAIN_DEPLOY.md) (`npm run build:deploy`).
