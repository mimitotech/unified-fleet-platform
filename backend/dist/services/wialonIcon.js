/** Wialon hosting root from ajax API URL (e.g. https://hst-api.wialon.com). */
export function wialonHostFromBaseUrl(baseUrl) {
    const url = baseUrl || 'https://hst-api.wialon.com/wialon/ajax.html';
    return url.replace(/\/wialon\/ajax\.html\/?$/i, '');
}
/** Public Wialon unit icon URL (requires valid sid when fetched). */
export function wialonUnitIconUrl(host, unitId, size = 32, ugi = 1) {
    return `${host}/avl_item_image/${unitId}/${size}/${ugi}.png`;
}
/** Client-relative proxied icon path (auth via Bearer or session cookie). */
export function fleetUnitIconProxyPath(unitId, ugi = 1, size = 32) {
    return `/api/client/wialon/units/${unitId}/icon?size=${size}&v=${ugi}`;
}
