# MAMS / Unified Fleet Platform — Complete System Reproduction Spec

**Start here if you are new:** read [`SYSTEM-COMPLETE-GUIDE.md`](./SYSTEM-COMPLETE-GUIDE.md) first — it explains from zero how connections, data sources, and APIs work in plain language.  
Use **this** file as the structured checklist of modules, layouts, branding tokens, and file paths.

**Purpose:** Hand this document to another agent/engineer to reproduce a **100% functionally and visually equivalent** system.  
**Canonical repo:** `git@github.com:nsambamarvin2001/unified-fleet-platform.git` (branch `master`).  
**Product name:** **MAMS** — Mimito Asset Management System.  
**Do not** treat the org repo `mimitotech/unified-fleet-platform` as the source of truth unless the owner says otherwise.

This document describes architecture, branding, admin UI, client UI, every module, integrations, reports/charts, design tokens, positioning, wiring, and behavioral rules. Prefer reading the cited paths in the repo when implementing.

---

## 0. Non‑negotiable product rules

1. **Platform brand (public):** Login, landing, and any unauthenticated page MUST always show **MAMS** colors/logo (`#004225`). Never leak a previous client’s theme onto login/landing after logout or session expiry.
2. **Client brand (authenticated `/app`):** After login, tenant `primaryColor` / `secondaryColor` / `accentColor` / logo / favicon / `customCss` apply only under `/app` (and optionally `/admin` uses MAMS chrome, not tenant client colors).
3. **Client-facing copy:** Prefer not to push the word “Wialon” in client UI; say “fleet”, “live”, “Hosting” only where the user explicitly wants a Hosting link (login has “Open Wialon Hosting”).
4. **Bowsers / fuel tankers:** Stay classified with **Generators / stationary fuel**, not vehicles. Fuel drops from bowsers = dispensed, not theft.
5. **Alerts tabs (client):** `Inbox` · `Alert types` · `Reports` — Alert types = configured notification rules for that client account (from telematics), not fired events.
6. **Generator workshop checklists:** One normal inspection form with two sections: Daily inspection + Monthly preventive maintenance (UBFC-derived items). Not separate form types.
7. **Production DB:** MySQL on Hostinger. Redis disabled on Hostinger (`REDIS_DISABLED=1`).

---

## 1. Repository & deploy topology

```
unified-fleet-platform/
├── package.json                 # thin wrapper → platform/
├── platform/                    # Hostinger Root directory
│   ├── hostinger-start.mjs      # Entry file (Passenger)
│   ├── package.json             # npm workspaces: backend, frontend, packages/shared
│   ├── backend/                 # Express 5 + TypeScript API
│   ├── frontend/                # Vite 6 + React 18 SPA
│   ├── packages/shared/         # @ufp/shared
│   ├── database/mysql/          # ufp_complete_schema.sql + patches
│   ├── deploy/                  # hostinger.env.example, HOSTINGER_DEPLOY.md
│   └── scripts/hostinger-build.mjs
└── docs/
```

| Hostinger setting | Value |
|-------------------|--------|
| Root directory | `platform` |
| Node | 22.x |
| Build | `npm run build` → `scripts/hostinger-build.mjs` |
| Entry | `hostinger-start.mjs` |
| Output dir | empty (Express serves `frontend/dist`) |

Build order: chmod `.bin` → build shared → `vite build` frontend → `tsc` backend.

Same-origin production: `VITE_API_URL=` empty; Express serves SPA + `/api` + `/uploads`.

---

## 2. Tech stack (must match)

### Frontend (`platform/frontend`)
- React 18, Vite 6, TypeScript
- react-router-dom 6
- TanStack React Query
- Tailwind 3 + `tailwindcss-animate`
- shadcn/ui (Radix primitives) under `src/components/ui/*`
- lucide-react icons
- Leaflet / react-leaflet (+ Google Mutant where used) for maps
- Recharts for charts
- sonner toasts
- react-hook-form where forms need it
- Path alias `@/` → `src/`

### Backend (`platform/backend`)
- Node ≥22, Express 5, TypeScript (`tsx` in dev)
- mysql2 (production)
- JWT HS256 (`jsonwebtoken`), bcryptjs
- zod validation
- node-cron (`SyncScheduler`)
- helmet, cors, compression
- Optional Redis (disabled on Hostinger)

### Shared
- `@ufp/shared` workspace package

---

## 3. Branding system (exact)

### Platform constants — `platform/frontend/src/lib/branding.ts`
| Token | Value |
|-------|--------|
| name | `MAMS` |
| fullName | `Mimito Asset Management System` |
| primary | `#004225` |
| primaryDark | `#003018` |
| secondary | `#0f172a` |
| accent | `#1a6b45` |
| logo | `/mams-logo.png` (fallback `/mams-logo.svg`) |
| favicon | `/favicon.ico` |
| landingMap | `/gp.png` |
| landingGps | `/gps.jpg` |
| pageTint | `#f7faf8` |
| surfaceTint | `#eef6f1` |

Public assets live in `platform/frontend/public/`.

### Tenant branding fields (DB + admin Branding tab)
`primaryColor`, `secondaryColor`, `accentColor`, `logoUrl`, `faviconUrl`, `customCss`

Applied via:
- `lib/tenantBranding.ts` → `applyTenantThemeVars` (CSS vars on `document.documentElement`)
- `lib/tenantBrandingCache.ts` → localStorage cache + `#tenant-custom-css`
- `ThemeProvider` only inside authenticated app shell
- `resetToPlatformBranding()` on login/landing/logout/auth failure
- `hydrateTenantThemeFromCache()` only when token+slug and path starts with `/app` or `/admin`

### CSS vars set for tenants
`--primary`, `--primary-foreground`, `--secondary`, `--accent`, `--ring`, sidebar-* vars, `--fleet-primary`, `--fleet-primary-light`, `--gradient-primary`, `--brand-primary`, `--brand-secondary`, `--brand-accent`, `--brand-primary-soft`, `--brand-border`

### Design utility classes — `styles/globals.css`
- `.tenant-app` — root of client shell
- `.branded-tabs` — tab list with primary border; active tab = solid primary
- `.branded-panel` — panel with **3px primary top bar**
- `.fleet-card`, `.fleet-card-hover`
- `.stat-strip`, `.stat-strip-4`
- `.branded-number`, `.branded-border`
- Fuel: `.fuel-page`, `.fuel-kpi-grid`, `.fuel-section`
- Monitoring: `.monitoring-workspace*`
- Status text: `.text-status-moving` etc.

### Design principles
- Client chrome uses tenant primary heavily (sidebar, tabs, panel top bars, header bottom border).
- Cards are restrained; prefer `branded-panel` / flat sections over heavy shadow stacks.
- Live pulse indicators for connected telematics.
- Dense operational UI (tables, KPIs, filters) — not marketing layouts inside `/app`.
- Login is marketing/ops hybrid: 50/50 media | form, MAMS green full-bleed.

---

## 4. Auth, roles, tenancy

### Roles
| Role | Shell |
|------|--------|
| `super_admin` | `/admin/*` (all tenants + System Users) |
| `platform_admin` | `/admin/*` (only tenants where `assigned_manager_id = user`) |
| `tenant_admin` | `/app/*` + manage tenant users |
| `manager` / `operator` / `viewer` | `/app/*` with RBAC module limits |

System roles helper: `lib/systemRoles.ts` / backend `utils/systemRoles.ts`.

### Auth storage (browser)
- `ufp_token`, `ufp_tenant_slug`, `ufp_role`
- Requests: `Authorization: Bearer …`, `X-Tenant-Slug: …`

### Flows
1. `POST /api/auth/login` → JWT 24h + `tenantSlug` + `termsAcceptedAt`
2. If no terms → `/auth/terms?next=…`
3. System → `/admin/dashboard`; else → `/app/dashboard`
4. Forgot password: in-login multi-step (`forgot-email` → `forgot-reset`); token returned in API (no email required in current impl)
5. `AuthProvider` restores session via `GET /api/auth/me`

### Multi-tenant isolation
- All domain rows keyed by `tenant_id`
- Integrations in `data_sources` (encrypted)
- Modules: `module_definitions` ∩ `tenant_modules` ∩ `user_modules`
- Middleware: `auth.ts`, `tenant.ts`, `rbac.ts`, `tenantAccess.ts`

---

## 5. Application routing map

File: `platform/frontend/src/App.tsx`

### Public
| Path | Page |
|------|------|
| `/` | `Landing.tsx` |
| `/auth/login` | `Login.tsx` |
| `/auth/terms` | `TermsOfUse.tsx` |
| `/terms-of-use`, `/privacy-policy` | `LegalDocuments.tsx` |

### Client shell `AppShell` → `ThemeProvider` + `FleetProvider`
| Path | Module key | Page |
|------|------------|------|
| `/app/dashboard` | dashboard | Dashboard.tsx |
| `/app/monitoring` | monitoring | Monitoring.tsx |
| `/app/surveillance` | surveillance | Surveillance.tsx |
| `/app/drivers` | drivers | Drivers.tsx |
| `/app/routes` | routes | Routes.tsx |
| `/app/fuel` | fuel | Fuel.tsx |
| `/app/emissions` | emissions | Emissions.tsx |
| `/app/workshop` | workshop | Workshop.tsx |
| `/app/alerts` | alerts | Alerts.tsx |
| `/app/geofencing` | geofencing | Geofencing.tsx |
| `/app/commands` | commands | Commands.tsx |
| `/app/trailers` | trailers | Trailers.tsx |
| `/app/sensors` | sensors | Sensors.tsx |
| `/app/settings` | *(always)* | Settings.tsx |
| `/app/reports` | — | redirect → dashboard |

`ClientModulePage` gates enabled/visible modules.

### Admin shell `AdminShell` → `AdminLayout`
| Path | Page |
|------|------|
| `/admin/dashboard` | Dashboard.tsx |
| `/admin/tenants` | TenantsPage.tsx |
| `/admin/tenants/new` | TenantCreate.tsx |
| `/admin/tenants/:id` | TenantDetail.tsx |
| `/admin/users` | UsersPage.tsx |
| `/admin/system-users` | SystemUsersPage.tsx (super only) |
| `/admin/system` | SystemPage.tsx |
| `/admin/marketplace` | MarketplacePage.tsx |
| `/admin/wialon` | WialonCenter.tsx |
| `/admin/loconav` | LocoNavCenter.tsx |
| `/admin/tracksolid` | TrackSolidCenter.tsx |
| `/admin/support` | SupportPage.tsx |
| `/admin/account` | AccountPage.tsx |

---

## 6. Client shell layout (positioning)

File: `components/app/AppLayout.tsx` — root class `tenant-app`

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ Sidebar    │ Header (border-bottom = tenant primaryColor 2px)         │
│ (fixed)    │ [☰] TenantLogo | Tenant name · Page title/subtitle       │
│ TenantLogo │                    Live pill | Refresh | Live age | Bell | User │
│ Name/slug  ├──────────────────────────────────────────────────────────┤
│            │ Main (max-width 1600, bg-muted/30)                       │
│ Nav items  │   Page content                                           │
│ by module  │                                                          │
│ sortOrder  │                                                          │
│ + Settings │                                                          │
│            ├──────────────────────────────────────────────────────────┤
│ Powered by │ Footer (lg): tenant · “All systems connected” pulse      │
│ MAMS       │                                                          │
└────────────┴──────────────────────────────────────────────────────────┘
```

### Sidebar (`DynamicSidebar.tsx`)
- Icons from Lucide via `MODULE_ICONS` / `ICON_MAP`
- Default module order (API `sortOrder` wins): Dashboard(1), Monitoring(2), Surveillance(3), … Alerts(10), …
- Settings always last → `/app/settings`
- Active item uses sidebar primary styling
- Collapse control on desktop; overlay on mobile

### Header alert bell
- Unacknowledged alerts from last 24h
- Ack inline; link to `/app/alerts`

### Live indicators
- Integration status: Live / Partial / Offline
- Fleet snapshot age (“Live · 9s ago”)

---

## 7. Client modules — complete contents

### 7.1 Dashboard (`pages/app/Dashboard.tsx`)
**Purpose:** Period-scoped operational overview for the tenant.

**Toolbar:** Date from/to + presets; Refresh; arrange-widgets mode.

**KPI strip (MetricCards / branded panels):** Assets, Online, Utilization, Open alerts, Current/Filled/Used fuel, Fill/Use cost, Drivers, Routes, Maint. pending, Streams (module-gated).

**Charts board (Recharts compact components):** fleet mix, alerts trend/ack/severity/types, fuel series, ops/workshop/driver widgets — rearrangeable via `DashboardArrangeBoard` + prefs (`dashboardWidgetPrefs.ts`).

**Quick access:** Module tiles from `dashboardNav.ts` (monitoring, alerts, fuel, workshop, …).

**Data:** `useFleetUnits`, `useAlerts`, fuel summaries, workshop KPIs, drivers/routes stats, video streams, geofences, trips, command history, `useWialonContext`.

**Banner:** `WialonContextBanner` (errorOnly often).

---

### 7.2 Monitoring (`pages/app/Monitoring.tsx`)
**Views** (URL `?view=`): **Live Map | Fleet List | Track | Events | Reports**

| View | UI |
|------|-----|
| Live Map | `FleetMapWorkspace` + `LazyUnifiedMap` + sidebar list + `UnitDetailPanel` / `MapUnitDetailCard` |
| Fleet List | `FleetListWorkspace` / `FleetListTable` |
| Track | `FleetTrackWorkspace` / `FleetTrackMap` history playback |
| Events | `MonitoringEventsView` (alerts/events for client assets) |
| Reports | `MonitoringModuleReports` |

**Status chips:** Moving / Idle / Stopped / Offline (+ Running for generators).

**Unit detail panel:** sensors, calibrated fuel tanks, live parameters (**hidden for client roles; system roles only**), I/O, custom fields, service intervals, commands, reverse geocode.

**Map basemap bar:** OSM / other layers via `MapBasemapBar`.

---

### 7.3 Alerts (`pages/app/Alerts.tsx`)
**Tabs (exact labels):**
1. **Inbox** — fired events
2. **Alert types** — configured notification rules for this client (`WialonNotificationsPanel`)
3. **Reports** — `AlertsModuleReports`

**Inbox layout (top → bottom):**
- KPI row: Open, Open critical, Open warnings, In period
- Period presets: Today / 7d / 14d / 30d + From/To dates
- Category filters: All, Fuel, Power, Driving, Geofence, Engine, Sensors, Other…
- Status: All / Open / Acknowledged
- Bulk Ack / Ack all
- Alert rows: title · unit, type badge, source, description, relative+absolute time, Ack button

**Alert types tab:**
- KPIs: Total types, Active, Inactive
- Table: Alert type | Account/resource | Units | Times triggered | Status
- Data: `GET /api/client/wialon/notifications` via `WialonLiveService.listNotifications` (deep `core/search_item` per resource with notifications flag `1025`)
- Refresh button; must list Hosting-configured rules (e.g. FUEL FILLING ALERT, GENSET BATTERY LOW, etc.)

**Do not** bury alert types at the bottom of Inbox.

---

### 7.4 Fuel (`pages/app/Fuel.tsx`)
**Tabs:** Vehicles | Generators | Machinery (if present) | Reports | Variance (if configured)

If telematics disconnected → only connection banner.

**Per category tab (`CoreFuelTab` stack):**
- `FuelLiveStrip`
- `FuelKpiCards`
- `FuelLevelAlerts` / `FuelDrainAlerts`
- `FuelTransactionsTable`
- `FuelAssetCharts` / `FuelLevelChart` / `FuelGraphPanel` (ledger-based graphs — **not** slow raw message level-series as primary)
- `FuelCostingPanel`
- Print actions

**Classification:** Generators + bowsers/tankers together; vehicles separate. Bowser drops = dispensed.

**Reports tab:** `FuelReportsTab` — Wialon fuel report templates + charts.  
**Variance:** station sheet vs telematics (`FuelVarianceTab`).

**Admin fuel module config (TenantDetail):** selected Wialon fuel report templates, column visibility per vehicle/generator/machinery, petrol-station xlsx uploads.

---

### 7.5 Workshop (`pages/app/Workshop.tsx`)
**Tabs:** Fleet Overview | Inspections | Maintenance Jobs | Breakdowns | Costing | Reports

| Tab | Components |
|-----|------------|
| Overview | `WorkshopKpiCards`, `FleetMaintenanceTable` |
| Inspections | `InspectionTimeline` + `PreDeliveryInspectionModal` / detail |
| Maintenance | `MaintenanceLogList` + `MaintenanceLogModal` |
| Breakdowns | `BreakdownAlerts` + `BreakdownReportModal` |
| Costing | `MaintenanceCostChart`, `WorkshopCostingPanel` |
| Reports | `WorkshopReportsInline` |

**Asset categories:** `vehicle` | `generator` | `machinery`

**Generator checklist (single form, two sections)** — from UBFC docs:
1. **Daily inspection** — control panel, alarms, hours, fuel, battery, starts, oil, coolant, leaks, fuel monitoring, room clean
2. **Monthly preventive maintenance** — AMF test, fluids, radiator, fuel tank/lines, battery/charger, alternator, belts, hoses, exhaust, mounts, fasteners, dashboard, hours, noise/vibration, cleaning, spills, reservoir covers, lock doors

Vehicle checklists: truck-head + trailer/safety sections.  
Machinery: powertrain / hydraulics-structure / controls-safety.

Templates seeded in `workshop_checklist_templates` via `ensureWorkshopSchema()` on backend boot.

---

### 7.6 Drivers (`Drivers.tsx`)
Tabs: **Roster | Reports**  
KPIs: Total, Available, Driving, Off Duty  
CRUD roster; performance stats; `DriversModuleReports`

### 7.7 Routes (`Routes.tsx`)
Tabs: **Routes | Reports**  
KPIs: Total, In Progress, Scheduled, Completed  
Plan-route dialog; `WialonRoutesPanel` live; `GenericModuleReports`

### 7.8 Geofencing (`Geofencing.tsx`)
Tabs: **Zones | Reports**  
`WialonGeofencesLivePanel` + local geofence CRUD; zone cards

### 7.9 Commands (`Commands.tsx`)
Tabs: **Commands | Reports**  
Per-unit command cards (`UnitCommandsCard`, `WialonCommandButton`); history table

### 7.10 Trailers (`Trailers.tsx`)
Tabs: **Trailers | Reports**  
Registry table (asset name/plate heuristics)

### 7.11 Sensors (`Sensors.tsx`)
Tabs: **Live | Reports**  
`WialonSensorsPanel` + per-asset branded panels (speed/fuel%/engine)

### 7.12 Surveillance (`Surveillance.tsx`)
Split: unit list | detail  
Tabs: **Cameras | Live | Playback | Files | Commands | Events | Reports**  
Live grids, HLS/players, files, events, external streams, video share links

### 7.13 Emissions (`Emissions.tsx`)
Tabs: **Overview | Reports**  
KPIs: CO₂, CO₂/km, Fuel Used, Violations  
BarChart CO₂ by vehicle; eco violations list

### 7.14 Settings (`Settings.tsx`)
Tabs: **Account | Users** (Users for admins)  
Account: profile + change password  
Users: tenant user CRUD, roles, module grants, reset password

---

## 8. Admin side — complete contents

### 8.1 Admin layout
MAMS logo chrome (not client colors). Nav order:
Dashboard → Clients → Client Users → (System Users) → System → Integrations → Wialon Center → LocoNav Center → TrackSolid Center → Support → My Account

### 8.2 Admin Dashboard
Live platform KPIs: Clients, Synced assets, Users, Alerts, Sync %, Integrations %  
Charts: fleet status, alerts 24h, alert volume, sync timeline, telematics sources, health, live sync feed, top clients, activity, growth, sync failures

### 8.3 Clients (Tenants)
List/filter/bulk activate; quick create with auto slug.  
**Create wizard:** Details → Wialon account link → Review  

**TenantDetail tabs:**
`general | integrations | branding | modules | fuel-module | users | migration | backup | audit | api-keys`

| Tab | What |
|-----|------|
| general | name, slug, contact, phone, address, country, timezone, language, status, limits, assigned manager (super), Activate, portal links |
| integrations | Wialon (mother+account+users OR legacy token), LocoNav token, TrackSolid appKey/secret/account/password — Test/Sync |
| branding | primary/secondary/accent colors, logo upload+URL, favicon, custom CSS |
| modules | enable/visibility per moduleKey; apply recommended |
| fuel-module | bind Wialon fuel report templates; column defs; station sheet upload |
| users | import from Wialon; add/edit/deactivate; modules |
| migration | JSON export/import |
| backup | Backup Now + history |
| audit | activity log |
| api-keys | generate/list |

### 8.4 Client Users / System Users
Client Users: tenant-scoped roles.  
System Users (super): `platform_admin` / `super_admin`.

### 8.5 System
Tabs: **general | login | email | webhooks | backup | security**  
Login tab manages **login slides** (images for left pane) and **trust logos** (Trusted by marquee).

### 8.6 Marketplace
Toggle global integrations (`is_enabled_globally`).

### 8.7 Wialon Center
Tabs: Mother accounts | Account tree | Live | Client links  
Mothers hold shared tokens; tree links accounts to tenants.

### 8.8 LocoNav / TrackSolid Centers
Read-only connection status tables; credentials on TenantDetail.

### 8.9 Support / Account
Static help + webhook URLs; profile + password.

---

## 9. Public Landing & Login (exact UX)

### Landing (`Landing.tsx`)
- Always `resetToPlatformBranding()`
- Nav: MAMS logo + name + fullName + Sign In
- Hero: “Integrated Fleet Management”, Mimito about link, Sign In CTA, `BRAND.landingMap`, floating chips
- Feature grid (8): video, GPS, drivers, routes, workshop, fuel import, fuel monitoring, emissions
- Footer: copyright + privacy/terms

### Login (`Login.tsx`) — critical layout
```
Full viewport background #004225
┌─────────────────────┬───┬─────────────────────────┐
│ LEFT 50% (md+)      │3px│ RIGHT 50%               │
│ Slideshow images    │div│ Fleet animated backdrop │
│ object-contain      │   │ White form card         │
│ dots, ~6.5s rotate  │   │ MAMS logo + name        │
│ (no slide text on   │   │ email/password          │
│  form side)         │   │ Sign In                 │
│                     │   │ Open Wialon Hosting btn │
│                     │   │ terms · privacy links   │
└─────────────────────┴───┴─────────────────────────┘
Bottom: white “Trusted by” logo marquee (admin-managed)
```
Mobile: stacked media then form. Form uses Tailwind `primary` tokens → must be MAMS green only.

---

## 10. Integrations wiring

### Providers
1. **Wialon (primary)** — Hosting Remote API (`hst-api.wialon.com` default)
2. **LocoNav** — token/auth header
3. **TrackSolid** — appKey/secret/account/password

### Wialon credential model
```
Platform Mother Account (token)
        ↓
Tenant scoped accountId / resource + optional operateAs user
        ↓
withWialonClient / withTenantWialonClient
        ↓
Fleet, fuel reports, alerts harvest, geofences, notifications, commands, video, CRUD
```

One Wialon account must not be claimed by two tenants (`assertAccountAvailable`).

### Sync scheduler (`SyncScheduler`)
| Interval | Job |
|----------|-----|
| 5 min | Asset sync + live fuel snapshots |
| 15 min | Fuel reports → DB |
| 30 min | Domain trips/eco |
| 1 min | Alert harvest all connected tenants |

### Alert pipeline
Adapters → classify (`wialonAlertClassify`) → `AlertOrchestrator` insert → Inbox  
Also promote fuel fill/theft transactions into alerts.  
Noise filter: `isNoiseAlert` / `isNoiseAlertTitle`.

### Client Wialon API surface (high level)
`/api/client/wialon/context|fleet|units|…|fuel/*|notifications|reports/*|geofences|commands|…`  
See `routes/clientWialon.ts` for full list.

---

## 11. Reports & charts system

### Patterns
1. **Module Reports tabs** — `components/reports/moduleReportPanels.tsx` + `ModuleReportsShell` / `ReportsWorkspace`
2. **Wialon template reports** — registry `wialonReportTemplateRegistry.ts` (fuel, engineHours, trips, geofence, driver, events, emissions)
3. **Exec report** — tables + **PNG charts** via `report/get_result_chart` binary (`WialonClient.requestBinary`)
4. **Print** — DOM print with chart images; stale-chunk recovery `importPrintReport.ts`
5. **Domain reports API** — `GET /api/client/reports/types` + `/reports/data/:type`
6. **Fuel graphs** — built from report tables + fuel ledger (`fuelGraphFromReport.ts`, `FuelGraphPanel`, `FuelLevelChart`), not raw message spam

### Chart libraries
Recharts compact wrappers on Dashboard (`DashboardCharts`); Fuel uses bars/lines/composed; Emissions BarChart; Workshop cost chart.

---

## 12. Database (MySQL) — major entities

Canonical: `platform/database/mysql/ufp_complete_schema.sql`

**Core:** tenants, users, data_sources, assets, asset_mappings, asset_status, alerts  
**Access:** module_definitions, tenant_modules, user_modules  
**Domain:** drivers, fleet_routes, trip_summaries, fuel_transactions, eco_driving_violations, mechanics, vehicle_inspections, breakdown_reports, maintenance_logs, geofences  
**Workshop extras:** checklist_sections JSON, asset_category, engine_hours, workshop_checklist_templates  
**Fuel ops:** tenant_fuel_module_configs, fuel_live_snapshots, fuel_sync_cursor, fuel_station_uploads/fills  
**Platform:** system_settings, audit_logs, marketplace_integrations, wialon_mother_accounts, platform_integrations, tenant_files (blob fallback), login_slides, login_trust_logos, video_share_links, command_logs  

Runtime ensures: `ensureWorkshopSchema()`, LoginSlide/TrustLogo services create tables if missing.

---

## 13. API map (condensed)

| Prefix | Role |
|--------|------|
| `/api/auth/*` | login, me, terms, password |
| `/api/public/*` | login slides, trust logos |
| `/api/client/*` | all tenant app features |
| `/api/admin/*` | platform ops + tenant admin |
| `/api/webhooks/*` | LocoNav/TrackSolid webhooks |
| `/health` | MySQL health |
| `/uploads/*` | static + MySQL blob fallback |

Frontend client: `platform/frontend/src/lib/api.ts` (`authApi`, `clientApi`, `adminApi`).

---

## 14. Key frontend components directory

```
components/app/       AppLayout, DynamicSidebar, UnifiedMap, Wialon* panels/banners, MetricCard
components/admin/     AdminLayout, WialonTenantLinkPanel, trees, login slides admin
components/fleet/     Map/List/Track workspaces, UnitDetailPanel, commands, icons
components/fuel/      CoreFuelTab, charts, KPIs, variance, reports
components/workshop/  Inspection/Maintenance/Breakdown modals, timelines, costing
components/reports/   ModuleReportsShell, moduleReportPanels, print helpers
components/shared/    ThemeProvider, EmptyState, LoadingButton, PeriodAssetControls
components/ui/        shadcn primitives
```

---

## 15. Key backend services directory

```
adapters/             WialonAdapter, LocoNavAdapter, TrackSolidAdapter, wialonClient
services/             WialonLive/Fleet/Fuel*/Session/Hierarchy/Mother/Crud,
                      Alert harvest/classify, Workshop*, FuelDb*, Report*, SyncScheduler
orchestrators/        Dashboard, Alert, Asset, Admin, Video
routes/               auth, client, clientWialon, admin, wialonCenter, domain/*
middleware/           auth, tenant, rbac, tenantAccess
```

---

## 16. Environment variables (required for prod)

From `platform/deploy/hostinger.env.example`:
`NODE_ENV`, `PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, (`DB_HOST`/`DB_SOCKET`), `JWT_SECRET`, `ENCRYPTION_KEY`, `API_PUBLIC_URL`, `FRONTEND_URL`, `VITE_API_URL=` (empty), `REDIS_DISABLED=1`, optional provider base URLs.

---

## 17. Reproduction checklist for the other agent

- [ ] Scaffold monorepo under `platform/` with workspaces backend/frontend/shared  
- [ ] Implement MySQL schema + runtime ensures  
- [ ] JWT auth + role shells `/admin` vs `/app` + terms gate  
- [ ] MAMS branding constants + tenant theme with **strict login isolation**  
- [ ] Login 50/50 green layout + slides + trust logos + Hosting button  
- [ ] Landing page structure  
- [ ] Admin: tenants CRUD, branding, modules, Wialon mother→account link, fuel module config, system login assets  
- [ ] Client shell: sidebar modules, AppLayout header/bell/live  
- [ ] Every module in §7 with listed tabs  
- [ ] Alerts: Inbox + **Alert types** + Reports  
- [ ] Fuel: vehicle/generator(+bowser)/machinery + ledger graphs  
- [ ] Workshop: generator daily+monthly sections in one form  
- [ ] Wialon live fleet/maps/unit detail/commands/geofences/notifications  
- [ ] Alert harvest cron + acknowledge  
- [ ] Reports: Wialon templates + PNG charts + print  
- [ ] Hostinger entry `hostinger-start.mjs` + same-origin static serve  
- [ ] Push/deploy from **nsambamarvin2001/unified-fleet-platform** only  

---

## 18. Source-of-truth files (read these when coding)

| Concern | Path |
|---------|------|
| Routes | `platform/frontend/src/App.tsx` |
| Brand | `platform/frontend/src/lib/branding.ts` |
| Theme | `tenantBranding.ts`, `tenantBrandingCache.ts`, `ThemeProvider.tsx` |
| Modules | `lib/constants/modules.ts`, `DynamicSidebar.tsx` |
| Login | `pages/auth/Login.tsx` |
| Alerts | `pages/app/Alerts.tsx`, `WialonLivePanels.tsx` |
| Fuel | `pages/app/Fuel.tsx`, `components/fuel/*` |
| Workshop templates | `backend/.../WorkshopChecklistTemplates.ts` |
| Notifications API | `WialonLiveService.listNotifications` |
| Schema | `database/mysql/ufp_complete_schema.sql` |
| Deploy | `deploy/HOSTINGER_DEPLOY.md` |

---

*End of reproduction spec. When unsure, clone `nsambamarvin2001/unified-fleet-platform` @ `master` and treat running UI + this doc as the contract.*
