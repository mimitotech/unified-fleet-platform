# MAMS vs HomeBridge+ — Hostinger layout

Both apps now use the **same Hostinger root pattern**.

| Setting | HomeBridge+ | MAMS |
|---------|-------------|------|
| **Root directory** | `platform` | **`platform`** |
| **Entry file** | `hostinger-start.mjs` | **`hostinger-start.mjs`** |
| **Build command** | dropdown / `npm run build:hostinger` | **`npm run build`** |
| **Output directory** | empty | empty |
| MySQL host | `127.0.0.1` | `127.0.0.1` |

## Repo layout

```
unified-fleet-platform/          (GitHub repo root)
  package.json                   (thin wrapper — do NOT set Hostinger root here)
  platform/                      ← Hostinger Root directory
    package.json
    hostinger-start.mjs
    backend/
    frontend/
    packages/
    scripts/hostinger-build.mjs
    database/mysql/
    deploy/
```

Modules, dashboards, and API stay under `platform/` — Hostinger only sees that folder.
