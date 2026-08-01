#!/bin/bash
# One-shot install+build for 20i / StackCP Scheduled Tasks.
set -euo pipefail
cd /home/virtual/vps-e05b3d/2/27d5d7288d/repos/mams
export PATH="/usr/local/bin:/opt/alt/alt-nodejs22/root/usr/bin:/opt/alt/alt-nodejs20/root/usr/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin:$PATH"
{
  echo "==== $(date -Is) ===="
  echo "cwd=$(pwd)"
  command -v node || true
  node -v || true
  command -v npm || true
  npm -v || true
  npm install --legacy-peer-deps --ignore-scripts
  npm run build
  test -f backend/dist/index.js
  test -f frontend/dist/index.html
  echo "BUILD_OK"
} >> build.log 2>&1
