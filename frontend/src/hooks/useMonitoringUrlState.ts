import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { MonitoringViewMode } from '@/components/fleet/MonitoringViewHeader';

const VIEWS: MonitoringViewMode[] = ['map', 'list', 'tracks', 'violations'];

function parseView(raw: string | null): MonitoringViewMode {
  if (raw && VIEWS.includes(raw as MonitoringViewMode)) return raw as MonitoringViewMode;
  return 'map';
}

/** Bidirectional URL sync for monitoring view + selected unit. */
export function useMonitoringUrlState() {
  const [params, setParams] = useSearchParams();

  const view = parseView(params.get('view'));
  const unitId = params.get('unitId');

  const setView = useCallback(
    (next: MonitoringViewMode) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('view', next);
          return p;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const setUnitId = useCallback(
    (id: string | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (id) p.set('unitId', id);
          else p.delete('unitId');
          return p;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  const selectUnit = useCallback(
    (id: string | null, opts?: { view?: MonitoringViewMode }) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (opts?.view) p.set('view', opts.view);
          if (id) p.set('unitId', id);
          else p.delete('unitId');
          return p;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  return useMemo(
    () => ({ view, unitId, setView, setUnitId, selectUnit }),
    [view, unitId, setView, setUnitId, selectUnit]
  );
}
