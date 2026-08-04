import { withWialonClient } from './WialonSessionService.js';
import { wialonHostFromBaseUrl } from './wialonIcon.js';
/** ~11 m bucket + 30 min TTL — shared across report/map requests. */
const geocodeCache = new Map();
const GEOCODE_TTL_MS = 30 * 60_000;
/**
 * Ethiopic / other non-Latin scripts occasionally appear in OSM POI names
 * (e.g. "URSB መዛገጃቤት" at Baskerville Ave, Kampala). Strip those glyphs so
 * client reports stay readable in Latin script.
 */
const NON_LATIN_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0E00-\u0E7F\u0E80-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u10A0-\u10FF\u1200-\u137F\u1380-\u139F\u13A0-\u13FF\u1400-\u167F\u1680-\u169F\u16A0-\u16FF\u1700-\u171F\u1720-\u173F\u1740-\u175F\u1760-\u177F\u1780-\u17FF\u1800-\u18AF\u1900-\u194F\u1950-\u197F\u1980-\u19DF\u19E0-\u19FF\u1A00-\u1A1F\u1A20-\u1AAF\u1B00-\u1B7F\u1B80-\u1BBF\u1BC0-\u1BFF\u1C00-\u1C4F\u1C50-\u1C7F\u2D30-\u2D7F\u2D80-\u2DDF\uA000-\uA48F\uA490-\uA4CF\uA980-\uA9DF\uAA00-\uAA5F\uAA60-\uAA7F\uAA80-\uAADF\uABC0-\uABFF\uAC00-\uD7AF]/gu;
function stripNonLatinScripts(raw) {
    return raw
        .replace(NON_LATIN_SCRIPT, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/(^,\s*)|(,\s*$)/g, '')
        .trim();
}
function sanitizePart(raw) {
    if (!raw)
        return undefined;
    const s = stripNonLatinScripts(String(raw).trim());
    if (!s)
        return undefined;
    if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(s))
        return undefined;
    return s;
}
function normalizeResult(partsIn) {
    const parts = [];
    for (const p of partsIn) {
        const text = sanitizePart(p);
        if (text && !parts.includes(text))
            parts.push(text);
    }
    if (!parts.length)
        return undefined;
    return { address: parts.join(', '), parts };
}
/**
 * Below this many components an address is a region label, not a location
 * ("Wakiso, Uganda"). Worth spending a fallback lookup to do better.
 */
const MIN_DETAIL_PARTS = 3;
/**
 * Nominatim's usage policy caps us at ~1 request/second, and a fleet parked in
 * a thinly mapped area would otherwise fire one lookup per unit at once. Serialise
 * them and remember the misses so a coordinate is only ever tried once per TTL.
 */
const NOMINATIM_MIN_INTERVAL_MS = 1100;
let nominatimChain = Promise.resolve();
let nominatimLastAt = 0;
const nominatimMisses = new Map();
function queuedNominatimReverseGeocode(lat, lng) {
    const key = cacheKey(lat, lng);
    const missedAt = nominatimMisses.get(key);
    if (missedAt && missedAt > Date.now() - GEOCODE_TTL_MS)
        return Promise.resolve(undefined);
    const run = nominatimChain.then(async () => {
        const wait = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - nominatimLastAt);
        if (wait > 0)
            await new Promise((resolve) => setTimeout(resolve, wait));
        nominatimLastAt = Date.now();
        const result = await nominatimReverseGeocode(lat, lng);
        if (!result) {
            nominatimMisses.set(key, Date.now());
            if (nominatimMisses.size > 2000) {
                const first = nominatimMisses.keys().next().value;
                if (first)
                    nominatimMisses.delete(first);
            }
        }
        return result;
    });
    nominatimChain = run.catch(() => undefined);
    return run.catch(() => undefined);
}
function cacheKey(lat, lng) {
    return `${Math.round(lat * 10_000) / 10_000},${Math.round(lng * 10_000) / 10_000}`;
}
function pickText(item) {
    return sanitizePart(item.value || item.text || item.name);
}
/** Reverse geocode via Wialon GIS — same source as Hosting unit card address. */
export async function wialonReverseGeocode(credentials, lat, lng) {
    const full = await wialonReverseGeocodeFull(credentials, lat, lng);
    return full?.address;
}
/** Full Wialon address with road, place, and distance parts combined. */
export async function wialonReverseGeocodeFull(credentials, lat, lng) {
    const key = cacheKey(lat, lng);
    const hit = geocodeCache.get(key);
    if (hit && hit.expires > Date.now()) {
        // Re-sanitize cached entries so older Ethiopic POI names are cleaned after deploy.
        return normalizeResult(hit.result.parts.length ? hit.result.parts : [hit.result.address]) ?? hit.result;
    }
    const fromWialon = await withWialonClient(credentials, async (client) => {
        const sid = client.getSessionId();
        if (!sid)
            return undefined;
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
            if (!res.ok)
                return undefined;
            const data = (await res.json());
            const items = Array.isArray(data) ? data : data.items || [];
            const parts = [];
            for (const item of items) {
                const text = pickText(item);
                if (text && !parts.includes(text))
                    parts.push(text);
            }
            return normalizeResult(parts);
        }
        catch {
            return undefined;
        }
    });
    // Wialon GIS thins out away from mapped roads and can answer with just
    // "Wakiso, Uganda". Nominatim at zoom 18 usually still has the road or
    // village, so take whichever answer is actually more specific. Enrichment
    // runs after the Wialon session is released — it can sit in a rate-limit
    // queue and must not hold a session open while it waits.
    let result = fromWialon;
    if (!result || result.parts.length < MIN_DETAIL_PARTS) {
        const fallback = await queuedNominatimReverseGeocode(lat, lng);
        if (fallback && (!result || fallback.parts.length > result.parts.length)) {
            result = fallback;
        }
    }
    if (result) {
        geocodeCache.set(key, { result, expires: Date.now() + GEOCODE_TTL_MS });
        if (geocodeCache.size > 2000) {
            const first = geocodeCache.keys().next().value;
            if (first)
                geocodeCache.delete(first);
        }
    }
    return result;
}
async function nominatimReverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1&accept-language=en`, {
            headers: {
                Accept: 'application/json',
                'Accept-Language': 'en',
                'User-Agent': 'MAMS-Fleet-Platform/1.0 (fleet map)',
            },
        });
        if (!res.ok)
            return undefined;
        const data = (await res.json());
        const rawParts = [];
        if (data.name)
            rawParts.push(data.name);
        if (data.address) {
            const prefer = [
                'amenity',
                'building',
                'office',
                'road',
                'suburb',
                'neighbourhood',
                'city_district',
                'city',
                'town',
                'county',
                'state',
                'country',
            ];
            for (const k of prefer) {
                const v = data.address[k];
                if (v && !rawParts.includes(v))
                    rawParts.push(v);
            }
        }
        if (!rawParts.length && data.display_name) {
            rawParts.push(...data.display_name.split(',').map((s) => s.trim()).filter(Boolean));
        }
        return normalizeResult(rawParts);
    }
    catch {
        return undefined;
    }
}
