# Git Deployment Script (StackCP)

On **Git Version Control → Managing mams → Basic Information**, put this in **Deployment Script**.

That field is what runs when you click **Deploy**. It installs dependencies and builds the app.

---

## Paste this (recommended — short)

```bash
/bin/bash /home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams/scripts/cpanel-deploy.sh
```

Or, if Deploy already runs inside the repo folder:

```bash
/bin/bash scripts/cpanel-deploy.sh
```

---

## Or paste the full script

If the short form fails (script not found until after Pull), paste this entire block into **Deployment Script**:

```bash
#!/bin/bash
set -euo pipefail

APP="/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams"
cd "$APP"

export PATH="/opt/alt/alt-nodejs22/root/usr/bin:/usr/local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

for candidate in \
  "$HOME/nodevenv/mams.mimitotracking.co.ug"/*/bin/activate \
  "$HOME/nodevenv/"*/bin/activate
do
  if [ -f "$candidate" ]; then
    source "$candidate" || true
    break
  fi
done

echo "[cpanel-deploy] node=$(command -v node || true) $(node -v 2>/dev/null || echo MISSING)"

if ! command -v node >/dev/null 2>&1; then
  echo "FATAL: Node not found — need Node 22+"
  exit 1
fi

MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$MAJOR" -lt 22 ]; then
  echo "FATAL: need Node 22+, found $(node -v)"
  exit 1
fi

rm -rf node_modules
npm install --legacy-peer-deps
npm install @esbuild/linux-x64 @rollup/rollup-linux-x64-gnu --no-save --legacy-peer-deps || true
npm run build

mkdir -p tmp uploads
touch tmp/restart.txt
test -f backend/dist/index.js
test -f frontend/dist/index.html
echo "[cpanel-deploy] OK"
```

---

## Other fields on that page

| Field | Value |
|-------|--------|
| Repository Path | `/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams` |
| Repository Name | `mams` |
| Deployment Branch | `master` |
| Remote Url | `https://github.com/mimitotech/unified-fleet-platform.git` |
| Deployment Script | (paste above) |

## Before first Deploy

1. Create **`.env`** in `repos/mams` (see [GITHUB_RECONNECT.md](./GITHUB_RECONNECT.md))
2. Pull latest `master` so `scripts/cpanel-deploy.sh` exists
3. Click **Deploy**
4. Ask Elmot for **Node 22** if Deploy says Node 16 / FATAL need Node 22+
