/** Wialon hosting root from ajax API URL (e.g. https://hst-api.wialon.com). */
export function wialonHostFromBaseUrl(baseUrl?: string): string {
  const url = baseUrl || 'https://hst-api.wialon.com/wialon/ajax.html';
  return url.replace(/\/wialon\/ajax\.html\/?$/i, '');
}

/** Public Wialon unit icon URL (requires valid sid when fetched). */
export function wialonUnitIconUrl(host: string, unitId: number, size = 32, ugi = 1): string {
  return `${host}/avl_item_image/${unitId}/${size}/${ugi}.png`;
}

/** Client-relative proxied icon path (auth via Bearer or session cookie). */
export function fleetUnitIconProxyPath(unitId: number, ugi = 1, size = 32): string {
  return `/api/client/wialon/units/${unitId}/icon?size=${size}&v=${ugi}`;
}
