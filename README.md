# Unified Fleet Platform / MAMS

PHP + HTML + CSS + JavaScript on Apache (StackCP). Same MySQL database and domain as the former Node stack (archived under `legacy/`).

## Layout (document root = clone root)

```
repos/mams/                 ← Git clone AND domain document root
  index.php                 ← pages + /health
  .htaccess
  .env                      ← create on server (not in git)
  bootstrap.php
  api/                      ← JSON API (/api/*)
  assets/                   ← css, js, images
  lib/                      ← PHP core
  views/                    ← HTML templates
  uploads/
  database/                 ← SQL schema reference
  deploy/                   ← deploy docs
  legacy/                   ← old Node/React app (reference only, not served)
```

## What works now

### Client portal (`/app/*`)
Dashboard, monitoring (Leaflet map), alerts (acknowledge), fuel (+ KPIs/trends), workshop, drivers (CRUD), routes + trips, trailers, geofencing (CRUD), emissions, sensors, commands history, reports data, tenant users, settings + integrations status.

### Admin console (`/admin/*`)
Dashboard, clients (search, create, status, detail/modules/integrations), client users (activate/reset password), system users, system health/settings/audit, marketplace enable/disable, Wialon/LocoNav/TrackSolid hubs (per-tenant integration status from DB).

### Still PHP/DB-only (live telematics pending)
Remote command send, live video streams, and full Wialon/LocoNav/TrackSolid credential sync / device trees need the live provider HTTP clients (see `legacy/backend`). Fleet data already synced into MySQL is fully readable.

## Production

| Setting | Value |
|---------|--------|
| Domain | https://mams.mimitotracking.co.ug |
| GitHub | https://github.com/mimitotech/unified-fleet-platform.git |
| Document root | `repos/mams` |
| PHP | 8.1+ |
| Database | `mamsdb-35303030746b` / user `nsamba` |
| Branch | `master` |

Guide: [`deploy/PHP_SITE_DEPLOY.md`](deploy/PHP_SITE_DEPLOY.md)

## Local

```bash
cp .env.example .env   # set DB_*
# Point a local PHP 8.1+ vhost at this folder, or:
php -S 127.0.0.1:8080
```
