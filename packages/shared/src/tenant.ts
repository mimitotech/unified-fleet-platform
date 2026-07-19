export interface Tenant {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  isActive: boolean;
}

export interface DataSourceConfig {
  id: string;
  tenantId: string;
  sourceType: 'wialon' | 'loconav' | 'tracksolid';
  isActive: boolean;
  lastSyncAt?: string;
}

export type UserRole = 'super_admin' | 'platform_admin' | 'tenant_admin' | 'manager' | 'operator' | 'viewer';

export interface User {
  id: string;
  tenantId?: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}
