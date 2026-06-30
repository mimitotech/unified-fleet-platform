const API_URL = import.meta.env.VITE_API_URL || '';

function getToken(): string | null {
  return localStorage.getItem('ufp_token');
}

function getTenantSlug(): string | null {
  return localStorage.getItem('ufp_tenant_slug');
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const tenantSlug = getTenantSlug();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json.data as T;
}

export const authApi = {
  login: (email: string, password: string) =>
    api<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => api<User>('/api/auth/me'),
};

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantId?: string;
  isActive: boolean;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  logoUrl?: string;
  faviconUrl?: string;
}

export interface TenantModule {
  moduleKey: string;
  label: string;
  icon?: string;
  sources: string[];
  isEnabled: boolean;
}

export interface Driver {
  id: string;
  name: string;
  licenseNumber: string;
  phone: string;
  email?: string;
  status: string;
  assignedAssetId?: string;
  assignedAssetName?: string;
  assignedAssetPlate?: string;
}

export interface DriverStats {
  total: number;
  available: number;
  driving: number;
  offDuty: number;
}

export interface FleetRoute {
  id: string;
  name: string;
  status: string;
  assetName?: string;
  assetPlate?: string;
  driverName?: string;
  startTime: string;
  endTime?: string;
  distance: number;
  eta?: string;
  color: string;
  estimatedDuration: number;
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
}

export interface EmissionsMetrics {
  totalFuelLiters: number;
  totalMileageKm: number;
  co2Kg: number;
  co2PerKm: number;
  violationCount: number;
  complianceStatus: string;
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

export interface ReportType {
  id: string;
  label: string;
  format: string;
}

export const clientApi = {
  getTenant: () => api<TenantInfo>('/api/client/tenant'),
  getModules: () => api<TenantModule[]>('/api/client/modules'),
  getKpis: () => api<Record<string, number>>('/api/client/dashboard/kpis'),
  getAssets: () => api<unknown[]>('/api/client/assets'),
  getAssetStatuses: () => api<unknown[]>('/api/client/assets/statuses'),
  getAlerts: (limit = 50) => api<unknown[]>(`/api/client/alerts?limit=${limit}`),
  acknowledgeAlert: (id: string) =>
    api(`/api/client/alerts/${id}/acknowledge`, { method: 'POST' }),

  // Drivers
  getDrivers: () => api<Driver[]>('/api/client/drivers'),
  getDriverStats: () => api<DriverStats>('/api/client/drivers/stats'),
  getDriverPerformance: () => api<unknown[]>('/api/client/drivers/performance'),
  createDriver: (data: Partial<Driver>) =>
    api<Driver>('/api/client/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriver: (id: string, data: Partial<Driver>) =>
    api<Driver>(`/api/client/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Routes
  getRoutes: (status?: string) =>
    api<FleetRoute[]>(`/api/client/routes${status ? `?status=${status}` : ''}`),
  getRouteStats: () => api<RouteStats>('/api/client/routes/stats'),
  getTrips: (limit = 50) => api<TripSummary[]>(`/api/client/routes/trips?limit=${limit}`),
  createRoute: (data: Partial<FleetRoute>) =>
    api<FleetRoute>('/api/client/routes', { method: 'POST', body: JSON.stringify(data) }),
  updateRoute: (id: string, data: Partial<FleetRoute>) =>
    api<FleetRoute>(`/api/client/routes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Fuel
  getFuelTransactions: () => api<FuelTransaction[]>('/api/client/fuel/transactions'),
  getFuelKpis: () => api<Record<string, number>>('/api/client/fuel/kpis'),
  getFuelTrend: () => api<unknown[]>('/api/client/fuel/monthly-trend'),

  // Workshop
  getWorkshopKpis: () => api<WorkshopKpis>('/api/client/workshop/kpis'),
  getInspections: () => api<unknown[]>('/api/client/workshop/inspections'),
  getMaintenanceLogs: () => api<unknown[]>('/api/client/workshop/maintenance'),
  getBreakdowns: () => api<unknown[]>('/api/client/workshop/breakdowns'),

  // Emissions
  getEmissionsMetrics: () => api<EmissionsMetrics>('/api/client/emissions/metrics'),
  getEmissionsByVehicle: () => api<unknown[]>('/api/client/emissions/by-vehicle'),
  getEcoViolations: () => api<EcoViolation[]>('/api/client/emissions/violations'),

  // Surveillance
  getVideoStreams: () => api<VideoStream[]>('/api/client/surveillance/streams'),
  getSurveillanceViolations: () => api<unknown[]>('/api/client/surveillance/violations'),

  // Geofences
  getGeofences: () => api<Geofence[]>('/api/client/geofences'),

  // Reports
  getReportTypes: () => api<ReportType[]>('/api/client/reports/types'),
  getReportData: (type: string) => api<unknown>(`/api/client/reports/data/${type}`),
};

export const adminApi = {
  listTenants: () => api<unknown[]>('/api/admin/tenants'),
  createTenant: (data: Record<string, unknown>) =>
    api('/api/admin/tenants', { method: 'POST', body: JSON.stringify(data) }),
  getTenant: (id: string) => api<unknown>(`/api/admin/tenants/${id}`),
  updateTenant: (id: string, data: Record<string, unknown>) =>
    api(`/api/admin/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  getIntegrations: (id: string) => api<unknown[]>(`/api/admin/tenants/${id}/integrations`),
  saveIntegration: (id: string, sourceType: string, credentials: Record<string, unknown>) =>
    api(`/api/admin/tenants/${id}/integrations/${sourceType}`, {
      method: 'PUT',
      body: JSON.stringify({ credentials }),
    }),
  getModules: (id: string) => api<TenantModule[]>(`/api/admin/tenants/${id}/modules`),
  updateModules: (id: string, modules: Array<{ key: string; isEnabled: boolean }>) =>
    api(`/api/admin/tenants/${id}/modules`, {
      method: 'PUT',
      body: JSON.stringify({ modules }),
    }),
};

export function setAuth(token: string, tenantSlug?: string) {
  localStorage.setItem('ufp_token', token);
  if (tenantSlug) localStorage.setItem('ufp_tenant_slug', tenantSlug);
}

export function clearAuth() {
  localStorage.removeItem('ufp_token');
  localStorage.removeItem('ufp_tenant_slug');
}
