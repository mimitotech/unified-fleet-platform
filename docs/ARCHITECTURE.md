# Architecture

## Overview

Unified Fleet Platform is a multi-tenant monorepo that aggregates fleet data from three external systems:

| Source | Role |
|--------|------|
| Wialon | GPS, fuel, trips |
| LocoNav | Video surveillance, camera alerts |
| TrackSolid Pro | GPS + video (stub adapter) |

## Layers

```
frontend (Vite React)
    → Express API (/api/*)
        → Orchestrators (Asset, Alert, Dashboard)
            → Adapters (Wialon, LocoNav, TrackSolid)
            → Postgres + Redis
```

## Multi-tenancy

- Each **tenant** has encrypted **data_sources** credentials
- **asset_mappings** links canonical assets to external IDs per source
- **tenant_modules** controls which sidebar modules are enabled
- Client requests send `X-Tenant-Slug` header (set at login)

## Key files

| Area | Path |
|------|------|
| Adapters | `backend/src/adapters/` |
| Asset unification | `backend/src/orchestrators/AssetOrchestrator.ts` |
| Webhooks | `backend/src/services/WebhookHandler.ts` |
| Dynamic sidebar | `frontend/src/components/app/DynamicSidebar.tsx` |
| Shared types | `packages/shared/src/` |

## Status priority (GPS)

`wialon` > `tracksolid` > `loconav`

## Deferred (v2)

- Full MAMS page ports (fuel, routes, workshop, reports)
- Email/SMS notifications
- Kubernetes / Terraform
