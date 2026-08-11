import { formatWialonError } from './wialonUtils.js';
import { withWialonLoginGate } from '../services/wialonLoginGate.js';

export interface WialonSessionUser {
  id: number;
  nm: string;
  bact?: number;
  uacl?: number;
  crt?: number;
  prp?: Record<string, string>;
}

export interface WialonLoginResponse {
  eid: string;
  au?: string;
  tm?: number;
  user?: WialonSessionUser;
  features?: { unlim?: boolean; svcs?: Record<string, boolean> };
  classes?: Record<string, number>;
  /** Wialon Hosting video service root (from token/login). */
  video_service_url?: string;
  video_service_base_url?: string;
}

export interface WialonClientConfig {
  baseUrl?: string;
  token: string;
  /** Wialon user id or name — token/login operateAs */
  operateAs?: string | number;
}

const WIALON_FETCH_TIMEOUT_MS = Math.min(
  60_000,
  Math.max(8_000, parseInt(process.env.WIALON_FETCH_TIMEOUT_MS || '25000', 10) || 25_000),
);

async function wialonFetch(url: string, timeoutMs = WIALON_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`Wialon request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export class WialonClient {
  private baseUrl: string;
  private token: string;
  private operateAs?: string | number;
  private sessionId: string | null = null;
  private sessionUser: WialonSessionUser | null = null;
  private loginMeta: WialonLoginResponse | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WialonClientConfig) {
    this.baseUrl = config.baseUrl || process.env.WIALON_API_URL || 'https://hst-api.wialon.com/wialon/ajax.html';
    this.token = (config.token || '').trim();
    this.operateAs = config.operateAs;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getSessionUser(): WialonSessionUser | null {
    return this.sessionUser;
  }

  getLoginMeta(): WialonLoginResponse | null {
    return this.loginMeta;
  }

  getVideoServiceUrl(): string | null {
    const meta = this.loginMeta;
    const url = meta?.video_service_url || meta?.video_service_base_url;
    return url?.trim() || null;
  }

  async connect(): Promise<WialonLoginResponse> {
    if (!this.token) throw new Error('Wialon token not configured');
    if (this.sessionId) return this.loginMeta!;

    return withWialonLoginGate(async () => {
      if (this.sessionId && this.loginMeta) return this.loginMeta;

      const loginParams: Record<string, unknown> = { token: this.token };
      if (this.operateAs !== undefined && this.operateAs !== null && String(this.operateAs).trim() !== '') {
        const as = this.operateAs;
        loginParams.operateAs = typeof as === 'number' ? as : String(as).trim();
      }

      const params = new URLSearchParams({
        svc: 'token/login',
        params: JSON.stringify(loginParams),
      });
      const res = await wialonFetch(`${this.baseUrl}?${params}`);
      if (!res.ok) {
        throw new Error(`Wialon login HTTP ${res.status} — check WIALON_API_URL (${this.baseUrl})`);
      }
      const data = (await res.json()) as WialonLoginResponse & { error?: number; reason?: string };
      if (data.error) {
        throw new Error(`Wialon login failed: ${formatWialonError(data.error, data.reason)}`);
      }
      if (!data.eid) {
        throw new Error('Wialon login failed: no session id returned');
      }
      this.sessionId = data.eid;
      this.sessionUser = data.user || null;
      this.loginMeta = data;

      // Hide Wialon-deactivated units (distinct from offline). Offline units still appear.
      try {
        await this.request('core/set_session_property', {
          prop_name: 'skip_nonactive_items',
          prop_value: 1,
        });
      } catch {
        try {
          await this.request('core/set_session_property', {
            prop_name: 'skip_nonactive_items',
            prop_value: '1',
          });
        } catch {
          /* some hosts may deny session props — continue; callers also filter by act/dactt */
        }
      }

      return data;
    });
  }

  async request<T>(svc: string, params: Record<string, unknown>, _retried = false): Promise<T> {
    if (!this.sessionId) await this.connect();
    const urlParams = new URLSearchParams({
      svc,
      params: JSON.stringify(params),
      sid: this.sessionId!,
    });
    const res = await wialonFetch(`${this.baseUrl}?${urlParams}`);
    if (!res.ok) {
      throw new Error(`Wialon API HTTP ${res.status} for ${svc}`);
    }
    const data = await res.json();
    if (data.error === 1) {
      if (_retried) {
        throw new Error(`Wialon API error: ${formatWialonError(1, data.reason)}`);
      }
      this.sessionId = null;
      await this.connect();
      return this.request(svc, params, true);
    }
    if (data.error) {
      throw new Error(`Wialon API error: ${formatWialonError(data.error, data.reason)}`);
    }
    return data as T;
  }

  /**
   * Binary Wialon calls (e.g. report/get_result_chart → PNG).
   * Returns raw bytes, or null when the body is a JSON error object.
   */
  async requestBinary(
    svc: string,
    params: Record<string, unknown>,
    _retried = false,
  ): Promise<Buffer | null> {
    if (!this.sessionId) await this.connect();
    const urlParams = new URLSearchParams({
      svc,
      params: JSON.stringify(params),
      sid: this.sessionId!,
    });
    const res = await wialonFetch(`${this.baseUrl}?${urlParams}`);
    if (!res.ok) {
      throw new Error(`Wialon API HTTP ${res.status} for ${svc}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    // Session expired / API error often comes back as small JSON instead of PNG.
    if (buf.length >= 2 && buf[0] === 0x7b /* { */) {
      try {
        const data = JSON.parse(buf.toString('utf8')) as { error?: number; reason?: string };
        if (data.error === 1) {
          if (_retried) {
            throw new Error(`Wialon API error: ${formatWialonError(1, data.reason)}`);
          }
          this.sessionId = null;
          await this.connect();
          return this.requestBinary(svc, params, true);
        }
        if (data.error) {
          throw new Error(`Wialon API error: ${formatWialonError(data.error, data.reason)}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Wialon API')) throw e;
      }
      return null;
    }
    if (buf.length < 8) return null;
    return buf;
  }

  /** Keep session alive (Wialon default idle timeout ~5 min). */
  startKeepAlive(intervalMs = 45_000): void {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (!this.sessionId) return;
      void this.ping().catch(() => {
        /* reconnect on next request */
      });
    }, intervalMs);
  }

  stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  async ping(): Promise<void> {
    if (!this.sessionId) return;
    const urlParams = new URLSearchParams({
      svc: 'avl_evts',
      params: JSON.stringify({}),
      sid: this.sessionId,
    });
    const res = await wialonFetch(`${this.baseUrl}?${urlParams}`, 15_000);
    if (!res.ok) return;
    const data = await res.json();
    if (data.error === 1) {
      this.sessionId = null;
      await this.connect();
    }
  }

  async disconnect(): Promise<void> {
    this.stopKeepAlive();
    if (!this.sessionId) return;
    try {
      const urlParams = new URLSearchParams({
        svc: 'core/logout',
        params: JSON.stringify({}),
        sid: this.sessionId,
      });
      await wialonFetch(`${this.baseUrl}?${urlParams}`, 10_000);
    } catch {
      /* ignore */
    }
    this.sessionId = null;
    this.sessionUser = null;
    this.loginMeta = null;
  }
}
