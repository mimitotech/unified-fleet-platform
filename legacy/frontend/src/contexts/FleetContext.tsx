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
  const { connected } = useWialonContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !connected) {
      resetFleetService();
      setReady(false);
      return;
    }

    let cancelled = false;
    void getFleetService()
      .initialize()
      .then((ok) => {
        if (!cancelled) setReady(ok);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, connected]);

  return (
    <FleetReadyContext.Provider value={isAuthenticated && connected && ready}>
      {children}
    </FleetReadyContext.Provider>
  );
}

export function useFleetReady(): boolean {
  return useContext(FleetReadyContext);
}
