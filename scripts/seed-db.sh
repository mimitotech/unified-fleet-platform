#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod +x scripts/*.sh 2>/dev/null || true

echo "Building shared package..."
npm run build -w @ufp/shared 2>/dev/null || (npm install && npm run build -w @ufp/shared)

echo "Seeding via Node..."
node --import tsx "$ROOT/scripts/seed-demo.mts"
