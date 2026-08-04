#!/bin/bash
# StackCP / cPanel Git Version Control — Deployment Script
# Dist folders are committed in git. This script installs runtime deps
# and refreshes the build when Node 22+ is available.
set -euo pipefail

APP="/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams"
cd "$APP"

export PATH="/opt/alt/alt-nodejs22/root/usr/bin:/usr/local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH"

for candidate in \
  "$HOME/nodevenv/mams.mimitotracking.co.ug"/*/bin/activate \
  "$HOME/nodevenv/"*/bin/activate
do
  if [ -f "$candidate" ]; then
    # shellcheck disable=SC1090
    source "$candidate" || true
    break
  fi
done

if [ -d "$HOME/.nvm/versions/node" ]; then
  for d in "$HOME/.nvm/versions/node"/v22*; do
    if [ -x "$d/bin/node" ]; then
      export PATH="$d/bin:$PATH"
      break
    fi
  done
fi

echo "[cpanel-deploy] cwd=$(pwd)"
echo "[cpanel-deploy] node=$(command -v node || true) $(node -v 2>/dev/null || echo MISSING)"
echo "[cpanel-deploy] npm=$(command -v npm || true) $(npm -v 2>/dev/null || echo MISSING)"

if ! command -v node >/dev/null 2>&1; then
  echo "[cpanel-deploy] FATAL: Node not on PATH."
  exit 1
fi

if [ ! -f .env ]; then
  echo "[cpanel-deploy] WARNING: .env missing — create it with PORT=3000 and DB_*"
fi

echo "[cpanel-deploy] Installing dependencies…"
rm -rf node_modules
npm install --legacy-peer-deps --omit=dev || npm install --legacy-peer-deps

MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "$MAJOR" -ge 22 ]; then
  echo "[cpanel-deploy] Node 22+ — refreshing build…"
  npm install @esbuild/linux-x64 @rollup/rollup-linux-x64-gnu --no-save --legacy-peer-deps || true
  npm run build || echo "[cpanel-deploy] WARNING: build failed — using committed dist/ if present"
else
  echo "[cpanel-deploy] Node $(node -v) < 22 — skipping rebuild; using committed dist/"
fi

mkdir -p tmp uploads
touch tmp/restart.txt

test -f hostinger-start.mjs
test -f backend/dist/index.js
test -f frontend/dist/index.html

echo "[cpanel-deploy] OK — backend/dist + frontend/dist ready"
