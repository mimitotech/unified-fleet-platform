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
  .cpanel.yml              ← runs build after Pull → Deploy
```

**Repo:** https://github.com/mimitotech/unified-fleet-platform.git  
**Branch:** `master`

---

## What was broken (Elmot log)

| Issue | Meaning |
|-------|---------|
| `node=v16.20.2` | Too old — app needs **Node 22+** |
| `DB_USER=(unset)` | **`.env` missing** in `repos/mams` |
| `backend/dist/index.js missing` | Build never completed |
| `Cannot find module @rollup/rollup-linux-x64-gnu` | `npm install --ignore-scripts` skipped Linux binaries |

Git SSH keys are only for **cloning/pulling** from GitHub. They are unrelated to the build/rollup error.

---

## Step 1 — Document root

**Manage Domains** → `mams.mimitotracking.co.ug` → Document Root:

```
repos/mams
```

---

## Step 2 — Git already connected?

Your path is correct:

```
/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams
```

**Basic Information:**

| Field | Value |
|-------|--------|
| Repository Path | `/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams` |
| Repository Name | `mams` |
| Deployment Branch | `master` |
| Remote Url | `https://github.com/mimitotech/unified-fleet-platform.git` (or SSH equivalent) |
| Deployment Script | leave empty — use repo `.cpanel.yml` |

Then: **Pull** latest `master` → **Deploy**.

---

## Step 3 — Create `.env` on the server (required)

File Manager → `repos/mams` → New File → **`.env`**

```env
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nsamba
DB_PASSWORD=Mimito@@2026
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

`PORT=3000` is required for Node.js Application Registration.  
MySQL login uses **user** `nsamba` + password **`Mimito@@2026`**.

---

## Step 4 — Ask Elmot for Node 22 (copy-paste)

> Thank you for installing Node and PM2.
>
> Our app requires **Node.js 22+** (engines field). The shell currently runs **v16.20.2**, which cannot build this project.
>
> Please set the default Node for this account / `repos/mams` to **22.x**, then run:
>
> ```bash
> cd /home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams
> /bin/bash scripts/stackcp-build.sh
> # or:
> rm -rf node_modules
> npm install --legacy-peer-deps
> npm install @esbuild/linux-x64 @rollup/rollup-linux-x64-gnu --no-save --legacy-peer-deps
> npm run build
> npm start
> ```
>
> Do **not** use `npm install --ignore-scripts` — that caused the missing `@rollup/rollup-linux-x64-gnu` error.
>
> Confirm `.env` exists in `repos/mams` with `PORT=3000` and DB settings before `npm start`.

---

## Step 5 — Build

After Node 22 is default and `.env` exists:

1. Git → **Pull** → **Deploy** (runs `.cpanel.yml`), **or**
2. Elmot runs `scripts/stackcp-build.sh`

Success when these exist:

- `backend/dist/index.js`
- `frontend/dist/index.html`
- `build.log` ends with `BUILD_OK` (if using stackcp-build.sh)

---

## Step 6 — Register Node app

1. `.env` with `PORT=3000` in `repos/mams`
2. `ecosystem.config.js` already in repo (`cwd` = full `repos/mams` path)
3. **Node.js Application Registration** → Discover → register **`mams`**

---

## Step 7 — Verify

- https://mams.mimitotracking.co.ug/health → `"database":"connected"`
- https://mams.mimitotracking.co.ug → login

---

## Security note

If you pasted the StackCP **RSA private key** into chat or email, regenerate SSH keys in Git Version Control and update GitHub deploy keys. Treat that private key as compromised.
