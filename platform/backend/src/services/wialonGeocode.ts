import type { WialonCredentialsInput } from './WialonHierarchyService.js';
import { withWialonClient } from './WialonSessionService.js';
import { wialonHostFromBaseUrl } from './wialonIcon.js';

type GeocodeItem = { value?: string; text?: string; name?: string; type?: string };

export type WialonGeocodeResult = {
  address: string;
  parts: string[];
};

/** ~11 m bucket + 30 min TTL — shared across report/map requests. */
const geocodeCache = new Map<string, { result: WialonGeocodeResult; expires: number }>();
const GEOCODE_TTL_MS = 30 * 60_000;

function cacheKey(lat: number, lng: number): string {
  return `${Math.round(lat * 10_000) / 10_000},${Math.round(lng * 10_000) / 10_000}`;
}

function pickText(item: GeocodeItem): string | undefined {
  const v = item.value || item.text || item.name;
  if (!v || !String(v).trim()) return undefined;
  const s = String(v).trim();
  if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(s)) return undefined;
  return s;
}

/** Reverse geocode via Wialon GIS — same source as Hosting unit card address. */
export async function wialonReverseGeocode(
  credentials: WialonCredentialsInput,
  lat: number,
  lng: number
): Promise<string | undefined> {
  const full = await wialonReverseGeocodeFull(credentials, lat, lng);
  return full?.address;
}

/** Full Wialon address with road, place, and distance parts combined. */
export async function wialonReverseGeocodeFull(
  credentials: WialonCredentialsInput,
  lat: number,
  lng: number
): Promise<WialonGeocodeResult | undefined> {
  const key = cacheKey(lat, lng);
  const hit = geocodeCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.result;

  const result = await withWialonClient(credentials, async (client) => {
    const sid = client.getSessionId();
    if (!sid) return undefined;

    const root = wialonHostFromBaseUrl(credentials.baseUrl);
    const host = root.replace(/^https?:\/\//i, '');
    const coords = encodeURIComponent(JSON.stringify([{ lon: lng, lat }]));
    const params = new URLSearchParams({
      coords,
      sid,
      flags: '1255211008',
      city_radius: '10',
      dist_from_unit: '5',
      txt_dist: 'km',
    });
    const url = `https://geocode-maps.wialon.com/${host}/gis_geocode?${params.toString()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) return undefined;
      const data = (await res.json()) as GeocodeItem[] | { items?: GeocodeItem[] };
      const items = Array.isArray(data) ? data : data.items || [];
      const parts: string[] = [];
      for (const item of items) {
        const text = pickText(item);
        if (text && !parts.includes(text)) parts.push(text);
      }
      if (!parts.length) {
        const fallback = await nominatimReverseGeocode(lat, lng);
        if (fallback) return fallback;
        return undefined;
      }
      return { address: parts.join(', '), parts };
    } catch {
      return nominatimReverseGeocode(lat, lng);
    }
  });

  if (result) {
    geocodeCache.set(key, { result, expires: Date.now() + GEOCODE_TTL_MS });
    // Soft bound cache size
    if (geocodeCache.size > 2000) {
      const first = geocodeCache.keys().next().value;
      if (first) geocodeCache.delete(first);
    }
  }
  return result;
}

async function nominatimReverseGeocode(lat: number, lng: number): Promise<WialonGeocodeResult | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { Accept: 'application/json', 'User-Agent': 'MAMS-Fleet-Platform/1.0 (fleet map)' } }
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { display_name?: string };
    const address = data.display_name?.trim();
    if (!address) return undefined;
    const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
    return { address, parts: parts.length ? parts : [address] };
  } catch {
    return undefined;
  }
}
