/**
 * Fleet readiness — gates fuel module queries on auth + Wialon connection.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useWialonContext } from '@/hooks/useWialon';
import { getFleetService, resetFleetService } from '@/services/fleet';

const FleetReadyContext = createContext(false);

export function FleetProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { connected, configured, isLoading } = useWialonContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      resetFleetService();
      setReady(false);
      return;
    }

    // Wait for context; once Wialon is configured+connected, unlock fuel queries.
    // Do not block the whole Fuel module on a slow initialize() — that left tabs empty.
    if (isLoading) return;

    if (!configured || !connected) {
      resetFleetService();
      setReady(false);
      return;
    }

    setReady(true);
    void getFleetService().initialize().catch(() => {
      /* still allow live API queries — initialize is best-effort */
    });

    return undefined;
  }, [isAuthenticated, connected, configured, isLoading]);

  return (
    <FleetReadyContext.Provider value={isAuthenticated && connected && ready}>
      {children}
    </FleetReadyContext.Provider>
  );
}

export function useFleetReady(): boolean {
  return useContext(FleetReadyContext);
}
