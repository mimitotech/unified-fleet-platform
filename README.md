# Unified Fleet Platform

Multi-tenant fleet management unifying **Wialon**, **LocoNav**, and **TrackSolid Pro**.

## Prerequisites

1. **Node.js 18+** and npm
2. **Docker Desktop** installed and **running** (whale icon in menu bar — must say "Running")

Without Docker running, Postgres will not start and the API will fail with `ECONNREFUSED`.

## Quick start (copy each line separately)

```bash
cd /Users/mimac/unified-fleet-platform
npm install
bash scripts/setup.sh
npm run dev
```

`setup.sh` will:
- Create `.env` if missing
- Start Postgres + Redis in Docker
- Wait for Postgres to be ready
- Run migrations and seed demo users

Then open:
- **Frontend:** http://localhost:5173
- **API:** http://localhost:3000/health

### Login

| Role | Email | Password | Tenant slug (on login form) |
|------|-------|----------|----------------------------|
| Tenant admin | demo@mimito.ug | demo123 | demo |
| Platform admin | admin@ufp.local | admin123 | demo (or any) |

## Troubleshooting

### `docker.sock: connect: no such file or directory`

**Docker Desktop is not running.** Open it from Applications → Docker, wait until it shows **Running**, then run:

```bash
bash scripts/setup.sh
```

### `ECONNREFUSED` on port 5432

Postgres is not up yet. Either Docker isn't running (see above), or containers need starting:

```bash
docker compose up -d postgres redis
node --import tsx scripts/wait-for-postgres.mts
npm run db:migrate
```

### `zsh: command not found: #`

You pasted comment lines from the README. Only run the actual commands, not lines starting with `#`.

### `cp: optional is not a directory`

Run this instead of a line with inline comments:

```bash
cp .env.example .env
```

### Frontend works but API errors

The backend needs Postgres. Run `bash scripts/setup.sh` first, then `npm run dev`.

## Manual commands

```bash
docker compose up -d postgres redis
npm run db:migrate
npm run dev
```

## Structure

```
unified-fleet-platform/
├── packages/shared/   # Shared TypeScript types
├── backend/           # Express API + adapters + orchestrators
├── frontend/          # Vite React SPA (admin + client)
├── migrations/        # Postgres schema
└── scripts/           # setup.sh, seed-db.sh, create-tenant.sh
```

## Docs

- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [API.md](docs/API.md)
