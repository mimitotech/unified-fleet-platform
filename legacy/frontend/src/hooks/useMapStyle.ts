import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_MAP_PROVIDER,
  DEFAULT_MAP_VIEW,
  getAllMapProviders,
  getDefaultMapSelection,
  getViewsForProvider,
  normalizeMapSelection,
  type MapProviderId,
  type MapViewId,
} from '@/lib/mapConfig';
import { isGoogleMapsConfigured } from '@/lib/googleMaps';

const PROVIDER_KEY = 'mams_map_provider';
const VIEW_KEY = 'mams_map_view';
const LEGACY_STYLE_KEY = 'mams_map_style';
const MAP_STYLE_EVENT = 'mams-map-style-change';
/** One-time bump so existing installs pick up Google Hybrid when a Maps key is configured. */
const GOOGLE_HYBRID_DEFAULT_KEY = 'mams_map_google_hybrid_v1';

export type MapStyleSelection = { provider: MapProviderId; view: MapViewId };

function migrateLegacyStyle(): MapStyleSelection | null {
  if (typeof window === 'undefined') return null;
  const legacy = localStorage.getItem(LEGACY_STYLE_KEY) as MapViewId | null;
  if (!legacy) return null;
  if (legacy === 'satellite') return { provider: 'esri', view: 'satellite' };
  if (legacy === 'hybrid') return { provider: 'esri', view: 'satellite' };
  return { provider: 'osm', view: 'streets' };
}

export function readMapStyleSelection(): MapStyleSelection {
  if (typeof window === 'undefined') {
    return { provider: DEFAULT_MAP_PROVIDER, view: DEFAULT_MAP_VIEW };
  }

  if (isGoogleMapsConfigured() && !localStorage.getItem(GOOGLE_HYBRID_DEFAULT_KEY)) {
    localStorage.setItem(GOOGLE_HYBRID_DEFAULT_KEY, '1');
    localStorage.setItem(PROVIDER_KEY, 'google');
    localStorage.setItem(VIEW_KEY, 'hybrid');
    return { provider: 'google', view: 'hybrid' };
  }

  const migrated = migrateLegacyStyle();
  const savedProvider = localStorage.getItem(PROVIDER_KEY) as MapProviderId | null;
  const savedView = localStorage.getItem(VIEW_KEY) as MapViewId | null;
  const knownProvider = savedProvider && getAllMapProviders().some((p) => p.id === savedProvider);

  if (knownProvider && savedProvider) {
    return normalizeMapSelection(savedProvider, savedView || DEFAULT_MAP_VIEW);
  }
  if (migrated) return normalizeMapSelection(migrated.provider, migrated.view);

  return getDefaultMapSelection();
}

function publishMapStyle(next: MapStyleSelection) {
  localStorage.setItem(PROVIDER_KEY, next.provider);
  localStorage.setItem(VIEW_KEY, next.view);
  window.dispatchEvent(new CustomEvent<MapStyleSelection>(MAP_STYLE_EVENT, { detail: next }));
}

export function useMapStyle() {
  const [selection, setSelectionState] = useState<MapStyleSelection>(readMapStyleSelection);

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<MapStyleSelection>).detail;
      if (detail?.provider) setSelectionState(detail);
      else setSelectionState(readMapStyleSelection());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROVIDER_KEY || e.key === VIEW_KEY) {
        setSelectionState(readMapStyleSelection());
      }
    };
    window.addEventListener(MAP_STYLE_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(MAP_STYLE_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const applySelection = useCallback((next: MapStyleSelection) => {
    setSelectionState(next);
    publishMapStyle(next);
  }, []);

  const setProvider = useCallback((provider: MapProviderId) => {
    setSelectionState((prev) => {
      const views = getViewsForProvider(provider);
      const view = views.some((v) => v.id === prev.view) ? prev.view : views[0]?.id || DEFAULT_MAP_VIEW;
      const next = normalizeMapSelection(provider, view);
      publishMapStyle(next);
      return next;
    });
  }, []);

  const setView = useCallback((view: MapViewId) => {
    setSelectionState((prev) => {
      const next = normalizeMapSelection(prev.provider, view);
      publishMapStyle(next);
      return next;
    });
  }, []);

  const setSelection = useCallback((provider: MapProviderId, view: MapViewId) => {
    const next = normalizeMapSelection(provider, view);
    applySelection(next);
  }, [applySelection]);

  const providers = getAllMapProviders();

  return {
    provider: selection.provider,
    view: selection.view,
    /** @deprecated use view */
    style: selection.view,
    setProvider,
    setView,
    setSelection,
    /** @deprecated use setView */
    setStyle: setView,
    providers,
    views: getViewsForProvider(selection.provider),
  };
}
