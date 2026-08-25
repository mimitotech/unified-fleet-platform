# MAMS — Complete Beginner Guide (How Everything Works)

**Who this is for:** An engineer or AI agent who has never seen this product.  
**Goal:** Understand *what MAMS is*, *where every number on screen comes from*, *how we connect to telematics*, and *which API to call for each feature* — enough to rebuild the same system.

**Canonical code:** `git@github.com:nsambamarvin2001/unified-fleet-platform.git` (branch `master`).  
Also see the shorter checklist-style companion: [`SYSTEM-REPRODUCTION-SPEC.md`](./SYSTEM-REPRODUCTION-SPEC.md).

---

# Part A — Explain it like I’m new

## A1. What is MAMS in one paragraph?

**MAMS** (Mimito Asset Management System) is a **multi-tenant web app**. Mimito (the platform operator) creates **client companies** (tenants) like URSB. Each client logs into **their own branded portal** and sees **only their** vehicles, generators, fuel, alerts, cameras, etc.

Almost all live fleet truth (GPS, sensors, fuel reports, notification rules, video, commands) comes from **telematics providers**. The main one is **Wialon Hosting**. MAMS does **not** invent GPS points — it **logs into Wialon with credentials**, asks for that client’s data, **stores copies** of some things in MySQL (alerts, fuel ledger, drivers, workshop forms), and **shows live data** for the rest (map positions, tank levels, configured alert types).

```
┌─────────────┐     JWT login      ┌──────────────┐
│ Browser SPA │ ◄────────────────► │ MAMS Backend │
│ (React)     │   /api/client/...  │ (Express)    │
└─────────────┘                    └──────┬───────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    ▼                     ▼                     ▼
              MySQL (Hostinger)    Wialon Hosting API    LocoNav / TrackSolid
              tenants, users,      GPS, sensors, fuel    (optional per tenant)
              alerts, fuel rows,   reports, notifications
              workshop forms       commands, video
```

## A2. Two portals (never mix them up)

| Portal | Who | URL prefix | Branding |
|--------|-----|------------|----------|
| **Admin** | Mimito staff (`super_admin`, `platform_admin`) | `/admin/...` | Always **MAMS** green `#004225` |
| **Client app** | Client staff (`tenant_admin`, `manager`, `operator`, `viewer`) | `/app/...` | **Client** colors/logo after login |

**Public** pages (`/`, `/auth/login`) always stay **MAMS** branded. After logout, client colors must disappear.

## A3. What “a tenant” stores

For each client company MAMS keeps:

1. **Identity** — name, slug (e.g. `ursb`), contact, status  
2. **Branding** — primary/secondary/accent colors, logo, favicon, optional CSS  
3. **Modules** — which menu items are on (Dashboard, Fuel, Alerts, …)  
4. **Users** — emails/passwords/roles for that company  
5. **Integrations** — how to talk to Wialon (and optionally LocoNav/TrackSolid)  
6. **Local business data** — workshop inspections, some drivers/routes, alerts inbox rows, fuel transaction ledger, etc.

## A4. The golden rule of data

Ask for every screen: **Is this Live Wialon, or MySQL?**

| Kind | Examples | How we get it |
|------|----------|----------------|
| **Live Wialon** | Map lat/lng, unit sensors, configured Alert types, live tank %, sending a command | Backend logs into Wialon → Remote API → JSON → frontend |
| **MySQL (cached / app-owned)** | Alerts Inbox list, acknowledged state, workshop forms, fuel fill/theft history tables, drivers roster in DB | Cron or sync wrote rows earlier; UI reads DB |
| **Hybrid** | Fuel KPIs | Live tank levels from Wialon **plus** fill/use totals from MySQL `fuel_transactions` |
| **Computed in browser** | Many Dashboard charts | Frontend pulls raw lists (alerts, fleet, fuel txs) and aggregates with Recharts |

---

# Part B — How we connect and integrate (Wialon from zero)

## B1. Characters in the story

1. **Mother account** — One powerful Wialon API **token** owned by Mimito. Like a master key that can see many customer accounts in the Wialon hierarchy. Stored in table `wialon_mother_accounts`. Managed in **Admin → Wialon Center**.

2. **Tenant Wialon account** — One customer’s **billing account** inside Wialon (e.g. URSB’s account). Has units (GENERATOR 1, trucks…), geofences, **notification rules**, report templates. MAMS stores its numeric id as `data_sources.wialon_resource_id`.

3. **`operateAs` (optional)** — “Act as this Wialon user.” Usually **null**. Mother token + account id is enough.

4. **MAMS tenant** — The row in `tenants` (slug `ursb`) the human logs into.

## B2. Admin setup steps (how integration is born)

```
1. Super/platform admin opens Admin → Wialon Center
2. Creates a Mother Account: paste Wialon token (+ optional base URL)
   → Backend calls Wialon token/login to verify
   → Saves encrypted token in wialon_mother_accounts

3. Opens Clients → create or open tenant (e.g. URSB)
4. Integrations / create wizard: pick Mother → pick account in tree → optional users
5. Backend linkAccount():
   - Writes data_sources row for (tenant, 'wialon')
   - Sets inherits_platform_credentials = true
   - Sets wialon_resource_id = that account id
   - Sets wialon_mother_account_id
   - Syncs units into assets / asset_mappings
6. Enable modules (Fuel, Alerts, Monitoring…)
7. Branding: colors + logo
8. Create client login users
9. Client opens /auth/login → lands on /app/dashboard with their branding
```

**API for the link step:**  
`POST /api/admin/tenants/{tenantId}/wialon/link-account`  
Body includes `accountId`, optional `accountName`, `motherAccountId`, `userIds`.

## B3. What happens on every live request (runtime)

```
Client browser
  → Authorization: Bearer <JWT>
  → X-Tenant-Slug: ursb
  → GET /api/client/fleet/snapshot

Backend
  1. Verify JWT → know user + tenantId
  2. loadTenantWialonCreds(tenantId)
       = mother token + tenant accountId
  3. withWialonClient(creds):
       WialonClient.connect() → svc=token/login → get sid (session)
       keep-alive ping so session doesn’t die
  4. Search only units where billing account = accountId  (scoped)
  5. Map positions, status → JSON
  6. Logout / cleanup session
  7. Return { units, counts, live: true, fetchedAt }
```

**Login to Wialon is always token/login** — not username/password.  
Password logins in this codebase are for **MAMS users** (and TrackSolid’s own API), not Wialon.

## B4. Scoping (why URSB never sees another client’s trucks)

Even though the mother token *could* see many accounts, every tenant call passes `accountId`. Searches use Wialon property `sys_billing_account_guid` = that id. So fleet, geofences, notifications, and reports are **filtered to that client’s account**.

## B5. Optional other providers

| Provider | Credentials on tenant | What we use it for |
|----------|----------------------|--------------------|
| **LocoNav** | API token / userAuthentication | Vehicles, alerts, history; webhook `POST /api/webhooks/loconav/:slug` |
| **TrackSolid** | appKey, appSecret, account, password | Assets, video, commands, geofences; webhook `POST /api/webhooks/tracksolid/:slug` |

Admin saves them via `PUT /api/admin/tenants/:id/integrations/loconav|tracksolid`.  
Most rich UI (maps, fuel reports, alert types) is **Wialon-first**.

## B6. Background jobs (data that “appears by itself”)

`SyncScheduler` on the backend:

| Every | Job | Result in MySQL / UI |
|-------|-----|----------------------|
| **1 min** | Alert harvest from Wialon (3 paths) | New rows in `alerts` → Inbox |
| **5 min** | Asset sync + live fuel snapshots | Updated assets / snapshots |
| **15 min** | Fuel reports → DB | New `fuel_transactions` for Fuel tables/KPIs |
| **30 min** | Trips / eco violations | Domain tables |

If Wialon is down, live screens fall back or show Offline; DB still shows last harvested history.

---

# Part C — How the browser talks to the backend

## C1. The `api()` helper

File: `platform/frontend/src/lib/api.ts`

1. Reads `localStorage.ufp_token` → header `Authorization: Bearer …`  
2. Reads `localStorage.ufp_tenant_slug` → header `X-Tenant-Slug`  
3. `fetch(VITE_API_URL + path)` — in production `VITE_API_URL` is **empty** (same host as the SPA)  
4. Expects JSON `{ success: true, data: … }` and **returns only `data`**  
5. On failure throws `Error` with server message  

Also stored: `ufp_role`. Branding cache keys: `ufp_tenant_branding:{slug}`, `ufp_tenant_theme_vars:{slug}`.

## C2. Auth APIs (how a human gets in)

| Step | Method + path | What you get |
|------|---------------|--------------|
| Login | `POST /api/auth/login` `{email,password}` | `token`, `user`, `tenantSlug`, `tenantName` |
| Restore session | `GET /api/auth/me` | user + tenant |
| Accept terms | `POST /api/auth/accept-terms` | `termsAcceptedAt` |
| Change password | `POST /api/auth/change-password` | ok |
| Forgot | `POST /api/auth/forgot-password` | `resetToken` (returned in JSON in current design) |
| Reset | `POST /api/auth/reset-password` | ok |

Public (no token):  
`GET /api/public/login-slides` — left-side images  
`GET /api/public/login-trust-logos` — “Trusted by” logos  

## C3. After login: where does the UI go?

- System role → `/admin/dashboard`  
- Client role → `/app/dashboard`  
- If `termsAcceptedAt` missing → `/auth/terms?next=…` first  

---

# Part D — Where each screen gets its data

## D1. Header (every client page)

| UI element | Source | API |
|------------|--------|-----|
| Tenant logo + name | Tenant branding | `GET /api/client/tenant` (+ localStorage cache) |
| Live / Partial / Offline pill | Integration rows | `GET /api/client/integrations/status` |
| “Live · 9s ago” | Fleet snapshot age | `GET /api/client/fleet/snapshot` |
| Bell alerts | Open alerts &lt; 24h | `GET /api/client/alerts` |
| Sidebar modules | Enabled modules | `GET /api/client/modules` |

## D2. Dashboard

Most KPIs are **not** from one magic `/dashboard/kpis` call on the page (that endpoint exists but the rich dashboard aggregates itself).

| You see | Comes from | API |
|---------|------------|-----|
| Asset counts, online, motion charts | Live fleet | `GET /api/client/fleet/snapshot` |
| Open alerts + alert charts | Alerts DB | `GET /api/client/alerts?from&to&limit` |
| Fuel filled/used/cost | Fuel ledger + live levels | `GET /api/client/fuel/transactions?…` + `GET /api/client/wialon/fuel/assets` |
| Drivers / Routes / Workshop pending / Streams | Domain stats | `/drivers/stats`, `/routes/stats`, `/workshop/kpis`, `/surveillance/streams` |
| Connection banner | Wialon context | `GET /api/client/wialon/context` |

Frontend polls fleet ~**8s** when the tab is visible (`LIVE_POLL` in `lib/liveRefresh.ts`).

## D3. Monitoring (map)

| You see | Comes from | API |
|---------|------------|-----|
| Markers on map | Each unit `position.lat/lng` from last GPS message in Wialon | `GET /api/client/fleet/snapshot` |
| Status Moving/Idle/Stopped/Offline | Speed + ignition/events logic on backend | same snapshot |
| Click unit → sensors, fuel tanks, params | Fresh Wialon item detail | `GET /api/client/wialon/units/{id}/detail` |
| Track history | Message interval | `GET /api/client/wialon/units/{id}/track` + `/trips` |
| Address under unit | Reverse geocode | `GET /api/client/wialon/geocode?lat=&lng=` |

**Logic:** Wialon `pos.y` = latitude, `pos.x` = longitude. No position → no marker (or offline).

## D4. Alerts module (this is where people get confused)

### Inbox tab = **events that already fired**
- Stored in MySQL `alerts`  
- Filled by cron harvest every minute + optional sync  
- API: `GET /api/client/alerts`  
- Ack: `POST /api/client/alerts/{id}/acknowledge` or bulk  

**How harvest works (3 paths into the inbox):**
1. Wialon task/notification messages  
2. Unit history: triggered notifications + registered events (power, sensors, speed…)  
3. Eco/safety report rows  
Plus fuel fill/theft rows can be **promoted** into alerts.

### Alert types tab = **rules configured for this client in Wialon**
- Like the Hosting “Notifications” list (FUEL FILLING ALERT, GENSET BATTERY LOW, …)  
- **Not** the inbox  
- API: `GET /api/client/wialon/notifications`  
- Backend: search resources with flag **1025**, then `core/search_item` each to read `unf`  
- UI tabs must be: **Inbox · Alert types · Reports**

## D5. Fuel module

| You see | Source type | API |
|---------|-------------|-----|
| Which assets have fuel / live litres | **Live Wialon** | `GET /api/client/wialon/fuel/assets` |
| Fill / drain / consumption table for a date range | **MySQL ledger** (harvested from Wialon fuel **reports**) | `GET /api/client/fuel/transactions?from&to&assetCategory=` |
| Force re-pull reports | Live → then cache | same URL with `refresh=true` (long timeout) |
| Graphs of fill vs use | Built from ledger rows in UI | from transactions response |
| Generator engine hours | Wialon reports | `GET /api/client/wialon/fuel/generator-engine-hours` |
| Station variance | DB station sheets vs FLS | `GET /api/client/fuel/variance` |
| Which report templates this tenant uses | Admin-configured | `GET /api/client/wialon/fuel/module-config` |

**Canonical Wialon report names MAMS looks for:**  
- Vehicles: `Fuel Report(Group)` / `Fuel Report(Unit)`  
- Generators: `Fuel Usage Report(Gensets)` / `Fuel Usage Report(Units)`  

**Logic:** Bowsers/tankers stay with **generators**, not vehicles. Drops on bowsers = dispensed, not theft.

## D6. Workshop

| Action | API |
|--------|-----|
| List inspections / maintenance / breakdowns | `GET /api/client/workshop/inspections` etc. |
| Create / update / delete | `POST` / `PATCH` / `DELETE` same paths |
| Load checklist for vehicle/generator/machinery | `GET /api/client/workshop/checklist-templates?assetCategory=generator` |
| KPIs | `GET /api/client/workshop/kpis` |

**Generator form logic:** One normal inspection form with **two sections** (Daily + Monthly PM items). Data is saved as JSON `checklist_sections` on the inspection row. Templates are seeded on backend boot into `workshop_checklist_templates`.

## D7. Drivers / Routes / Geofencing / Commands / Sensors / Emissions / Trailers / Surveillance

| Module | Primary read APIs | Live Wialon extras |
|--------|-------------------|--------------------|
| Drivers | `GET /api/client/drivers`, `/drivers/stats` | — |
| Routes | `GET /api/client/routes`, `/stats`, `/trips` | `GET /api/client/wialon/routes`, rounds |
| Geofencing | `GET/POST/DELETE /api/client/geofences` | `GET /api/client/wialon/geofences` |
| Commands | `GET /api/client/commands/history` | `GET/POST …/wialon/units/{id}/commands` → Wialon `unit/exec_cmd` |
| Sensors | statuses / panels | unit sensors endpoints |
| Emissions | `/emissions/metrics`, `/by-vehicle`, `/violations` | eco harvest |
| Trailers | assets filtered in UI | — |
| Surveillance | `/surveillance/units`, files, streams, live HLS start | Wialon video units + commands |

## D8. Settings (client)

| Action | API |
|--------|-----|
| Org profile | `GET /api/client/tenant` |
| List/create/update/delete users | `/api/client/users` |
| Reset user password | `POST /api/client/users/{id}/reset-password` |

Branding is **not** edited here — only in **Admin → Tenant → Branding**.

---

# Part E — Admin: how Mimito operates the platform

## E1. Admin sidebar

Dashboard → Clients → Client Users → (System Users) → System → Integrations → Wialon Center → LocoNav Center → TrackSolid Center → Support → My Account

## E2. Creating a working client (end-to-end logic)

1. **Wialon Center** — mother token works  
2. **Create tenant** — name/slug  
3. **Link Wialon account** — pick account under mother  
4. **Modules** — turn on Monitoring, Fuel, Alerts, Workshop…  
5. **Branding** — colors + logo upload (`POST /api/admin/tenants/:id/upload` then `PATCH` tenant)  
6. **Fuel module** (if gensets) — select which Wialon fuel report templates + columns; optional station Excel  
7. **Users** — create `tenant_admin` email/password or import from Wialon  
8. **Activate** tenant if draft  
9. Client logs in → sees branded `/app`  

## E3. System → Login media

- Login slides → public left carousel  
- Trust logos → public “Trusted by” strip  
CRUD under `/api/admin/login-slides` and `/api/admin/login-trust-logos`.

---

# Part F — Alerts deep dive (logic)

```
Wialon Hosting                 MAMS
─────────────                  ────
Notification RULES      →      Alert types tab
(listNotifications)            GET /wialon/notifications

When a rule FIRES       →      harvest → INSERT alerts
+ sensor events                GET /alerts  (Inbox)
+ fuel fill/theft promote

User clicks Ack         →      POST acknowledge
                               acknowledged=true in MySQL
```

**Inbox filters** (Fuel / Power / …) are **frontend regex** on `alert.type`, not separate APIs.

---

# Part G — Reports and charts (logic)

1. **Module “Reports” tabs** — each module has a Reports tab that runs catalogued Wialon templates or domain CSVs.  
2. **Run report** — `POST /api/client/wialon/reports/run` or `/exec` → tables + optional **PNG charts** (`report/get_result_chart` binary → base64 images).  
3. **Print** — browser print of DOM including those images; recovery if chunk stale.  
4. **Dashboard charts** — Recharts over data already fetched for KPIs.  
5. **Fuel graphs** — prefer ledger/report tables, not raw message spam.

---

# Part H — Branding logic (must reproduce correctly)

1. **Login / Landing** call `resetToPlatformBranding()` — strip tenant CSS vars, custom CSS, restore MAMS favicon/title.  
2. **Hydrate tenant theme from cache** only if token+slug and path is `/app` or `/admin`.  
3. **After login**, `ThemeProvider` + `GET /tenant` apply `--primary` etc. so buttons/tabs match client.  
4. **Logout** clears auth + branding.  

Login layout: full `#004225` background; **50% images | 50% form**; MAMS logo on form; Hosting button → `https://hosting.wialon.com`.

---

# Part I — Complete API catalog (by family)

Envelope: `{ success, data }` — frontend uses `data`.

### Auth / public
- `POST /api/auth/login|forgot-password|reset-password|change-password|accept-terms`  
- `GET /api/auth/me`  
- `GET /api/public/login-slides|login-trust-logos`  
- `GET /health`

### Client core
- `GET /api/client/tenant|modules|integrations/status|fleet/snapshot|dashboard/kpis`  
- `GET/POST /api/client/alerts…`  
- `GET/POST/PATCH/DELETE /api/client/users…`  
- Domain: `/drivers`, `/routes`, `/fuel`, `/workshop`, `/emissions`, `/geofences`, `/reports`, `/commands`, `/surveillance`  

### Client Wialon (live)
- Context/sync: `/wialon/context`, `/hierarchy`, `POST /wialon/sync`  
- Fleet/units: `/wialon/fleet`, `/units`, `/units/:id/detail|sensors|track|trips|commands`  
- Geo: `/wialon/geofences`, `/geocode`  
- Notifications: `/wialon/notifications` ← **Alert types**  
- Reports: `/wialon/reports/templates|catalog`, `POST …/run|exec`, live report GETs  
- Fuel: `/wialon/fuel/assets|live|analytics|intelligence|transactions|module-config|…`  

### Admin
- `/api/admin/dashboard|tenants|users|system-users|system|marketplace|centers/wialon|loconav|tracksolid`  
- Tenant: integrations, modules, branding patch, fuel-module-config, users, backups, audit, api-keys, upload  
- Link: `POST /api/admin/tenants/:id/wialon/link-account`  

Full method lists live in `platform/frontend/src/lib/api.ts` (`authApi`, `clientApi`, `adminApi`).

---

# Part J — Polling / caching (why the UI “feels live”)

| Layer | Interval | What |
|-------|----------|------|
| Frontend fleet poll | ~8s | `refetchInterval` when tab visible |
| Backend fleet memory cache | ~8s | Avoids hammering Wialon |
| Alerts UI | ~20s | React Query |
| Fuel UI | ~30s | React Query |
| Scheduler alert harvest | 1 min | Writes DB |
| Scheduler fuel reports | 15 min | Writes `fuel_transactions` |

Hidden browser tab → polling pauses (`pollWhenVisible`).

---

# Part K — Failure modes (what the user sees)

| Situation | Behavior |
|-----------|----------|
| Bad password | Login error |
| Tenant draft/inactive | Login rejected |
| Wialon token dead | integrations/status Offline/Partial; live panels error; DB history still visible |
| Notifications list empty | Often wrong resource flags or account not linked — must deep-fetch `unf` with flag 1025 |
| Fuel table empty | No matching report templates on account, or sync not run yet — check Fuel module config + refresh |
| Login shows client colors | Bug — branding leak; must reset on public routes |

---

# Part L — File map for implementers

| Want to change… | Open… |
|-----------------|--------|
| Routes | `frontend/src/App.tsx` |
| API client | `frontend/src/lib/api.ts` |
| Login UI | `frontend/src/pages/auth/Login.tsx` |
| Client shell | `AppLayout.tsx`, `DynamicSidebar.tsx` |
| Alerts tabs | `pages/app/Alerts.tsx`, `WialonLivePanels.tsx` |
| Fleet/map | `hooks/useFleetSnapshot.ts`, `components/fleet/*` |
| Fuel | `pages/app/Fuel.tsx`, `components/fuel/*` |
| Branding | `lib/branding.ts`, `tenantBranding*.ts` |
| Wialon session | `backend/.../WialonSessionService.ts`, `wialonClient.ts` |
| Link tenant | `WialonUserProvisionService.ts` / AccountLink |
| Alert harvest | `wialonAlertHarvest.ts`, `AlertOrchestrator.ts` |
| Notifications list | `WialonLiveService.listNotifications` |
| Fuel reports sync | `WialonFuelReportService`, `FuelSyncService` |
| Workshop templates | `WorkshopChecklistTemplates.ts` |
| Schema | `database/mysql/ufp_complete_schema.sql` |
| Deploy | `hostinger-start.mjs`, `deploy/HOSTINGER_DEPLOY.md` |

---

# Part M — Mental checklist to rebuild 100%

1. Multi-tenant MySQL + JWT + two shells (`/admin`, `/app`)  
2. Mother token → link account → scoped live API  
3. Cron harvest for alerts + fuel ledger  
4. Client modules with exact tabs (Alerts = Inbox / Alert types / Reports)  
5. Maps from fleet snapshot positions  
6. Fuel = live levels + DB transactions + report templates  
7. Workshop = category checklists (generator daily+monthly in one form)  
8. Branding isolation (MAMS on login; tenant only after login)  
9. Same-origin Hostinger deploy from **nsambamarvin2001** repo  
10. Every UI number traceable to an API in Part D / I  

---

*If something on screen is still mysterious: name the page + the label you see → look it up in Part D → call that API → read the service named in Part L.*
