import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, clearAuth, setAuth, clientApi, type User } from '@/lib/api';
import { clearBrandingCache, applyTenantBranding, saveBrandingCache } from '@/lib/tenantBrandingCache';
import { clearAllMapViewports } from '@/lib/mapViewport';
import { clearTenantThemeVars } from '@/lib/tenantBranding';
import { applyDefaultDocumentBranding } from '@/lib/favicon';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Unique per login — remounts maps so each session starts at Kampala then fleet */
  mapSessionKey: string;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => void;
  acceptTerms: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function buildMapSessionKey(user: User | null): string {
  if (!user) return 'guest';
  return `${user.id}:${user.tenantId || user.role}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapSessionKey, setMapSessionKey] = useState('guest');

  useEffect(() => {
    const token = localStorage.getItem('ufp_token');
    if (!token) {
      setIsLoading(false);
      return;
    }
    clearAllMapViewports();
    authApi
      .me()
      .then((u) => {
        setUser(u);
        setMapSessionKey(buildMapSessionKey(u));
        if (u.tenantSlug) setAuth(token, u.tenantSlug);
      })
      .catch(() => clearAuth())
      .finally(() => setIsLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    clearAllMapViewports();
    const prevSlug = localStorage.getItem('ufp_tenant_slug');
    const { token, user: u, tenantSlug } = await authApi.login(email, password);
    if (prevSlug && tenantSlug && prevSlug !== tenantSlug) {
      clearBrandingCache(prevSlug);
    }
    setAuth(token, tenantSlug || undefined);
    localStorage.setItem('ufp_role', u.role);
    setUser(u);
    setMapSessionKey(buildMapSessionKey(u));
    if (tenantSlug) {
      void clientApi.getTenant().then((tenant) => {
        saveBrandingCache(tenant);
        applyTenantBranding(tenant);
      }).catch(() => { /* tenant fetch optional on login */ });
    }
    return u;
  };

  const signOut = () => {
    clearAllMapViewports();
    clearBrandingCache();
    clearTenantThemeVars();
    applyDefaultDocumentBranding();
    clearAuth();
    setUser(null);
    setMapSessionKey('guest');
  };

  const acceptTerms = async () => {
    const { termsAcceptedAt } = await authApi.acceptTerms();
    setUser((prev) => (prev ? { ...prev, termsAcceptedAt } : prev));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        mapSessionKey,
        signIn,
        signOut,
        acceptTerms,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
