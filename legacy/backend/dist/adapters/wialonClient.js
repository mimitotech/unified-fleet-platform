import { formatWialonError } from './wialonUtils.js';
import { withWialonLoginGate } from '../services/wialonLoginGate.js';
export class WialonClient {
    baseUrl;
    token;
    operateAs;
    sessionId = null;
    sessionUser = null;
    loginMeta = null;
    keepAliveTimer = null;
    constructor(config) {
        this.baseUrl = config.baseUrl || process.env.WIALON_API_URL || 'https://hst-api.wialon.com/wialon/ajax.html';
        this.token = (config.token || '').trim();
        this.operateAs = config.operateAs;
    }
    getSessionId() {
        return this.sessionId;
    }
    getSessionUser() {
        return this.sessionUser;
    }
    getLoginMeta() {
        return this.loginMeta;
    }
    getVideoServiceUrl() {
        const meta = this.loginMeta;
        const url = meta?.video_service_url || meta?.video_service_base_url;
        return url?.trim() || null;
    }
    async connect() {
        if (!this.token)
            throw new Error('Wialon token not configured');
        if (this.sessionId)
            return this.loginMeta;
        return withWialonLoginGate(async () => {
            if (this.sessionId && this.loginMeta)
                return this.loginMeta;
            const loginParams = { token: this.token };
            if (this.operateAs !== undefined && this.operateAs !== null && String(this.operateAs).trim() !== '') {
                const as = this.operateAs;
                loginParams.operateAs = typeof as === 'number' ? as : String(as).trim();
            }
            const params = new URLSearchParams({
                svc: 'token/login',
                params: JSON.stringify(loginParams),
            });
            const res = await fetch(`${this.baseUrl}?${params}`);
            if (!res.ok) {
                throw new Error(`Wialon login HTTP ${res.status} — check WIALON_API_URL (${this.baseUrl})`);
            }
            const data = (await res.json());
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
            }
            catch {
                try {
                    await this.request('core/set_session_property', {
                        prop_name: 'skip_nonactive_items',
                        prop_value: '1',
                    });
                }
                catch {
                    /* some hosts may deny session props — continue; callers also filter by act/dactt */
                }
            }
            return data;
        });
    }
    async request(svc, params) {
        if (!this.sessionId)
            await this.connect();
        const urlParams = new URLSearchParams({
            svc,
            params: JSON.stringify(params),
            sid: this.sessionId,
        });
        const res = await fetch(`${this.baseUrl}?${urlParams}`);
        if (!res.ok) {
            throw new Error(`Wialon API HTTP ${res.status} for ${svc}`);
        }
        const data = await res.json();
        if (data.error === 1) {
            this.sessionId = null;
            await this.connect();
            return this.request(svc, params);
        }
        if (data.error) {
            throw new Error(`Wialon API error: ${formatWialonError(data.error, data.reason)}`);
        }
        return data;
    }
    /**
     * Binary Wialon calls (e.g. report/get_result_chart → PNG).
     * Returns raw bytes, or null when the body is a JSON error object.
     */
    async requestBinary(svc, params, _retried = false) {
        if (!this.sessionId)
            await this.connect();
        const urlParams = new URLSearchParams({
            svc,
            params: JSON.stringify(params),
            sid: this.sessionId,
        });
        const res = await fetch(`${this.baseUrl}?${urlParams}`);
        if (!res.ok) {
            throw new Error(`Wialon API HTTP ${res.status} for ${svc}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        // Session expired / API error often comes back as small JSON instead of PNG.
        if (buf.length >= 2 && buf[0] === 0x7b /* { */) {
            try {
                const data = JSON.parse(buf.toString('utf8'));
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
            }
            catch (e) {
                if (e instanceof Error && e.message.startsWith('Wialon API'))
                    throw e;
            }
            return null;
        }
        if (buf.length < 8)
            return null;
        return buf;
    }
    /** Keep session alive (Wialon default idle timeout ~5 min). */
    startKeepAlive(intervalMs = 2000) {
        this.stopKeepAlive();
        this.keepAliveTimer = setInterval(() => {
            if (!this.sessionId)
                return;
            void this.ping().catch(() => {
                /* reconnect on next request */
            });
        }, intervalMs);
    }
    stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
        }
    }
    async ping() {
        if (!this.sessionId)
            return;
        const urlParams = new URLSearchParams({
            svc: 'avl_evts',
            params: JSON.stringify({}),
            sid: this.sessionId,
        });
        const res = await fetch(`${this.baseUrl}?${urlParams}`);
        if (!res.ok)
            return;
        const data = await res.json();
        if (data.error === 1) {
            this.sessionId = null;
            await this.connect();
        }
    }
    async disconnect() {
        this.stopKeepAlive();
        if (!this.sessionId)
            return;
        try {
            await this.request('core/logout', {});
        }
        catch {
            /* ignore */
        }
        this.sessionId = null;
        this.sessionUser = null;
        this.loginMeta = null;
    }
}
