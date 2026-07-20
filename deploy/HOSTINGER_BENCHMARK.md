# MAMS vs HomeBridge+ — Hostinger benchmark

HomeBridge+ deploys successfully on the **same Hostinger Node account** (`u454222977_*`).  
This document compares patterns so MAMS can follow what already works — without rewriting fleet modules.

## Side-by-side

| Setting | HomeBridge+ (works) | MAMS (before alignment) | MAMS (aligned) |
|---------|---------------------|-------------------------|----------------|
| **Root directory** | `platform` | `./` | `./` *(repo layout differs; both OK)* |
| **Entry file** | `hostinger-start.mjs` | `backend/dist/index.js` | **`hostinger-start.mjs`** |
| **Build command** | `NPM_CONFIG_PRODUCTION=false npm ci && npm run build:hostinger` | `npm install && npm run build` | **`NPM_CONFIG_PRODUCTION=false npm ci && npm run build:hostinger`** |
| **Output directory** | *(empty)* | *(empty)* | *(empty)* |
| **Runtime** | Plain `node` + bundled `hostinger-server.mjs` | `tsc` + `vite` via `.bin` (EACCES) | **`node scripts/hostinger-build.mjs`** (no `.bin`) |
| **Early PORT bind** | Yes (Passenger) | No | **Yes** (`__mamsAttach`) |
| **MySQL host** | `127.0.0.1` | `localhost` | **`127.0.0.1`** |
| **DB env vars** | `MYSQL_*` | `DB_*` | **Both supported** |
| **Frontend** | Next.js build + static | Vite → `frontend/dist` | Same (required for React) |
| **API** | esbuild bundle | Express `tsc` compile | `tsc` via `node` (phase 2: esbuild bundle) |

## What HomeBridge+ does right (and we adopted)

1. **Dedicated Hostinger entry** — `hostinger-start.mjs` is plain JavaScript, never TypeScript at runtime.
2. **Early HTTP listen** — Port opens before MySQL / heavy startup (Hostinger Passenger timeout).
3. **`127.0.0.1` not `localhost`** — Avoids IPv6 `::1` MySQL auth failures on shared hosting.
4. **`NPM_CONFIG_PRODUCTION=false npm ci`** — Installs devDependencies needed to build (TypeScript, Vite).
5. **Empty output directory** — Node app, not static-only hosting.
6. **Build script invokes tools via `node`** — Not `node_modules/.bin/tsc` (permission denied on Hostinger).

## What we are NOT changing (protect the fleet system)

- All module routes, dashboards, Wialon sync, fuel logic — **unchanged**
- Monorepo layout (`backend/`, `frontend/`, `packages/`) — **unchanged**
- MySQL schema and query layer — **unchanged**
- No forced move into a `platform/` subfolder (would break paths and risk regressions)

## Hostinger settings (use these)

| Field | Value |
|--------|--------|
| Root directory | `./` |
| Node | `22.x` |
| Build command | `NPM_CONFIG_PRODUCTION=false npm ci && npm run build:hostinger` |
| Output directory | *(empty)* |
| Entry file | **`hostinger-start.mjs`** |

## Environment variables

Same as `deploy/hostinger.env.example`, with:

- `DB_HOST=127.0.0.1` (not `localhost`)
- `DATABASE_URL` password URL-encoded (`@` → `%40`)

## Future phase (optional, like HomeBridge bundle)

HomeBridge bundles API into one `hostinger-server.mjs` with esbuild.  
MAMS can add `scripts/bundle-hostinger-server.mjs` later to remove `tsc` from the build path entirely.  
Not required for first successful deploy if `hostinger-build.mjs` passes.

## Reference

Local HomeBridge+ project: `/Users/mimac/HomeBridge+/platform/HOSTINGER-DEPLOY.md`
