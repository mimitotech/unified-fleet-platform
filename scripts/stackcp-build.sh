#!/bin/bash
# One-shot clean install + build for StackCP (Elmot / 20i).
# Fixes missing @rollup/@esbuild Linux binaries and requires Node 22+.
set -euo pipefail

APP="/home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams"
cd "$APP"

export PATH="/opt/alt/alt-nodejs22/root/usr/bin:/usr/local/bin:/opt/alt/alt-nodejs20/root/usr/bin:$PATH"
# Prefer any nvm Node 22 if present
if [ -d "$HOME/.nvm/versions/node" ]; then
  for d in "$HOME/.nvm/versions/node"/v22*; do
    if [ -x "$d/bin/node" ]; then
      export PATH="$d/bin:$PATH"
      break
    fi
  done
fi

{
  echo "==== $(date -Is) ===="
  echo "cwd=$(pwd)"
  command -v node || true
  node -v || true
  command -v npm || true
  npm -v || true

  MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if [ "$MAJOR" -lt 22 ]; then
    echo "FATAL: Node 22+ required, found $(node -v 2>/dev/null || echo missing)"
    echo "Ask Elmot to set default Node to 22.x for this account, then re-run."
    exit 1
  fi

  if [ ! -f .env ]; then
    echo "WARNING: .env missing — create it before npm start (PORT=3000 + DB_*)"
  fi

  # Clean install so Linux optional binaries are present
  rm -rf node_modules
  npm install --legacy-peer-deps
  # Explicit platform packages (npm optionalDeps bug workaround)
  npm install @esbuild/linux-x64 @rollup/rollup-linux-x64-gnu --no-save --legacy-peer-deps || true
  npm run build

  test -f backend/dist/index.js
  test -f frontend/dist/index.html
  echo "BUILD_OK"
} >> build.log 2>&1
