import { useAuth } from '@/providers/AuthProvider';

/** Stable key so each user/tenant gets a fresh map on login (Kampala → their fleet) */
export function useMapSessionKey(): string {
  const { mapSessionKey } = useAuth();
  return mapSessionKey;
}
