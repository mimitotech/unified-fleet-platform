import { safeArray } from './safeArray';
import {
  readTenantPreviewSlugFromLocation,
  readTenantPreviewSlugFromSession,
} from '@/lib/adminTenantPreview';

export type {
  FuelSensorSlotValue,
  FuelSensorSlots,
  FuelAssetFlags,
  FuelFleetSummary,
  WialonFuelAssetRow,
  WialonFuelAssetsResponse,
  WialonFuelReportKpis,
  WialonFuelTrendPoint,
  WialonFuelTransaction,
  WialonFuelReportData,
  FuelPeriod,
  FuelAnalyticsResult,
  FuelAnalyticsComparison,
} from './fuelTypes';

/** FLS / live fleet sensor row (looser than asset-table sensors). */
export type WialonFuelSensorReading = {
  sensorId: number;
  name?: string;
  value?: number;
  level?: number;
  filled?: number;
  valueFormatted?: string;
  filledFormatted?: string;
};

export type WialonFuelFleetUnit = {
  unitId: number;
  unitName?: string;
  plate?: string;
  status?: string;
  fuelLive?: string;
  fuelFiltered?: string;
  fuelLiters?: number | null;
  fuelPercent?: number | null;
  filledLiters?: number | null;
  filledFormatted?: string;
  sensorName?: string;
  tankCount?: number;
  method?: string;
  tripState?: 0 | 1 | 2;
  tripStateLabel?: string;
  speedKmh?: number;
  mileage?: number;
  engineHours?: number;
  hardware?: string;
  fuel?: {
    levelLiters?: number;
    levelFormatted?: string;
    filled?: number;
    filledFormatted?: string;
    sensors?: WialonFuelSensorReading[];
  };
  sensors?: WialonFuelSensorReading[];
};

export type WialonFuelEvent = {
  id: string;
  unitId: number;
  unitName?: string;
  type: 'filling' | 'theft' | 'fuel_event';
  volume: number;
  currentLevel?: number;
  sensorId?: number;
  sensorName?: string;
  timestamp: string;
  markedFalse?: boolean;
};

const API_URL = import.meta.env.VITE_API_URL || '';

function getToken(): string | null {
  return localStorage.getItem('ufp_token');
}

function getTenantSlug(): string | null {
  // Admin View Client: URL wins, then this-tab session preview, then login slug.
  const fromUrl = readTenantPreviewSlugFromLocation();
  if (fromUrl) return fromUrl;
  const fromSession = readTenantPreviewSlugFromSession();
  if (fromSession) return fromSession;
  try {
    return localStorage.getItem('ufp_tenant_slug');
  } catch {
    return null;
  }
}

export { getToken, getTenantSlug };

export async function api<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs, ...fetchOptions } = options;
  const token = getToken();
  const tenantSlug = getTenantSlug();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  const isLinkPath = path.includes('/wialon/link-account');
  const isHierarchyPath =
    path.includes('/wialon/hierarchy') || path.includes('/centers/wialon/hierarchy');
  const isLongOp = Boolean(timeoutMs && timeoutMs >= 120_000);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...fetchOptions,
      headers,
      signal: controller?.signal,
    });
  } catch (err) {
    if (controller?.signal.aborted) {
      if (isLinkPath) {
        throw new Error(
          'Linking is taking longer than expected. Refresh this client page — the account may already be linked. If not, try Link again.'
        );
      }
      if (isLongOp) {
        throw new Error(
          'Request timed out — this can take several minutes. Refresh and check whether it finished, or try again with a narrower range.'
        );
      }
      throw new Error('Request timed out — fuel reports can take several minutes. Try again or narrow the date range.');
    }
    throw new Error(
      import.meta.env.DEV
        ? 'Cannot reach the MAMS server. Start Docker Desktop, then run: docker compose up -d postgres redis && npm run dev'
        : 'Cannot reach the MAMS server. Check your connection and try again.'
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const text = await res.text();
  let json: { error?: string; data?: T } = {};
  if (text) {
    try {
      json = JSON.parse(text) as { error?: string; data?: T };
    } catch {
      // Gateway HTML/empty bodies often look like "server unavailable" even when the app is up.
      if (res.status === 502 || res.status === 503 || res.status === 504 || !res.ok) {
        throw new Error(
          isLinkPath
            ? 'The link request was cut off (gateway timeout). Refresh this page — the account may already be saved. If Integrations still shows the old account, try Link again.'
            : isHierarchyPath
              ? 'Loading the Wialon account list timed out. Wait a moment and refresh — large mother accounts are cached after the first successful load.'
              : 'The server took too long or returned a non-JSON error. Refresh and try again shortly.'
        );
      }
      throw new Error(res.ok ? 'Unexpected server response' : 'Unexpected server response. Please refresh and try again.');
    }
  } else if (!res.ok) {
    throw new Error(
      res.status === 502 || res.status === 503 || res.status === 504
        ? 'The server gateway timed out. Refresh and check whether your last action completed.'
        : import.meta.env.DEV
          ? 'MAMS server unavailable — ensure the API and database are running, then retry'
          : 'MAMS server unavailable. Please refresh the page or try again shortly.'
    );
  }

  if (!res.ok) throw new Error(json.error || res.statusText);
  return json.data as T;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: User; tenantSlug?: string; tenantName?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => api<User>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    api<{ changed: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  forgotPassword: (email: string) =>
    api<{
      emailed?: boolean;
      email: string;
      message?: string;
    }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (resetToken: string, newPassword: string, confirmPassword: string) =>
    api<{ reset: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ resetToken, newPassword, confirmPassword }),
    }),
  acceptTerms: () =>
    api<{ termsAcceptedAt: string }>('/api/auth/accept-terms', { method: 'POST' }),
};

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
  isActive: boolean;
  termsAcceptedAt?: string | null;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  customCss?: string;
  contactEmail?: string;
  phone?: string;
  timezone?: string;
}

export interface TenantModule {
  moduleKey: string;
  label: string;
  icon?: string;
  sources: string[];
  isEnabled: boolean;
  isVisible: boolean;
  sortOrder?: number;
  integrationReady?: boolean;
}

export interface Driver {
  id: string;
  name: string;
  licenseNumber: string;
  permitClass?: string | null;
  licenseExpiryDate?: string | null;
  phone: string;
  email?: string;
  status: string;
  assignedAssetId?: string;
  assignedAssetName?: string;
  assignedAssetPlate?: string;
  fuelCardNumber?: string | null;
  hireDate?: string | null;
}

export interface DriverStats {
  total: number;
  available: number;
  driving: number;
  offDuty: number;
  expiringLicenses?: number;
  expiredLicenses?: number;
}

export interface DriverPenaltyConfig {
  tenantId: string;
  baseScore: number;
  penalties: Record<string, number>;
  goodMin: number;
  badMin: number;
  updatedAt?: string | null;
}

export interface DriverPerformanceRow {
  id: string;
  driverId: string;
  driverName: string;
  snapshotDate: string;
  safetyScore: number;
  grade?: string | null;
  penaltyPoints?: number;
  violationsCount: number;
  tripsCount: number;
  totalDistance: number;
  assignedAssetPlate?: string;
  assignedAssetName?: string;
}

export interface RouteCheckpoint {
  id?: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  arrivalTime?: string | null;
  departureTime?: string | null;
  notes?: string | null;
}

export interface FleetRoute {
  id: string;
  name: string;
  status: string;
  assetId?: string;
  assetName?: string;
  assetPlate?: string;
  driverId?: string;
  driverName?: string;
  startTime: string;
  endTime?: string;
  distance: number;
  waypoints?: RouteCheckpoint[];
  eta?: string;
  color: string;
  estimatedDuration: number;
  notes?: string;
}

export interface RouteStats {
  total: number;
  scheduled: number;
  inProgress: number;
  completed: number;
  totalDistance: number;
}

export interface TripSummary {
  id: string;
  tripId: string;
  unitName: string;
  departureTime: string;
  arrivalTime: string;
  mileage: number;
  duration: number;
  fuelUsed: number;
}

export interface FuelTransaction {
  id: string;
  unitName: string;
  section: string;
  timeStr: string;
  filled: number;
  fuelUsed: number;
  mileage: number;
  avgConsumption: number;
}

export interface WorkshopKpis {
  pendingMaintenance: number;
  completedThisMonth: number;
  openBreakdowns: number;
  inspectionsDue: number;
  totalMaintenanceCost: number;
  totalBreakdownCost?: number;
  vehiclesNeedingService?: number;
  activeMaintenanceJobs?: number;
  avgRepairTime?: number;
  inspectionPassRate?: number;
  fleetHealthScore?: number;
}

export interface EmissionsMetrics {
  totalFuelLiters: number;
  totalMileageKm: number;
  co2Kg: number;
  co2PerKm: number;
  violationCount: number;
  complianceStatus: string;
  emissionFactor?: number;
  from?: string | null;
  to?: string | null;
}

export interface EmissionsByTypeRow {
  violationType: string;
  count: number;
}

export interface EcoViolation {
  id: string;
  unitName: string;
  violationType: string;
  severity: string;
  occurredAt: string;
  driverName?: string;
}

export interface VideoStream {
  id: string;
  assetId: string;
  assetName: string;
  channel: string;
  status: string;
  sourceType: string;
  streamUrl?: string;
}

export interface WialonVideoCamera {
  index: number;
  channel?: number;
  name: string;
  flags: number;
  active: boolean;
  autoSave: boolean;
}

export interface WialonVideoUnit {
  id: number;
  name: string;
  uniqueId?: string;
  hwType?: string;
  connected: boolean;
  cameraCount: number;
  cameras: WialonVideoCamera[];
  videoUri?: string;
  commands: Array<{ name: string; label: string; linkType: string; param: string; type?: string }>;
  source: 'wialon_local' | 'wialon_hosting';
}

export interface WialonVideoFile {
  id: string;
  name: string;
  sizeBytes?: number;
  path: string;
  storageType?: 1 | 2;
  tag?: string;
  occurredAt?: string;
  source: 'storage' | 'message' | 'report';
  messageId?: number;
  channel?: number;
  eventType?: string;
}

export interface WialonVideoClipRef {
  unitId: number;
  source: 'storage' | 'message';
  path?: string;
  storageType?: 1 | 2;
  messageId?: number;
}

export interface SurveillanceShareLink {
  token: string;
  tenantId: string;
  clipRef: WialonVideoClipRef;
  label: string | null;
  expiresAt: string;
  shareUrl: string;
}

export interface SurveillanceViolation {
  id?: string;
  title?: string;
  type?: string;
  violationType?: string;
  severity?: string;
  occurredAt?: string;
  unitId?: number | string;
  unitName?: string;
  driverName?: string;
  category?: string;
  source?: string;
  videoUrl?: string;
  clip?: WialonVideoClipRef;
}

export interface WialonVideoEmbedSession {
  hostingUrl: string;
  apiHost: string;
  authHash: string;
  accessToken?: string;
  loginUrl: string;
  videoUrl?: string;
  unitId: number | null;
  channel?: number | null;
  expiresInSec: number;
  videoModuleHint: string;
}

export interface WialonLiveStreamSession {
  streamType: 'hls' | 'progressive';
  playbackUrl: string;
  channel: number;
  unitId: number;
  startedAt: string;
}

export interface Geofence {
  id: string;
  name: string;
  type: string;
  center?: { lat: number; lng: number };
  radius?: number;
  color: string;
  isActive: boolean;
}

export interface WialonMotherAccount {
  id: string;
  name: string;
  baseUrl: string | null;
  isActive: boolean;
  connected: boolean;
  verifiedAt: string | null;
  lastError: string | null;
  meta: Record<string, unknown>;
  accountTier: string | null;
  linkedTenantCount: number;
  counts?: { units?: number; accounts?: number; users?: number };
}

export interface WialonProbeResult {
  sessionUser: { id: number; nm: string; bact?: number };
  accountTier: string;
  dealerRights: boolean;
  counts: {
    units: number;
    accounts: number;
    users: number;
    resources: number;
    routes: number;
    unitGroups: number;
  };
  accounts: Array<{
    id: number;
    name: string;
    parentAccountId?: number;
    unitCount?: number;
    userCount?: number;
    assignedTenant?: { tenantId: string; tenantName: string; tenantSlug: string } | null;
  }>;
  users: Array<{ id: number; name: string; accountId?: number; lastLogin?: number; email?: string }>;
  scopedAccountId?: number;
  currentAccount?: { id: number; name: string; plan?: string; balance?: string };
}

export interface ReportType {
  id: string;
  label: string;
  format: string;
}

export const clientApi = {
  getTenant: () => api<TenantInfo>('/api/client/tenant'),
  getModules: () => api<TenantModule[]>('/api/client/modules').then((d) => safeArray(d)),
  getKpis: () => api<Record<string, number>>('/api/client/dashboard/kpis'),
  getFleetSnapshot: () =>
    api<{
      live: boolean;
      stale: boolean;
      fetchedAt: string;
      accountId?: number;
      accountName?: string;
      counts: {
        total: number;
        moving: number;
        idle: number;
        stopped: number;
        offline: number;
        withPosition: number;
        byHwName: Record<string, number>;
      };
      units: Array<{
        id: string;
        wialonId?: number;
        name: string;
        plate?: string;
        hw?: number;
        hwName?: string;
        uid?: string;
        ph?: string;
        netconn?: boolean;
        motionState?: string;
        status: string;
        fuelLevel?: number;
        fuel?: {
          levelLiters?: number;
          levelFormatted?: string;
          filled?: number;
          sensors?: Array<Record<string, unknown>>;
        };
        trip?: Record<string, unknown>;
        iconUrl?: string;
        iconUgi?: number;
        iconUri?: string;
        engineHours?: number;
        mileage?: number;
        prp?: Record<string, string>;
        flds?: Array<{ id: number; name: string; value: string }>;
        sens?: Array<{ id: number; name: string; type: string; param?: string; unit?: string }>;
        prms?: Array<{ key: string; value: string }>;
        rtd?: Record<string, unknown>;
        lmsg?: { time?: number; params?: Record<string, string | number> };
        position?: { lat: number; lng: number; speed: number; time: number; course?: number };
      }>;
    }>('/api/client/fleet/snapshot').then((snap) => ({
      ...snap,
      units: safeArray(snap?.units),
      counts: snap?.counts ?? {
        total: 0,
        moving: 0,
        idle: 0,
        stopped: 0,
        offline: 0,
        withPosition: 0,
        byHwName: {},
      },
    })),
  getAssets: () => api<unknown[]>('/api/client/assets'),
  getAssetStatuses: () =>
    api<{ items: unknown[]; fetchedAt: string }>('/api/client/assets/statuses'),
  getAlerts: (limit = 50, opts?: { from?: string; to?: string }) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    return api<unknown[]>(`/api/client/alerts?${q}`).then((d) => safeArray(d));
  },
  getAlertTypes: (opts?: { catalog?: boolean }) => {
    const q = new URLSearchParams();
    if (opts?.catalog) q.set('catalog', '1');
    const qs = q.toString();
    return api<{
      types: Array<{
        key: string;
        name: string;
        type: string;
        category: string;
        categoryLabel?: string;
        eventCount: number;
        lastSeen: string | null;
      }>;
      count: number;
    }>(`/api/client/alert-types${qs ? `?${qs}` : ''}`);
  },
  acknowledgeAlert: (id: string) =>
    api(`/api/client/alerts/${id}/acknowledge`, { method: 'POST' }),
  acknowledgeAlertsBulk: (ids?: string[]) =>
    api<{ acknowledged: number }>('/api/client/alerts/acknowledge-bulk', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  // Drivers
  getDrivers: () => api<Driver[]>('/api/client/drivers'),
  getDriverStats: () => api<DriverStats>('/api/client/drivers/stats'),
  getDriverPerformance: () => api<DriverPerformanceRow[]>('/api/client/drivers/performance'),
  getDriverPenaltyConfig: () => api<DriverPenaltyConfig>('/api/client/drivers/penalties'),
  saveDriverPenaltyConfig: (data: Partial<DriverPenaltyConfig>) =>
    api<DriverPenaltyConfig>('/api/client/drivers/penalties', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  recomputeDriverScores: (days = 30) =>
    api<{ drivers: number; snapshots: DriverPerformanceRow[] }>('/api/client/drivers/recompute-scores', {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),
  getDriverViolations: (id: string, limit = 50) =>
    api<EcoViolation[]>(`/api/client/drivers/${id}/violations?limit=${limit}`),
  createDriver: (data: Partial<Driver>) =>
    api<Driver>('/api/client/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriver: (id: string, data: Partial<Driver>) =>
    api<Driver>(`/api/client/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDriver: (id: string) =>
    api<{ deleted: boolean }>(`/api/client/drivers/${id}`, { method: 'DELETE' }),

  // Routes
  getRoutes: (status?: string) =>
    api<FleetRoute[]>(`/api/client/routes${status ? `?status=${status}` : ''}`),
  getRouteStats: () => api<RouteStats>('/api/client/routes/stats'),
  getTrips: (limit = 50, opts?: { from?: string; to?: string }) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    return api<TripSummary[]>(`/api/client/routes/trips?${q}`);
  },
  createRoute: (data: Partial<FleetRoute> & { waypoints?: RouteCheckpoint[] }) =>
    api<FleetRoute>('/api/client/routes', { method: 'POST', body: JSON.stringify(data) }),
  createRouteFromTrip: (tripId: string, data?: { name?: string; driverId?: string; driverName?: string }) =>
    api<FleetRoute>(`/api/client/routes/from-trip/${tripId}`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  updateRoute: (id: string, data: Partial<FleetRoute> & { waypoints?: RouteCheckpoint[] }) =>
    api<FleetRoute>(`/api/client/routes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRoute: (id: string) =>
    api<{ deleted: boolean }>(`/api/client/routes/${id}`, { method: 'DELETE' }),
  // Fuel (database-backed report data; live sensors stay on Wialon endpoints)
  getFuelTransactions: (
    from?: string,
    to?: string,
    refresh = false,
    unitId?: number,
    assetCategory?: import('./fuelTypes').FuelAssetCategory,
  ) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (refresh) q.set('refresh', 'true');
    if (unitId != null) q.set('unitId', String(unitId));
    if (assetCategory) q.set('assetCategory', assetCategory);
    const qs = q.toString();
    const days =
      from && to
        ? Math.max(
            1,
            Math.ceil(
              (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000,
            ) + 1,
          )
        : 1;
    const timeoutMs = refresh
      ? 20 * 60_000
      : days <= 1
        ? 2 * 60_000
        : days <= 7
          ? 4 * 60_000
          : 6 * 60_000;
    return api<import('./fuelTypes').WialonFuelReportData & { fromTs: number; toTs: number; lastSyncedAt?: string | null }>(
      `/api/client/fuel/transactions${qs ? `?${qs}` : ''}`,
      { timeoutMs },
    );
  },
  getFuelKpis: (from?: string, to?: string) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    const qs = q.toString();
    return api<Record<string, number>>(`/api/client/fuel/kpis${qs ? `?${qs}` : ''}`);
  },
  getFuelTrend: () => api<unknown[]>('/api/client/fuel/monthly-trend'),
  triggerFuelDbSync: () =>
    api<{ started: boolean }>('/api/client/fuel/sync', { method: 'POST' }),

  getFuelVariance: (from: string, to: string) =>
    api<{
      fromDate: string;
      toDate: string;
      summary: {
        stationLiters: number;
        flsLiters: number;
        variance: number;
        assets: number;
        stationFills: number;
      };
      assets: Array<{
        key: string;
        registration: string;
        unitId: string | null;
        unitName: string;
        stationLiters: number;
        flsLiters: number;
        variance: number;
        stationFills: number;
        flsFills: number;
      }>;
      details: Array<{
        id: string;
        filledAt: string;
        registration: string;
        unitName: string | null;
        product: string;
        stationLiters: number;
        unitPrice: number | null;
        amount: number | null;
        cardNumber: string | null;
        receiptNumber: string | null;
        matchedFlsLiters: number | null;
        variance: number | null;
      }>;
    }>(`/api/client/fuel/variance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  // Workshop
  getWorkshopKpis: () => api<WorkshopKpis>('/api/client/workshop/kpis'),
  getInspections: () => api<unknown[]>('/api/client/workshop/inspections'),
  getMaintenanceLogs: () => api<unknown[]>('/api/client/workshop/maintenance'),
  getBreakdowns: () => api<unknown[]>('/api/client/workshop/breakdowns'),
  getWorkshopChecklistTemplate: (
    assetCategory: string,
    purpose: 'inspection' | 'maintenance' = 'inspection',
  ) =>
    api<{
      assetCategory: string;
      purpose?: string;
      name: string;
      description: string;
      sections: unknown;
      failureSystems: string[];
      source?: string;
    }>(
      `/api/client/workshop/checklist-templates?assetCategory=${encodeURIComponent(assetCategory)}&purpose=${encodeURIComponent(purpose)}`,
    ),
  createInspection: (data: Record<string, unknown>) =>
    api('/api/client/workshop/inspections', { method: 'POST', body: JSON.stringify(data) }),
  updateInspection: (id: string, data: Record<string, unknown>) =>
    api(`/api/client/workshop/inspections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteInspection: (id: string) =>
    api(`/api/client/workshop/inspections/${id}`, { method: 'DELETE' }),
  createMaintenance: (data: Record<string, unknown>) =>
    api('/api/client/workshop/maintenance', { method: 'POST', body: JSON.stringify(data) }),
  updateMaintenance: (id: string, data: Record<string, unknown>) =>
    api(`/api/client/workshop/maintenance/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMaintenance: (id: string) =>
    api(`/api/client/workshop/maintenance/${id}`, { method: 'DELETE' }),
  createBreakdown: (data: Record<string, unknown>) =>
    api('/api/client/workshop/breakdowns', { method: 'POST', body: JSON.stringify(data) }),
  updateBreakdown: (id: string, data: Record<string, unknown>) =>
    api(`/api/client/workshop/breakdowns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBreakdown: (id: string) =>
    api(`/api/client/workshop/breakdowns/${id}`, { method: 'DELETE' }),

  // Emissions
  getEmissionsMetrics: (opts?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    const qs = q.toString();
    return api<EmissionsMetrics>(`/api/client/emissions/metrics${qs ? `?${qs}` : ''}`);
  },
  getEmissionsByVehicle: (opts?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    const qs = q.toString();
    return api<unknown[]>(`/api/client/emissions/by-vehicle${qs ? `?${qs}` : ''}`);
  },
  getEmissionsByType: (opts?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    const qs = q.toString();
    return api<EmissionsByTypeRow[]>(`/api/client/emissions/by-type${qs ? `?${qs}` : ''}`);
  },
  getEcoViolations: (opts?: { from?: string; to?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    if (opts?.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return api<EcoViolation[]>(`/api/client/emissions/violations${qs ? `?${qs}` : ''}`);
  },

  // Surveillance
  getVideoStreams: () => api<VideoStream[]>('/api/client/surveillance/streams'),
  getSurveillanceUnits: () =>
    api<{ units: WialonVideoUnit[]; count: number; fetchedAt: string }>('/api/client/surveillance/units'),
  getSurveillanceUnit: (unitId: number) =>
    api<WialonVideoUnit & { settings?: Record<string, unknown>; allCameras?: WialonVideoCamera[] }>(
      `/api/client/surveillance/units/${unitId}`
    ),
  getSurveillanceUnitFiles: (unitId: number, from?: number, to?: number) => {
    const q = new URLSearchParams();
    if (from) q.set('from', String(from));
    if (to) q.set('to', String(to));
    const qs = q.toString();
    return api<{ unitId: number; files: WialonVideoFile[]; count: number }>(
      `/api/client/surveillance/units/${unitId}/files${qs ? `?${qs}` : ''}`
    );
  },
  surveillanceFileStreamUrl: (
    unitId: number,
    path: string,
    storageType: 1 | 2 = 2,
    download = false
  ) => {
    const q = new URLSearchParams({
      path,
      storageType: String(storageType),
      ...(download ? { download: '1' } : {}),
    });
    return `${API_URL}/api/client/surveillance/units/${unitId}/files/stream?${q}`;
  },
  fetchSurveillanceFileBlob: async (
    unitId: number,
    path: string,
    storageType: 1 | 2 = 2
  ): Promise<Blob> => {
    const token = getToken();
    const tenantSlug = getTenantSlug();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;
    const q = new URLSearchParams({ path, storageType: String(storageType) });
    const res = await fetch(
      `${API_URL}/api/client/surveillance/units/${unitId}/files/stream?${q}`,
      { headers }
    );
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText;
      try {
        const j = JSON.parse(text) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* raw */
      }
      throw new Error(msg);
    }
    return res.blob();
  },
  fetchSurveillanceMessageVideoBlob: async (unitId: number, messageId: number): Promise<Blob> => {
    const token = getToken();
    const tenantSlug = getTenantSlug();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;
    const res = await fetch(
      `${API_URL}/api/client/surveillance/units/${unitId}/messages/${messageId}/file`,
      { headers }
    );
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText;
      try {
        const j = JSON.parse(text) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* raw */
      }
      throw new Error(msg);
    }
    return res.blob();
  },
  updateSurveillanceCameras: (
    unitId: number,
    cameras: Array<{ channel: number; name: string; flags: number }>
  ) =>
    api<WialonVideoUnit & { allCameras?: WialonVideoCamera[] }>(
      `/api/client/surveillance/units/${unitId}/cameras`,
      { method: 'PATCH', body: JSON.stringify({ cameras }) }
    ),
  getSurveillanceEmbedSession: (unitId?: number, channel?: number) => {
    const q = new URLSearchParams();
    if (unitId != null) q.set('unitId', String(unitId));
    if (channel != null) q.set('channel', String(channel));
    const qs = q.toString();
    return api<WialonVideoEmbedSession>(
      `/api/client/surveillance/embed-session${qs ? `?${qs}` : ''}`
    );
  },
  startSurveillanceLiveStream: (unitId: number, channel: number) =>
    api<WialonLiveStreamSession>(
      `/api/client/surveillance/units/${unitId}/cameras/${channel}/live/start`,
      { method: 'POST', timeoutMs: 120_000 }
    ),
  sendSurveillanceCommand: (unitId: number, commandName: string, param?: string) =>
    api(`/api/client/surveillance/units/${unitId}/commands`, {
      method: 'POST',
      body: JSON.stringify({ commandName, param }),
    }),
  getSurveillanceViolations: (unitId?: number) => {
    const q = new URLSearchParams();
    if (unitId != null) q.set('unitId', String(unitId));
    q.set('includeClips', '1');
    const qs = q.toString();
    return api<SurveillanceViolation[]>(
      `/api/client/surveillance/violations${qs ? `?${qs}` : ''}`
    );
  },
  createSurveillanceShareLink: (payload: {
    unitId: number;
    source: 'storage' | 'message';
    path?: string;
    storageType?: 1 | 2;
    messageId?: number;
    label?: string;
    expiresInHours?: number;
  }) =>
    api<SurveillanceShareLink>('/api/client/surveillance/clips/share', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Geofences
  getGeofences: () => api<Geofence[]>('/api/client/geofences'),
  createGeofence: (data: Partial<Geofence> & { points?: Array<{ lat: number; lng: number }> }) =>
    api<Geofence>('/api/client/geofences', { method: 'POST', body: JSON.stringify(data) }),
  deleteGeofence: (id: string) =>
    api(`/api/client/geofences/${id}`, { method: 'DELETE' }),

  // Reports
  getReportTypes: () => api<ReportType[]>('/api/client/reports/types'),
  getReportData: (type: string) => api<unknown>(`/api/client/reports/data/${type}`),

  getIntegrationStatus: () => api<Array<{
    sourceType: string;
    connected: boolean;
    lastSyncAt?: string;
    lastError?: string;
    wialonAccountName?: string;
    wialonAccountId?: string;
    wialonOperateAs?: string;
    wialonMeta?: Record<string, unknown>;
    previewAssetCount?: number;
  }>>('/api/client/integrations/status').then((d) => safeArray(d)),

  getWialonContext: () => api<{
    configured?: boolean;
    connected: boolean;
    lastSyncAt?: string;
    lastError?: string;
    accountName?: string;
    accountId?: string;
    operateAs?: string;
    accountTier?: string;
    sessionMeta?: Record<string, unknown>;
    counts?: { units?: number; accounts?: number } | null;
    previewAssetCount?: number;
  }>('/api/client/wialon/context'),
  getWialonHierarchy: () => api<WialonProbeResult>('/api/client/wialon/hierarchy'),
  syncWialon: () =>
    api<{ vehicles: number; drivers: number; geofences: number; usersCreated?: number; usersUpdated?: number; usersTotal?: number }>(
      '/api/client/wialon/sync',
      { method: 'POST' }
    ),
  getWialonCapabilities: () =>
    api<{ sessionUser: unknown; features?: unknown; classes?: unknown; accountData?: unknown }>(
      '/api/client/wialon/capabilities'
    ),
  getWialonRoutes: () =>
    api<{ routes: Array<{ id: number; name: string; accountId?: number }>; count: number }>(
      '/api/client/wialon/routes'
    ),
  getWialonReportTemplates: () =>
    api<{
      templates: Array<{ resourceId: number; resourceName: string; id: number; name: string; type?: string }>;
      count: number;
    }>('/api/client/wialon/reports/templates'),
  getWialonReportCatalog: () =>
    api<{
      templates: Array<{
        resourceId: number;
        resourceName: string;
        templateId: number;
        templateName: string;
        module: string;
          isGroupReport: boolean;
          objectKind?: 'unit' | 'group' | 'user' | 'resource';
          fallback?: boolean;
        }>;
      modules: Array<{
        module: string;
        count: number;
        templates: Array<{
          resourceId: number;
          resourceName: string;
          templateId: number;
          templateName: string;
          module: string;
          isGroupReport: boolean;
          objectKind?: 'unit' | 'group' | 'user' | 'resource';
          fallback?: boolean;
        }>;
      }>;
      groups: Array<{ id: number; nm: string }>;
      users?: Array<{ id: number; nm: string }>;
      count: number;
      fetchedAt: string;
    }>('/api/client/wialon/reports/catalog'),
  runWialonReport: (payload: {
    module?: string;
    resourceId?: number;
    templateId?: number;
    objectId: number;
    objectKind?: 'unit' | 'group' | 'user' | 'resource';
    from: number;
    to: number;
    maxRowsPerTable?: number;
  }) =>
    api<{
      result: Record<string, unknown>;
      rows: unknown[];
      tables: Array<{
        index: number;
        name: string;
        label: string;
        columns: Array<{ key: string; label: string; type?: string }>;
        rows: Record<string, unknown>[];
        totalRows: number;
      }>;
      charts: Array<{ index: number; name: string; data: unknown }>;
      summary: {
        tableCount: number;
        rowCount: number;
        chartCount: number;
        generatedAt: string;
        interval: { from: number; to: number };
      };
      template?: { resourceId: number; templateId: number; module: string | null; objectKind: string };
    }>('/api/client/wialon/reports/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getLiveReportFleetStatus: () =>
    api<{ rows: Record<string, unknown>[]; fetchedAt: string; count: number }>(
      '/api/client/wialon/reports/live/fleet-status'
    ),
  getLiveReportFleetFuel: () =>
    api<{ rows: Record<string, unknown>[]; fetchedAt: string; count: number }>(
      '/api/client/wialon/reports/live/fleet-fuel'
    ),
  getLiveReportTrips: (fromMs: number, toMs: number, unitId?: number) => {
    const q = new URLSearchParams({ from: String(fromMs), to: String(toMs) });
    if (unitId != null) q.set('unitId', String(unitId));
    return api<{ rows: Record<string, unknown>[]; fetchedAt: string; count: number }>(
      `/api/client/wialon/reports/live/trips?${q}`
    );
  },
  getLiveReportUnitSensors: (unitId: number) =>
    api<{ rows: Record<string, unknown>[]; fetchedAt: string; count: number }>(
      `/api/client/wialon/reports/live/unit-sensors/${unitId}`
    ),
  getWialonNotifications: () =>
    api<{
      notifications: Array<{
        resourceId: number;
        resourceName: string;
        id: number;
        name: string;
        triggers?: number;
        active?: boolean;
        unitCount?: number;
        controlType?: string;
      }>;
      count: number;
    }>('/api/client/wialon/notifications'),
  getWialonChildAccounts: () =>
    api<{ accounts: Array<{ id: number; name: string; parentAccountId?: number }>; count: number }>(
      '/api/client/wialon/accounts'
    ),
  wialonApi: (svc: string, params: Record<string, unknown> = {}) =>
    api<unknown>('/api/client/wialon/api', {
      method: 'POST',
      body: JSON.stringify({ svc, params }),
    }),
  getWialonFleet: () =>
    api<{
      units: Array<{
        id: number;
        name: string;
        plate?: string;
        status: string;
        hwName?: string;
        hw?: number;
        motionState?: string;
        position?: { lat: number; lng: number; speed: number; time: number };
      }>;
      counts: {
        total: number;
        moving: number;
        idle: number;
        stopped: number;
        offline: number;
        withPosition: number;
        byHwName: Record<string, number>;
      };
      fetchedAt: string;
      accountName?: string;
    }>('/api/client/wialon/fleet'),
  getWialonUnits: () =>
    api<{
      units: Array<{
        id: number;
        name: string;
        plate?: string;
        status: string;
        position?: { lat: number; lng: number; speed: number; time: number };
      }>;
      count: number;
    }>('/api/client/wialon/units'),
  getWialonGeofencesLive: () =>
    api<{
      geofences: Array<{
        resourceId: number;
        resourceName: string;
        id: number;
        name: string;
        type: string;
        radius?: number;
        center?: { lat: number; lng: number };
      }>;
      count: number;
    }>('/api/client/wialon/geofences'),
  createWialonGeofence: (data: {
    name: string;
    type: 'circle' | 'polygon';
    center?: { lat: number; lng: number };
    radius?: number;
    points?: Array<{ lat: number; lng: number }>;
    resourceId?: number;
  }) =>
    api('/api/client/wialon/geofences', { method: 'POST', body: JSON.stringify(data) }),
  getWialonGeocode: (lat: number, lng: number) =>
    api<{ geocode: { address: string; parts: string[] } }>(
      `/api/client/wialon/geocode?lat=${lat}&lng=${lng}`
    ),
  getWialonUnitDetail: (unitId: number) =>
    api<{
      unitId: number;
      detail: {
        id: number;
        name: string;
        plate?: string;
        iconUrl?: string;
        iconUgi?: number;
        iconUri?: string;
        address?: string;
        addressParts?: string[];
        hw?: number;
        hwName?: string;
        uid?: string;
        ph?: string;
        netconn?: boolean;
        motionState?: string;
        status: string;
        lastUpdate?: string;
        lastUpdateAge?: string;
        position?: { lat: number; lng: number; speed: number; course?: number; time: number; satellites?: number; altitude?: number };
        trip?: {
          state?: 0 | 1 | 2;
          currSpeed?: number;
          course?: number;
          ignitionOn?: boolean;
        };
        health?: { battery?: number; hdop?: number; satellites?: number; altitude?: number };
        io?: {
          inputs: Array<{ key: string; label: string; state: string }>;
          outputs: Array<{ key: string; label: string; state: string }>;
        };
        counters?: { mileage?: number; engineHours?: number };
        prp?: Record<string, string>;
        flds?: Array<{ id: number; name: string; value: string }>;
        profileFields?: Array<{ id: number; name: string; value: string }>;
        messageParams?: Array<{ key: string; value: string }>;
        sens?: Array<{ id: number; name: string; type: string; param?: string; unit?: string }>;
        prms?: Array<{ key: string; value: string }>;
        rtd?: Record<string, unknown>;
        lmsg?: { time?: number; params?: Record<string, string | number> };
        sensors: Array<{ id: number; name: string; type: string; value: string; unit?: string; param?: string }>;
        maintenance: Array<{ name: string; detail: string; counter?: number; threshold?: number }>;
        video?: Record<string, unknown>;
        fuelLevel?: number;
        fuel?: {
          level?: number;
          levelLiters?: number;
          levelFormatted?: string;
          filled?: number;
          filledFormatted?: string;
          tanks: Array<{ name: string; value: string; unit?: string; type?: string; sensorId?: number }>;
          consumption?: { idling?: number; urban?: number; suburban?: number };
          rates?: {
            consSummer?: number;
            consWinter?: number;
            winterMonthFrom?: number;
            winterDayFrom?: number;
            winterMonthTo?: number;
            winterDayTo?: number;
          };
          settings?: {
            calcTypes?: number;
            calcTypeLabels?: string[];
            fuelLevelParams?: Record<string, unknown>;
            fuelConsMath?: { idling?: number; urban?: number; suburban?: number };
            fuelConsRates?: Record<string, unknown>;
          };
          minFillingVolume?: number;
          minTheftVolume?: number;
          filterQuality?: number;
          sensors?: Array<{
            sensorId: number;
            name?: string;
            value?: number;
            level?: number;
            filled?: number;
            valueFormatted?: string;
            filledFormatted?: string;
          }>;
        };
      };
    }>(`/api/client/wialon/units/${unitId}/detail`),
  getWialonUnitSensors: (unitId: number) =>
    api<{ unitId: number; sensors: Array<{ name: string; value: string; unit?: string }> }>(
      `/api/client/wialon/units/${unitId}/sensors`
    ),
  getWialonUnitTrack: (unitId: number, from: number, to: number) =>
    api<{
      unitId: number;
      points: Array<{
        lat: number;
        lng: number;
        speed: number;
        course?: number;
        time: number;
        params?: Record<string, string | number>;
      }>;
      count: number;
    }>(`/api/client/wialon/units/${unitId}/track?from=${from}&to=${to}`),
  getWialonFuelLive: () =>
    api<{
      units: WialonFuelFleetUnit[];
      count: number;
      fetchedAt: string;
    }>('/api/client/wialon/fuel/live'),
  getWialonFuelAssets: () =>
    api<import('./fuelTypes').WialonFuelAssetsResponse>('/api/client/wialon/fuel/assets'),
  getWialonFuelAnalytics: (opts: {
    period?: import('./fuelTypes').FuelPeriod;
    month?: string;
    from?: string;
    to?: string;
    unitId?: number | null;
    unitName?: string;
    refresh?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (opts.period) q.set('period', opts.period);
    if (opts.month) q.set('month', opts.month);
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    if (opts.unitId != null) q.set('unitId', String(opts.unitId));
    if (opts.unitName) q.set('unitName', opts.unitName);
    if (opts.refresh) q.set('refresh', 'true');
    return api<import('./fuelTypes').FuelAnalyticsResult>(
      `/api/client/wialon/fuel/analytics?${q}`,
      { timeoutMs: 20 * 60_000 }
    );
  },
  warmWialonFuelReports: (from?: string, to?: string) =>
    api<{ started: boolean }>('/api/client/wialon/fuel/analytics/warm', {
      method: 'POST',
      body: from && to ? JSON.stringify({ from, to }) : undefined,
    }),
  getWialonFuelTransactions: (
    from: string,
    to: string,
    refresh = false,
    unitId?: number,
    assetCategory?: import('./fuelTypes').FuelAssetCategory,
  ) => {
    const q = new URLSearchParams({ from, to });
    if (refresh) q.set('refresh', 'true');
    if (unitId != null) q.set('unitId', String(unitId));
    if (assetCategory) q.set('assetCategory', assetCategory);
    const days = Math.max(
      1,
      Math.ceil((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000) + 1,
    );
    const timeoutMs = refresh
      ? 20 * 60_000
      : days <= 1
        ? 60_000
        : days <= 7
          ? 90_000
          : days <= 14
            ? 120_000
            : days <= 45
              ? 8 * 60_000
              : 20 * 60_000;
    return api<import('./fuelTypes').WialonFuelReportData & { fromTs: number; toTs: number }>(
      `/api/client/wialon/fuel/transactions?${q}`,
      { timeoutMs },
    );
  },
  getWialonFuelReportCapabilities: () =>
    api<{
      tenantId: string;
      scope: { tenantId: string; accountId?: string | number };
      expectedReports: {
        vehicle: { group: string; unit: string };
        generator: { group: string; unit: string };
      };
      slots: Array<{
        key: 'vehicle.group' | 'vehicle.unit' | 'generator.group' | 'generator.unit';
        family: 'vehicle' | 'generator';
        role: 'group' | 'unit';
        expectedName: string;
        available: boolean;
        matchedName: string | null;
        resourceId: number | null;
        templateId: number | null;
      }>;
      readyCount: number;
      missingReports: string[];
      uniform: boolean;
      capabilities: Array<{
        module: string;
        available: boolean;
        groupTemplateCount: number;
        unitTemplateCount: number;
        templates: Array<{
          resourceId: number;
          resourceName: string;
          templateId: number;
          templateName: string;
          isGroupReport: boolean;
          fuelFamily?: string;
        }>;
      }>;
      discoveredFuelTemplates?: Array<{
        templateName: string;
        isGroupReport: boolean;
        fuelFamily: string | null;
        resourceName: string;
      }>;
      fetchedAt: string;
    }>('/api/client/wialon/fuel/report-capabilities'),
  getWialonFuelIntelligence: (
    from: string,
    to: string,
    refresh = false,
    assetCategory?: import('./fuelTypes').FuelAssetCategory,
    unitId?: number,
  ) => {
    const q = new URLSearchParams({ from, to });
    if (refresh) q.set('refresh', 'true');
    if (assetCategory) q.set('assetCategory', assetCategory);
    if (unitId != null) q.set('unitId', String(unitId));
    return api<{
      from: string;
      to: string;
      totals: { consumed: number; filled: number; theft: number; mileage: number; runtimeHours: number };
      groups: Array<{
        key: string;
        label: string;
        consumed: number;
        filled: number;
        theft: number;
        mileage: number;
        runtimeHours: number;
        avgConsumption: number;
        assets: number;
      }>;
      assets: Array<{
        unitId: number;
        unitName: string;
        assetCategory: string;
        consumed: number;
        filled: number;
        theft: number;
        mileage: number;
        runtimeHours: number;
        avgConsumption: number;
        efficiencyScore: number;
        events: number;
      }>;
      daily: Array<{ date: string; consumed: number; filled: number; theft: number; mileage: number; runtimeHours: number }>;
      unitDetail: {
        unitId: number;
        unitName: string;
        daily: Array<{ date: string; consumed: number; filled: number; theft: number; mileage: number; runtimeHours: number }>;
        runtimeIntervals: Array<{ start: number; end: number; hours: number }>;
      } | null;
      fetchedAt: string;
    }>(`/api/client/wialon/fuel/intelligence?${q}`, { timeoutMs: 20 * 60_000 });
  },
  getWialonFuelModuleConfig: () =>
    api<{
      tenantId: string;
      selectedReports: Array<{
        resourceId: number;
        templateId: number;
        templateName: string;
        module?: string;
        isGroupReport?: boolean;
      }>;
      visibleColumns: Array<
        | 'filledMain'
        | 'filledReserve'
        | 'filledStation'
        | 'variance'
        | 'usedMain'
        | 'usedReserve'
        | 'levelMain'
        | 'levelReserve'
        | 'totalLevel'
        | 'dropMain'
        | 'dropReserve'
        | 'totalDrop'
        | 'totalUsed'
        | 'fuelType'
        | 'cost'
        | 'cardNo'
      >;
      updatedAt: string | null;
    }>('/api/client/wialon/fuel/module-config'),
  getWialonFuelOverview: (from?: string, to?: string, refresh = false) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (refresh) q.set('refresh', 'true');
    const qs = q.toString();
    return api<{
      fetchedAt: string;
      totalFilled: number;
      totalConsumed: number;
      totalMileage: number;
      avgConsumption: number;
      theftEvents: number;
      vehiclesTracked: number;
      consumptionCount: number;
      fillingCount: number;
      theftCount: number;
      transactionCount: number;
      source?: string;
    }>(`/api/client/wialon/fuel/overview${qs ? `?${qs}` : ''}`);
  },
  getWialonFuelEvents: (limit = 200) =>
    api<{ events: WialonFuelEvent[]; fetchedAt: string }>(`/api/client/wialon/fuel/events?limit=${limit}`),
  getWialonFuelTrend: (from?: string, to?: string, refresh = false) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (refresh) q.set('refresh', 'true');
    const qs = q.toString();
    return api<{ trend: Array<{ month: string; filled: number; consumed: number }>; fetchedAt: string }>(
      `/api/client/wialon/fuel/trend${qs ? `?${qs}` : ''}`
    );
  },
  getWialonFuelLevelSeries: (unitId: number, from: number, to: number) => {
    const q = new URLSearchParams({
      unitId: String(unitId),
      from: String(from),
      to: String(to),
    });
    const days = Math.max(1, Math.ceil((to - from) / 86400));
    const timeoutMs =
      days <= 1 ? 60_000 : days <= 7 ? 120_000 : days <= 30 ? 180_000 : 5 * 60_000;
    return api<{
      unitId: number;
      unitName: string;
      from: number;
      to: number;
      pointCount: number;
      fillCount: number;
      drainCount: number;
      points: Array<{
        t: number;
        liters: number;
        processed?: number;
        main: number | null;
        reserve: number | null;
        engineOn?: number | null;
        event: 'level' | 'refill' | 'drain';
        delta: number;
      }>;
      fetchedAt: string;
    }>(`/api/client/wialon/fuel/level-series?${q}`, { timeoutMs });
  },
  getWialonGeneratorEngineHours: (from?: string, to?: string, refresh = false, unitId?: number) => {
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    if (refresh) q.set('refresh', 'true');
    if (unitId != null) q.set('unitId', String(unitId));
    const qs = q.toString();
    return api<{
      data: Array<{
        id: string;
        unitId: number;
        unitName: string;
        grouping: string;
        beginning: number;
        end: number;
        initialEngineHours: number;
        engineHours: number;
        finalEngineHours: number;
      }>;
      count: number;
      fetchedAt: string;
    }>(`/api/client/wialon/fuel/generator-engine-hours${qs ? `?${qs}` : ''}`, { timeoutMs: 20 * 60_000 });
  },
  getWialonUnitFuelProfile: (unitId: number) =>
    api<{
      unitId: number;
      settings: Record<string, unknown>;
      live: WialonFuelFleetUnit | null;
      decoded: { calcTypes: string[]; levelParams: string[] };
      fetchedAt: string;
    }>(`/api/client/wialon/units/${unitId}/fuel/profile`),
  updateWialonFuelDetection: (unitId: number, params: Record<string, unknown>) =>
    api(`/api/client/wialon/units/${unitId}/fuel/detection`, { method: 'PATCH', body: JSON.stringify(params) }),
  createWialonFuelSensor: (
    unitId: number,
    body: { name: string; parameter: string; calibration?: Array<{ x: number; a: number; b: number }>; description?: string }
  ) =>
    api(`/api/client/wialon/units/${unitId}/fuel/sensors`, { method: 'POST', body: JSON.stringify(body) }),
  getWialonUnitFuelSettings: (unitId: number) =>
    api<{
      unitId: number;
      settings: {
        calcTypes?: number;
        calcTypeLabels: string[];
        fuelLevelParams?: Record<string, unknown>;
        fuelConsMath?: { idling?: number; urban?: number; suburban?: number };
        fuelConsRates?: Record<string, unknown>;
      };
    }>(`/api/client/wialon/units/${unitId}/fuel/settings`),
  getWialonUnitFuelLive: (unitId: number) =>
    api<{
      unitId: number;
      fuel: {
        levelLiters?: number;
        levelFormatted?: string;
        filled?: number;
        filledFormatted?: string;
        sensors: Array<Record<string, unknown>>;
      } | null;
    }>(`/api/client/wialon/units/${unitId}/fuel/live`),
  getWialonUnitTrips: (unitId: number, from: number, to: number) =>
    api<{ trips: Array<Record<string, unknown>>; count: number }>(
      `/api/client/wialon/units/${unitId}/trips?from=${from}&to=${to}`
    ),
  getWialonUnitCommands: (unitId: number) =>
    api<{ commands: Array<{ name: string; label?: string }> }>(
      `/api/client/wialon/units/${unitId}/commands`
    ),
  sendWialonUnitCommand: (unitId: number, commandName: string, param?: Record<string, unknown>) =>
    api(`/api/client/wialon/units/${unitId}/commands`, {
      method: 'POST',
      body: JSON.stringify({ commandName, param }),
    }),
  sendWialonAssetCommand: (assetId: string, commandName: string, param?: Record<string, unknown>) =>
    api(`/api/client/wialon/assets/${assetId}/command`, {
      method: 'POST',
      body: JSON.stringify({ commandName, param }),
    }),
  getWialonRouteRounds: (routeId: number) =>
    api<{ rounds: Array<Record<string, unknown>>; count: number }>(
      `/api/client/wialon/routes/${routeId}/rounds`
    ),
  execWialonReport: (payload: {
    reportResourceId: number;
    reportTemplateId: number;
    reportObjectId: number;
    from: number;
    to: number;
    reportObjectSecId?: number;
    maxRowsPerTable?: number;
  }) =>
    api<{
      result: Record<string, unknown>;
      rows: unknown[];
      tables: Array<{
        index: number;
        name: string;
        label: string;
        columns: Array<{ key: string; label: string; type?: string }>;
        rows: Record<string, unknown>[];
        totalRows: number;
      }>;
      charts: Array<{ index: number; name: string; data: unknown }>;
      summary: {
        tableCount: number;
        rowCount: number;
        chartCount: number;
        generatedAt: string;
        interval: { from: number; to: number };
      };
    }>('/api/client/wialon/reports/exec', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getPreferences: () => api<Record<string, unknown>>('/api/client/preferences'),
  updatePreferences: (data: Record<string, unknown>) =>
    api('/api/client/preferences', { method: 'PUT', body: JSON.stringify(data) }),
  getTenantUsers: () =>
    api<
      Array<{
        id: string;
        email: string;
        full_name: string;
        role: string;
        is_active: boolean;
        last_login_at: string | null;
        created_at?: string;
        allowed_alert_types: Array<{ key: string; name: string }> | null;
      }>
    >('/api/client/users'),
  createTenantUser: (data: {
    email: string;
    password?: string;
    fullName?: string;
    role?: string;
    allowedAlertTypes?: Array<{ key: string; name: string }> | null;
  }) =>
    api<{ id: string; email: string; temporaryPassword?: string }>('/api/client/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTenantUser: (
    userId: string,
    data: {
      fullName?: string;
      role?: string;
      isActive?: boolean;
      allowedAlertTypes?: Array<{ key: string; name: string }> | null;
    },
  ) => api(`/api/client/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeTenantUser: (userId: string) =>
    api(`/api/client/users/${userId}`, { method: 'DELETE' }),
  resetTenantUserPassword: (userId: string, password?: string) =>
    api<{ reset: boolean; temporaryPassword: string; credentialsEmailed?: boolean }>(
      `/api/client/users/${userId}/reset-password`,
      {
        method: 'POST',
        body: JSON.stringify(password ? { password } : {}),
      },
    ),

  sendCommand: (assetId: string, command: string, params?: Record<string, unknown>) =>
    api(`/api/client/commands/${assetId}`, { method: 'POST', body: JSON.stringify({ command, params }) }),
  getCommandHistory: () => api<unknown[]>('/api/client/commands/history'),
};

export const adminApi = {
  getDashboard: () => api<Record<string, unknown>>('/api/admin/dashboard'),
  getSystemHealth: () => api<Record<string, unknown>>('/api/admin/system/health'),
  getSystemSettings: () => api<Record<string, Record<string, unknown>>>('/api/admin/system/settings'),
  updateSystemSettings: (key: string, value: unknown) =>
    api(`/api/admin/system/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  listLoginSlides: () =>
    api<{ slides: Array<{
      id: string;
      title: string;
      details: string | null;
      eyebrow: string | null;
      imageUrl: string | null;
      sortOrder: number;
      isEnabled: boolean;
    }> }>('/api/admin/login-slides'),
  createLoginSlide: (data: {
    title: string;
    details?: string | null;
    eyebrow?: string | null;
    sortOrder?: number;
    isEnabled?: boolean;
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
  }) => api('/api/admin/login-slides', { method: 'POST', body: JSON.stringify(data) }),
  updateLoginSlide: (
    id: string,
    data: {
      title?: string;
      details?: string | null;
      eyebrow?: string | null;
      sortOrder?: number;
      isEnabled?: boolean;
      fileName?: string;
      mimeType?: string;
      dataBase64?: string;
    },
  ) => api(`/api/admin/login-slides/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLoginSlide: (id: string) => api(`/api/admin/login-slides/${id}`, { method: 'DELETE' }),
  listLoginTrustLogos: () =>
    api<{ logos: Array<{
      id: string;
      name: string;
      imageUrl: string | null;
      sortOrder: number;
      isEnabled: boolean;
    }> }>('/api/admin/login-trust-logos'),
  createLoginTrustLogo: (data: {
    name: string;
    sortOrder?: number;
    isEnabled?: boolean;
    fileName?: string;
    mimeType?: string;
    dataBase64?: string;
  }) => api('/api/admin/login-trust-logos', { method: 'POST', body: JSON.stringify(data) }),
  updateLoginTrustLogo: (
    id: string,
    data: {
      name?: string;
      sortOrder?: number;
      isEnabled?: boolean;
      fileName?: string;
      mimeType?: string;
      dataBase64?: string;
    },
  ) => api(`/api/admin/login-trust-logos/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteLoginTrustLogo: (id: string) => api(`/api/admin/login-trust-logos/${id}`, { method: 'DELETE' }),
  getMarketplace: () => api<unknown[]>('/api/admin/marketplace'),
  updateMarketplace: (key: string, isEnabledGlobally: boolean) =>
    api(`/api/admin/marketplace/${key}`, { method: 'PATCH', body: JSON.stringify({ isEnabledGlobally }) }),

  listUsers: (params?: { search?: string; role?: string; tenant?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.role) q.set('role', params.role);
    if (params?.tenant) q.set('tenant', params.tenant);
    if (params?.status) q.set('status', params.status);
    return api<unknown[]>(`/api/admin/users?${q}`);
  },
  getUser: (id: string) => api<unknown>(`/api/admin/users/${id}`),
  updateUser: (
    id: string,
    data: { fullName?: string; role?: string; isActive?: boolean; modules?: string[] }
  ) => api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  resetUserPassword: (id: string, password?: string) =>
    api<{ reset: boolean; temporaryPassword: string }>(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(password ? { password } : {}),
    }),
  bulkUsers: (action: string, userIds: string[]) =>
    api('/api/admin/users/bulk', { method: 'POST', body: JSON.stringify({ action, userIds }) }),

  listSystemUsers: () => api<unknown[]>('/api/admin/system-users'),
  createSystemUser: (data: { email: string; password: string; fullName?: string; role: string }) =>
    api('/api/admin/system-users', { method: 'POST', body: JSON.stringify(data) }),
  updateSystemUser: (id: string, data: Record<string, unknown>) =>
    api(`/api/admin/system-users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  resetSystemUserPassword: (id: string, password?: string) =>
    api<{ reset: boolean; temporaryPassword: string }>(`/api/admin/system-users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(password ? { password } : {}),
    }),

  listTenants: (params?: { search?: string; status?: string; sort?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.status) q.set('status', params.status);
    if (params?.sort) q.set('sort', params.sort);
    if (params?.page) q.set('page', String(params.page));
    q.set('limit', String(params?.limit ?? 500));
    return api<{ tenants: unknown[]; total: number; byManager?: Array<{ managerId: string | null; managerName: string; tenants: unknown[] }> }>(
      `/api/admin/tenants?${q}`
    );
  },
  bulkTenants: (action: string, tenantIds: string[]) =>
    api('/api/admin/tenants/bulk', { method: 'POST', body: JSON.stringify({ action, tenantIds }) }),
  createTenant: (data: Record<string, unknown>) =>
    api('/api/admin/tenants', { method: 'POST', body: JSON.stringify(data) }),
  getTenant: (id: string) => api<unknown>(`/api/admin/tenants/${id}`),
  updateTenant: (id: string, data: Record<string, unknown>) =>
    api(`/api/admin/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTenant: (id: string) => api(`/api/admin/tenants/${id}`, { method: 'DELETE' }),
  /** Permanent delete — requires confirmSlug matching the tenant slug. Cascades users and tenant data. */
  purgeTenant: (id: string, confirmSlug: string) =>
    api<{ deleted: boolean; slug: string; usersDeleted: number }>(`/api/admin/tenants/${id}/purge`, {
      method: 'POST',
      body: JSON.stringify({ confirmSlug }),
    }),

  getIntegrations: (id: string) => api<unknown[]>(`/api/admin/tenants/${id}/integrations`),
  saveIntegration: (id: string, sourceType: string, credentials: Record<string, unknown>) =>
    api(`/api/admin/tenants/${id}/integrations/${sourceType}`, {
      method: 'PUT',
      body: JSON.stringify({ credentials }),
    }),
  testIntegration: (id: string, sourceType: string, credentials?: Record<string, unknown>) =>
    api(`/api/admin/tenants/${id}/integrations/${sourceType}/test`, {
      method: 'POST',
      body: JSON.stringify({ credentials }),
    }),
  syncIntegration: (id: string, sourceType: string) =>
    api(`/api/admin/tenants/${id}/integrations/${sourceType}/sync`, { method: 'POST' }),

  probeWialon: (credentials: Record<string, unknown>) =>
    api<WialonProbeResult>('/api/admin/wialon/probe', {
      method: 'POST',
      body: JSON.stringify({ credentials }),
    }),
  getWialonCenterStatus: () =>
    api<{
      configured: boolean;
      connected: boolean;
      verifiedAt: string | null;
      lastError: string | null;
      meta: Record<string, unknown> | null;
      assignedAccountCount?: number;
      motherAccountCount?: number;
      motherAccounts?: WialonMotherAccount[];
    }>('/api/admin/centers/wialon'),
  getLocoNavCenterStatus: () =>
    api<{
      sourceType: 'loconav';
      configured: boolean;
      connected: boolean;
      tenantCount: number;
      connectedTenants: number;
      totalAssets: number;
      webhookNote?: string;
      tenants: Array<{
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        isActive: boolean;
        verifiedAt: string | null;
        lastSyncAt: string | null;
        lastError: string | null;
        assetCount: number;
        alerts24h: number;
      }>;
    }>('/api/admin/centers/loconav'),
  getTrackSolidCenterStatus: () =>
    api<{
      sourceType: 'tracksolid';
      configured: boolean;
      connected: boolean;
      tenantCount: number;
      connectedTenants: number;
      totalAssets: number;
      webhookNote?: string;
      tenants: Array<{
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        isActive: boolean;
        verifiedAt: string | null;
        lastSyncAt: string | null;
        lastError: string | null;
        assetCount: number;
        alerts24h: number;
      }>;
    }>('/api/admin/centers/tracksolid'),
  listWialonMotherAccounts: () =>
    api<{ mothers: WialonMotherAccount[]; count: number }>('/api/admin/centers/wialon/mothers'),
  createWialonMotherAccount: (data: { name: string; token: string; baseUrl?: string }) =>
    api<{ mother: WialonMotherAccount }>('/api/admin/centers/wialon/mothers', {
      method: 'POST',
      body: JSON.stringify({ credentials: data }),
    }),
  updateWialonMotherAccount: (
    motherId: string,
    data: { name?: string; token?: string; baseUrl?: string; isActive?: boolean }
  ) =>
    api<{ mother: WialonMotherAccount }>(`/api/admin/centers/wialon/mothers/${motherId}`, {
      method: 'PUT',
      body: JSON.stringify({ credentials: data }),
    }),
  deleteWialonMotherAccount: (motherId: string) =>
    api<{ deleted: boolean }>(`/api/admin/centers/wialon/mothers/${motherId}`, { method: 'DELETE' }),
  testWialonMotherAccount: (motherId: string) =>
    api<{ connected: boolean; probe: WialonProbeResult }>(
      `/api/admin/centers/wialon/mothers/${motherId}/test`,
      { method: 'POST' }
    ),
  saveWialonCenter: (credentials: Record<string, unknown>) =>
    api('/api/admin/centers/wialon', {
      method: 'PUT',
      body: JSON.stringify({ credentials }),
    }),
  getWialonCenterHierarchy: (motherId?: string) =>
    api<WialonProbeResult & { motherAccountId?: string }>(
      `/api/admin/centers/wialon/hierarchy${motherId ? `?motherId=${encodeURIComponent(motherId)}` : ''}`,
      { timeoutMs: 90_000 }
    ),
  getWialonCenterAccount: (accountId: string, motherId?: string) =>
    api<{
      accountId: number;
      accountName: string;
      motherAccountId?: string;
      unitCount: number;
      userCount: number;
      users: Array<{ id: number; name: string; email?: string }>;
      sampleUnits: string[];
      assignedTenant: { tenantId: string; tenantName: string; tenantSlug: string } | null;
    }>(
      `/api/admin/centers/wialon/accounts/${accountId}${motherId ? `?motherId=${encodeURIComponent(motherId)}` : ''}`,
      { timeoutMs: 120_000 }
    ),
  testWialonCenterAccount: (accountId: string, exceptTenantId?: string, motherAccountId?: string) =>
    api<{ ok: boolean; unitCount: number; userCount: number }>(
      `/api/admin/centers/wialon/accounts/${accountId}/test`,
      {
        method: 'POST',
        body: JSON.stringify({ exceptTenantId, motherAccountId }),
        timeoutMs: 120_000,
      }
    ),
  getWialonCenterUnits: (accountId?: string, motherId?: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set('accountId', accountId);
    if (motherId) params.set('motherId', motherId);
    const q = params.toString();
    return api<{ units: unknown[]; count: number }>(
      `/api/admin/centers/wialon/live/units${q ? `?${q}` : ''}`
    );
  },
  execWialonCenterReport: (
    payload: {
      reportResourceId: number;
      reportTemplateId: number;
      reportObjectId: number;
      from: number;
      to: number;
    },
    accountId?: string,
    motherId?: string
  ) => {
    const params = new URLSearchParams();
    if (accountId) params.set('accountId', accountId);
    if (motherId) params.set('motherId', motherId);
    const q = params.toString();
    return api(`/api/admin/centers/wialon/live/reports/exec${q ? `?${q}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  sendWialonCenterCommand: (unitId: number, commandName: string, accountId?: string, motherId?: string) => {
    const params = new URLSearchParams();
    if (accountId) params.set('accountId', accountId);
    if (motherId) params.set('motherId', motherId);
    const q = params.toString();
    return api(`/api/admin/centers/wialon/live/units/${unitId}/commands${q ? `?${q}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({ commandName }),
    });
  },

  getWialonHierarchy: (tenantId: string) =>
    api<WialonProbeResult>(`/api/admin/tenants/${tenantId}/wialon/hierarchy`),
  linkWialonAccount: (
    tenantId: string,
    accountId: string,
    accountName?: string,
    wialonUserIds?: number[],
    motherAccountId?: string
  ) =>
    api<{
      accountId: number;
      accountName: string;
      unitCount: number;
      userCount: number;
      previousAccountId?: number | null;
      accountChanged?: boolean;
      reportsReset?: boolean;
      syncOk?: boolean;
      syncStatus?: 'pending' | 'running' | 'ok' | 'error';
      syncQueued?: boolean;
      syncWarning?: string;
      provision: { created: number; updated: number; deactivated: number };
      sync: {
        vehicles: number;
        drivers: number;
        geofences: number;
        usersCreated?: number;
        usersUpdated?: number;
        usersTotal?: number;
      };
    }>(`/api/admin/tenants/${tenantId}/wialon/link-account`, {
      method: 'POST',
      body: JSON.stringify({ accountId, accountName, wialonUserIds, motherAccountId }),
      // Link is save-first; response should be seconds, not minutes.
      timeoutMs: 45_000,
    }),
  getWialonAccountUnits: (tenantId: string, accountId: string) =>
    api<{ count: number; units: Array<{ id: number; name: string }> }>(
      `/api/admin/tenants/${tenantId}/wialon/accounts/${accountId}/units`
    ),
  getWialonOverview: () =>
    api<{
      count: number;
      tenants: Array<{
        tenantId: string;
        tenantName: string;
        accountName?: string;
        accountId?: string;
        operateAs?: string;
        connected: boolean;
        accountTier?: string;
        counts?: Record<string, number>;
        lastSyncAt?: string;
        lastError?: string;
        previewAssetCount?: number;
      }>;
    }>('/api/admin/wialon/overview'),
  getTenantWialonCapabilities: (tenantId: string) =>
    api<unknown>(`/api/admin/tenants/${tenantId}/wialon/capabilities`),
  getTenantWialonRoutes: (tenantId: string) =>
    api<{ routes: Array<{ id: number; name: string }>; count: number }>(
      `/api/admin/tenants/${tenantId}/wialon/routes`
    ),
  tenantWialonApi: (tenantId: string, svc: string, params: Record<string, unknown> = {}) =>
    api<unknown>(`/api/admin/tenants/${tenantId}/wialon/api`, {
      method: 'POST',
      body: JSON.stringify({ svc, params }),
    }),
  getRecommendedModules: (id: string) =>
    api<Array<{ moduleKey: string; label: string; recommended: boolean; reason: string }>>(
      `/api/admin/tenants/${id}/modules/recommended`
    ),
  activateTenant: (id: string) =>
    api<{
      status: string;
      verifiedIntegrations: number;
      integrationsReady: boolean;
      warnings: string[];
    }>(`/api/admin/tenants/${id}/activate`, { method: 'POST' }),

  getModules: (id: string) => api<TenantModule[]>(`/api/admin/tenants/${id}/modules`),
  updateModules: (id: string, modules: Array<{ key: string; isEnabled: boolean; isVisible?: boolean }>) =>
    api(`/api/admin/tenants/${id}/modules`, {
      method: 'PUT',
      body: JSON.stringify({ modules }),
    }),
  getTenantWialonReportCatalog: (id: string) =>
    api<{
      templates: Array<{
        resourceId: number;
        resourceName: string;
        templateId: number;
        templateName: string;
        module: string;
        isGroupReport: boolean;
        fallback?: boolean;
      }>;
      modules: Array<{ module: string; count: number }>;
      count: number;
    }>(`/api/admin/tenants/${id}/wialon/reports/catalog`),
  getFuelModuleConfig: (id: string) =>
    api<{
      tenantId: string;
      selectedReports: Array<{
        resourceId: number;
        templateId: number;
        templateName: string;
        module?: string;
        isGroupReport?: boolean;
      }>;
      visibleColumns: string[];
      columnsByCategory?: Partial<Record<'vehicle' | 'generator' | 'machinery', string[]>>;
      fuelPricePerLiter?: number | null;
      updatedAt: string | null;
    }>(`/api/admin/tenants/${id}/fuel-module-config`),
  saveFuelModuleConfig: (
    id: string,
    data: {
      selectedReports: Array<{
        resourceId: number;
        templateId: number;
        templateName: string;
        module?: string;
        isGroupReport?: boolean;
      }>;
      visibleColumns: string[];
      columnsByCategory?: Partial<Record<'vehicle' | 'generator' | 'machinery', string[]>>;
      fuelPricePerLiter?: number | null;
    },
  ) =>
    api(`/api/admin/tenants/${id}/fuel-module-config`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  listFuelStationSheets: (id: string) =>
    api<{
      uploads: Array<{
        id: string;
        fileName: string;
        periodFrom: string | null;
        periodTo: string | null;
        rowCount: number;
        importedCount: number;
        skippedCount: number;
        createdAt: string;
        notes: string | null;
      }>;
    }>(`/api/admin/tenants/${id}/fuel-station-sheets`),

  uploadFuelStationSheet: (tenantId: string, file: File, notes?: string) =>
    new Promise<{
      uploadId: string;
      fileName: string;
      periodFrom: string | null;
      periodTo: string | null;
      rowCount: number;
      importedCount: number;
      skippedCount: number;
    }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = reader.result as string;
          const result = await api<{
            uploadId: string;
            fileName: string;
            periodFrom: string | null;
            periodTo: string | null;
            rowCount: number;
            importedCount: number;
            skippedCount: number;
          }>(`/api/admin/tenants/${tenantId}/fuel-station-sheets`, {
            method: 'POST',
            body: JSON.stringify({
              fileName: file.name,
              mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              data,
              notes,
            }),
          });
          resolve(result);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }),

  deleteFuelStationSheet: (tenantId: string, uploadId: string) =>
    api(`/api/admin/tenants/${tenantId}/fuel-station-sheets/${uploadId}`, { method: 'DELETE' }),

  listTenantUsers: (id: string) => api<unknown[]>(`/api/admin/tenants/${id}/users`),
  listTenantWialonUsers: (id: string) =>
    api<{
      accountId: number;
      accountName: string;
      users: Array<{
        id: number;
        name: string;
        email?: string;
        lastLogin?: number;
        provisioned: boolean;
        mamsUserId: string | null;
      }>;
    }>(`/api/admin/tenants/${id}/wialon/users`),
  importTenantUserFromWialon: (
    id: string,
    data: { wialonUserId: number; role?: string; modules?: string[] }
  ) =>
    api(`/api/admin/tenants/${id}/users/from-wialon`, { method: 'POST', body: JSON.stringify(data) }),
  getTenantUser: (tenantId: string, userId: string) =>
    api<unknown>(`/api/admin/tenants/${tenantId}/users/${userId}`),
  createTenantUser: (id: string, data: Record<string, unknown>) =>
    api(`/api/admin/tenants/${id}/users`, { method: 'POST', body: JSON.stringify(data) }),
  updateTenantUser: (
    tenantId: string,
    userId: string,
    data: { fullName?: string; role?: string; isActive?: boolean; modules?: string[] }
  ) =>
    api(`/api/admin/tenants/${tenantId}/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deactivateTenantUser: (tenantId: string, userId: string) =>
    api(`/api/admin/tenants/${tenantId}/users/${userId}`, { method: 'DELETE' }),

  exportTenant: (id: string, include = 'all') =>
    api<unknown>(`/api/admin/tenants/${id}/export?include=${include}`),
  importTenant: (id: string, data: unknown, skipDuplicates = true) =>
    api(`/api/admin/tenants/${id}/import`, { method: 'POST', body: JSON.stringify({ data, skipDuplicates }) }),

  getBackups: (id: string) => api<{ backups: unknown[]; settings: unknown }>(`/api/admin/tenants/${id}/backups`),
  createBackup: (id: string, type = 'full') =>
    api(`/api/admin/tenants/${id}/backups`, { method: 'POST', body: JSON.stringify({ type }) }),

  getTenantAudit: (id: string) => api<unknown[]>(`/api/admin/tenants/${id}/audit`),
  getApiKeys: (id: string) => api<unknown[]>(`/api/admin/tenants/${id}/api-keys`),
  createApiKey: (id: string, data: { name: string; permissions?: string[]; expiresInDays?: number }) =>
    api(`/api/admin/tenants/${id}/api-keys`, { method: 'POST', body: JSON.stringify(data) }),

  uploadTenantFile: (tenantId: string, file: File, fileType: 'logo' | 'favicon' = 'logo') =>
    new Promise<{ publicUrl: string; url: string; persisted?: boolean }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const data = reader.result as string;
          const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : '';
          const mimeGuess: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.gif': 'image/gif',
          };
          const mimeType =
            file.type && file.type !== 'application/octet-stream'
              ? file.type
              : mimeGuess[ext] || 'image/png';
          const result = await api<{ publicUrl: string; url: string; persisted?: boolean }>(
            `/api/admin/tenants/${tenantId}/upload`,
            {
              method: 'POST',
              body: JSON.stringify({ fileName: file.name, mimeType, data, fileType }),
            }
          );
          resolve(result);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }),
};

export function setAuth(token: string, tenantSlug?: string) {
  localStorage.setItem('ufp_token', token);
  if (tenantSlug) {
    localStorage.setItem('ufp_tenant_slug', tenantSlug);
  } else {
    localStorage.removeItem('ufp_tenant_slug');
  }
}

export function clearAuth() {
  localStorage.removeItem('ufp_token');
  localStorage.removeItem('ufp_tenant_slug');
}
