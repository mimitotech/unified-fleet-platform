#!/usr/bin/env bash
# One-command local setup for unified-fleet-platform
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Unified Fleet Platform setup"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

# Check Docker
if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    echo "==> Starting Postgres + Redis via Docker..."
    docker compose up -d postgres redis
  else
    echo ""
    echo "ERROR: Docker is installed but Docker Desktop is not running."
    echo "       Open Docker Desktop from Applications, wait until it is Running,"
    echo "       then run this script again:  bash scripts/setup.sh"
    echo ""
    exit 1
  fi
else
  echo ""
  echo "ERROR: Docker not found."
  echo "       Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  echo "       Or install Postgres via Homebrew (see README.md)."
  echo ""
  exit 1
fi

echo "==> Waiting for Postgres..."
node --import tsx scripts/wait-for-postgres.mts

echo "==> Building shared package..."
npm run build -w @ufp/shared

echo "==> Running migrations + seed..."
npm run db:migrate

echo ""
echo "Setup complete. Start dev servers with:"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:5173"
echo "Login: demo@mimito.ug / demo123  (tenant slug: demo)"
