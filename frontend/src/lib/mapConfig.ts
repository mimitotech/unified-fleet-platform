/** Map tile providers and view modes for fleet maps */

import { isGoogleMapsConfigured } from '@/lib/googleMaps';

export type MapProviderId = 'osm' | 'esri' | 'opentopo' | 'carto' | 'maptiler' | 'google' | 'tianditu';

export type MapViewId = 'streets' | 'satellite' | 'hybrid' | 'terrain' | 'topo' | 'dark' | 'light';

export interface MapTileConfig {
  provider: MapProviderId;
  view: MapViewId;
  label: string;
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom: number;
  maxNativeZoom: number;
  /** Optional second layer (e.g. Tianditu labels over imagery) */
  overlayUrl?: string;
  overlayAttribution?: string;
  overlaySubdomains?: string;
}

export interface MapProviderDef {
  id: MapProviderId;
  label: string;
  description: string;
  views: Array<{ id: MapViewId; label: string }>;
  envKey?: string;
}

const env = (key: string) => import.meta.env[key]?.trim();

export const MAP_PROVIDERS: MapProviderDef[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    description: 'Free community-maintained road map',
    views: [{ id: 'streets', label: 'Streets' }],
  },
  {
    id: 'esri',
    label: 'Esri GIS Map',
    description: 'ArcGIS streets, satellite, and topography',
    views: [
      { id: 'streets', label: 'Streets' },
      { id: 'satellite', label: 'Satellite' },
      { id: 'topo', label: 'Topographic' },
    ],
  },
  {
    id: 'opentopo',
    label: 'OpenTopo GIS',
    description: 'Terrain and elevation (GIS)',
    views: [{ id: 'terrain', label: 'Terrain' }],
  },
  {
    id: 'carto',
    label: 'CARTO',
    description: 'Clean light and dark basemaps',
    views: [
      { id: 'light', label: 'Light' },
      { id: 'dark', label: 'Dark' },
    ],
  },
  {
    id: 'maptiler',
    label: 'MapTiler',
    description: 'High-quality streets and satellite',
    envKey: 'VITE_MAPTILER_KEY',
    views: [
      { id: 'streets', label: 'Streets' },
      { id: 'satellite', label: 'Satellite' },
      { id: 'hybrid', label: 'Hybrid' },
    ],
  },
  {
    id: 'google',
    label: 'Google Maps',
    description: 'Google road and satellite imagery',
    envKey: 'VITE_GOOGLE_MAPS_KEY',
    views: [
      { id: 'streets', label: 'Roadmap' },
      { id: 'satellite', label: 'Satellite' },
      { id: 'hybrid', label: 'Hybrid' },
      { id: 'terrain', label: 'Terrain' },
    ],
  },
  {
    id: 'tianditu',
    label: 'Tianditu (北斗 BeiDou)',
    description: 'China GIS — vector, imagery, and labels',
    envKey: 'VITE_TIANDITU_KEY',
    views: [
      { id: 'streets', label: 'Vector map' },
      { id: 'satellite', label: 'Satellite' },
      { id: 'hybrid', label: 'Satellite + labels' },
    ],
  },
];

export const DEFAULT_MAP_PROVIDER: MapProviderId = isGoogleMapsConfigured() ? 'google' : 'osm';
export const DEFAULT_MAP_VIEW: MapViewId = isGoogleMapsConfigured() ? 'hybrid' : 'streets';

export function getDefaultMapSelection(): { provider: MapProviderId; view: MapViewId } {
  return { provider: DEFAULT_MAP_PROVIDER, view: DEFAULT_MAP_VIEW };
}

export function mapViewToGoogleMutantType(
  view: MapViewId
): 'roadmap' | 'satellite' | 'terrain' | 'hybrid' {
  if (view === 'satellite') return 'satellite';
  if (view === 'hybrid') return 'hybrid';
  if (view === 'terrain') return 'terrain';
  return 'roadmap';
}

/** Active fleet basemap from env default or saved user preference. */
export function getFleetMapTiles(
  provider: MapProviderId = DEFAULT_MAP_PROVIDER,
  view: MapViewId = DEFAULT_MAP_VIEW
): MapTileConfig {
  return getMapTiles(provider, view);
}

/** @deprecated use getFleetMapTiles() — kept for imports that expect a static object */
export const FLEET_MAP_TILES = getFleetMapTiles();

export function getProviderDef(id: MapProviderId): MapProviderDef {
  return MAP_PROVIDERS.find((p) => p.id === id) || MAP_PROVIDERS[0];
}

export function isProviderConfigured(provider: MapProviderDef): boolean {
  if (!provider.envKey) return true;
  if (provider.envKey === 'VITE_GOOGLE_MAPS_KEY') return isGoogleMapsConfigured();
  return Boolean(env(provider.envKey));
}

/** @deprecated use isProviderConfigured */
export function isProviderAvailable(provider: MapProviderDef): boolean {
  return isProviderConfigured(provider);
}

/** All providers shown in the map picker (includes Google & GIS even before API keys are set). */
export function getAllMapProviders(): MapProviderDef[] {
  return MAP_PROVIDERS;
}

/** Providers that have API keys configured (for admin hints only). */
export function getConfiguredProviders(): MapProviderDef[] {
  return MAP_PROVIDERS.filter(isProviderConfigured);
}

export function getAvailableProviders(): MapProviderDef[] {
  return getAllMapProviders();
}

export function getViewsForProvider(providerId: MapProviderId): Array<{ id: MapViewId; label: string }> {
  return getProviderDef(providerId).views;
}

export function normalizeMapSelection(
  provider: MapProviderId,
  view: MapViewId
): { provider: MapProviderId; view: MapViewId } {
  const def = getProviderDef(provider);
  const views = def.views.map((v) => v.id);
  if (views.includes(view)) return { provider, view };
  return { provider, view: views[0] || DEFAULT_MAP_VIEW };
}

export function getMapTiles(
  provider: MapProviderId = DEFAULT_MAP_PROVIDER,
  view: MapViewId = DEFAULT_MAP_VIEW
): MapTileConfig {
  const { provider: p, view: v } = normalizeMapSelection(provider, view);
  const def = getProviderDef(p);
  const viewLabel = def.views.find((x) => x.id === v)?.label || v;

  if (p === 'maptiler') {
    const key = env('VITE_MAPTILER_KEY');
    if (!key) {
      return v === 'satellite' || v === 'hybrid'
        ? getMapTiles('esri', 'satellite')
        : getMapTiles('osm', 'streets');
    }
    const mapId =
      v === 'satellite' ? 'satellite-v2' : v === 'hybrid' ? 'hybrid-v2' : 'streets-v2';
    return {
      provider: p,
      view: v,
      label: `${def.label} · ${viewLabel}`,
      url: `https://api.maptiler.com/maps/${mapId}/{z}/{x}/{y}.png?key=${key}`,
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: v === 'satellite' ? 20 : 19,
      maxNativeZoom: v === 'satellite' ? 20 : 19,
    };
  }

  if (p === 'google') {
    const key = env('VITE_GOOGLE_MAPS_KEY');
    const lyr = v === 'satellite' ? 's' : v === 'hybrid' ? 'y' : v === 'terrain' ? 'p' : 'm';
    const keyParam = key ? `&key=${encodeURIComponent(key)}` : '';
    return {
      provider: p,
      view: v,
      label: `${def.label} · ${viewLabel}${key ? '' : ' (no API key)'}`,
      url: `https://mt{s}.google.com/vt/lyrs=${lyr}&x={x}&y={y}&z={z}${keyParam}`,
      attribution: '&copy; Google',
      subdomains: '0123',
      maxZoom: 20,
      maxNativeZoom: 20,
    };
  }

  if (p === 'tianditu') {
    const key = env('VITE_TIANDITU_KEY');
    if (!key) return getMapTiles('esri', v === 'satellite' || v === 'hybrid' ? 'satellite' : 'streets');
    const subdomains = '01234567';
    const base = `https://t{s}.tianditu.gov.cn/DataServer?x={x}&y={y}&l={z}&tk=${key}`;
    if (v === 'satellite' || v === 'hybrid') {
      return {
        provider: p,
        view: v,
        label: `${def.label} · ${viewLabel}`,
        url: `${base}&T=img_w`,
        attribution: '&copy; <a href="https://www.tianditu.gov.cn/">Tianditu</a>',
        subdomains,
        maxZoom: 18,
        maxNativeZoom: 18,
        overlayUrl: v === 'hybrid' ? `${base}&T=cia_w` : undefined,
        overlayAttribution: '&copy; Tianditu',
        overlaySubdomains: subdomains,
      };
    }
    return {
      provider: p,
      view: v,
      label: `${def.label} · ${viewLabel}`,
      url: `${base}&T=vec_w`,
      attribution: '&copy; <a href="https://www.tianditu.gov.cn/">Tianditu</a>',
      subdomains,
      maxZoom: 18,
      maxNativeZoom: 18,
      overlayUrl: `${base}&T=cva_w`,
      overlayAttribution: '&copy; Tianditu',
      overlaySubdomains: subdomains,
    };
  }

  if (p === 'esri') {
    if (v === 'satellite') {
      return {
        provider: p,
        view: v,
        label: `${def.label} · ${viewLabel}`,
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
        maxNativeZoom: 19,
      };
    }
    if (v === 'topo') {
      return {
        provider: p,
        view: v,
        label: `${def.label} · ${viewLabel}`,
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles &copy; Esri',
        maxZoom: 19,
        maxNativeZoom: 19,
      };
    }
    return {
      provider: p,
      view: 'streets',
      label: `${def.label} · Streets`,
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
      maxNativeZoom: 19,
    };
  }

  if (p === 'opentopo') {
    return {
      provider: p,
      view: v,
      label: `${def.label} · ${viewLabel}`,
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution:
        '&copy; <a href="https://opentopomap.org/">OpenTopoMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      subdomains: 'abc',
      maxZoom: 17,
      maxNativeZoom: 17,
    };
  }

  if (p === 'carto') {
    const style = v === 'dark' ? 'dark_all' : 'light_all';
    return {
      provider: p,
      view: v,
      label: `${def.label} · ${viewLabel}`,
      url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
      maxNativeZoom: 20,
    };
  }

  // OpenStreetMap (default)
  return {
    provider: 'osm',
    view: 'streets',
    label: 'OpenStreetMap · Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: 'abc',
    maxZoom: 19,
    maxNativeZoom: 19,
  };
}

/** Mimito home region — default before fleet positions load */
export const MAP_REGION_DEFAULT = {
  center: [0.3476, 32.5825] as [number, number],
  zoom: 11,
};

export const MAP_DEFAULT_CENTER = MAP_REGION_DEFAULT.center;
export const MAP_DEFAULT_ZOOM = MAP_REGION_DEFAULT.zoom;

export const STATUS_MARKER_COLORS: Record<string, string> = {
  moving: '#16a34a',
  idle: '#ea580c',
  stopped: '#dc2626',
  offline: '#64748b',
};

export function getMapTileOrigins(): string[] {
  return [
    'https://api.maptiler.com',
    'https://a.tile.openstreetmap.org',
    'https://server.arcgisonline.com',
    'https://mt1.google.com',
    'https://t0.tianditu.gov.cn',
  ];
}

/** @deprecated use MapViewId */
export type MapStyleId = MapViewId;
