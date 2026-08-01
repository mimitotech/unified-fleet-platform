import type { User } from '@/lib/api';
import { canAccessAdminPanel } from '@/lib/systemRoles';

export function dashboardPathForRole(role: string): string {
  return canAccessAdminPanel(role) ? '/admin/dashboard' : '/app/dashboard';
}

export function needsTermsAcceptance(user: User | null | undefined): boolean {
  return !!user && !user.termsAcceptedAt;
}

export function postLoginPath(user: User): string {
  const dashboard = dashboardPathForRole(user.role);
  if (needsTermsAcceptance(user)) {
    return `/auth/terms?next=${encodeURIComponent(dashboard)}`;
  }
  return dashboard;
}
