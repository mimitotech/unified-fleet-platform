import { wialonHostFromBaseUrl } from './wialonIcon.js';

/** Derive Wialon Hosting web UI root from the AJAX API URL (e.g. hst-api → hosting). */
export function hostingUrlFromApiBase(baseUrl?: string): string {
  const apiRoot = wialonHostFromBaseUrl(baseUrl);
  if (/hst-api/i.test(apiRoot)) {
    return apiRoot.replace(/hst-api/i, 'hosting');
  }
  if (/^https?:\/\//i.test(apiRoot)) return apiRoot;
  return 'https://hosting.wialon.com';
}

export function buildWialonHostingLoginUrl(hostingUrl: string, authHash: string, lang = 'en'): string {
  const base = hostingUrl.replace(/\/$/, '');
  return `${base}/login.html?access_type=-1&access_token=${encodeURIComponent(authHash)}&lang=${lang}`;
}

/** Deep-link into Wialon Hosting video monitoring for a unit (and optional camera channel). */
export function buildWialonHostingVideoUrl(
  hostingUrl: string,
  authHash: string,
  unitId: number,
  channel?: number,
  lang = 'en'
): string {
  const base = hostingUrl.replace(/\/$/, '');
  const token = encodeURIComponent(authHash);
  const ch = channel != null && channel > 0 ? channel : 1;
  return `${base}/login.html?access_type=-1&access_token=${token}&lang=${lang}&unit_id=${unitId}&camera=${ch}`;
}
