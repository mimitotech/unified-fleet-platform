import { withWialonClient } from './WialonSessionService.js';
import { WialonLiveService } from './WialonLiveService.js';
import { WialonFleetService } from './WialonFleetService.js';
import { hostingUrlFromApiBase, buildWialonHostingLoginUrl, buildWialonHostingVideoUrl } from './wialonHostingUrl.js';
import { wialonHostFromBaseUrl } from './wialonIcon.js';
import { CacheService } from './CacheService.js';
const VIDEO_CACHE_TTL_MS = 120_000;
const VIDEO_REDIS_TTL_SEC = 120;
const memoryCache = new Map();
const inflight = new Map();
/** Best-effort timestamp from MDVR filename or path segment (YYYYMMDDHHmmss, ISO-like, unix). */
function parseOccurredAtFromName(name) {
    const base = name.split('/').pop() || name;
    const unix = base.match(/\b(1[0-9]{9,12})\b/);
    if (unix) {
        const n = Number(unix[1]);
        if (n > 1_000_000_000_000)
            return new Date(n).toISOString();
        if (n > 1_000_000_000)
            return new Date(n * 1000).toISOString();
    }
    const iso = base.match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_T]?(\d{2})[-_:]?(\d{2})[-_:]?(\d{2})/);
    if (iso) {
        const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4]), Number(iso[5]), Number(iso[6])));
        if (!Number.isNaN(d.getTime()))
            return d.toISOString();
    }
    const compact = base.match(/\b(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\b/);
    if (compact) {
        const yy = Number(compact[1]);
        const year = yy >= 70 ? 1900 + yy : 2000 + yy;
        const d = new Date(Date.UTC(year, Number(compact[2]) - 1, Number(compact[3]), Number(compact[4]), Number(compact[5]), Number(compact[6])));
        if (!Number.isNaN(d.getTime()))
            return d.toISOString();
    }
    return undefined;
}
function inDateRange(iso, fromMs, toMs) {
    if (!iso)
        return true;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t))
        return true;
    return t >= fromMs && t <= toMs;
}
function messageEventLabel(p) {
    if (!p)
        return {};
    const channelRaw = p.channel ?? p.cam ?? p.camera;
    const channel = channelRaw != null ? Number(channelRaw) : undefined;
    const eventType = String(p.event ?? p.type ?? p.name ?? '').trim() || undefined;
    const tag = eventType || (channel ? `Camera ${channel}` : undefined);
    return { tag, eventType, channel: Number.isFinite(channel) ? channel : undefined };
}
/** Wialon Hosting: flag bit 1 = live stream, bit 2 = auto-save on events. */
function parseCamerasFromSettings(raw, includeInactive = false) {
    const settings = raw?.settings;
    if (!Array.isArray(settings))
        return [];
    const cameras = settings.map((s, arrayIndex) => {
        const channel = Number(s.channel ?? arrayIndex + 1);
        const flags = Number(s.flags ?? 0);
        return {
            index: channel - 1,
            channel,
            name: String(s.name || `Camera ${channel}`),
            flags,
            active: Boolean(flags & 1),
            autoSave: Boolean(flags & 2),
        };
    });
    return includeInactive ? cameras : cameras.filter((c) => c.active);
}
function parseLocalVideoUnits(data) {
    const items = Array.isArray(data) ? data : data?.units;
    if (!Array.isArray(items))
        return [];
    const out = [];
    for (const raw of items) {
        const u = raw;
        const camCount = parseInt(String(u.cameras ?? '0'), 10) || 0;
        const cameras = Array.from({ length: Math.max(camCount, u.video_uri ? 1 : 0) }, (_, i) => ({
            index: i,
            channel: i + 1,
            name: camCount > 1 ? `Camera ${i + 1}` : 'Camera',
            flags: 1,
            active: true,
            autoSave: false,
        }));
        if (!cameras.length && !u.video_uri)
            continue;
        out.push({
            id: u.id,
            name: u.name,
            uniqueId: u.unique_id,
            hwType: u.hw_type,
            connected: u.connected === 1,
            cameraCount: cameras.length,
            cameras,
            videoUri: u.video_uri,
            commands: (u.cmds || []).map((c) => ({
                name: c.n,
                label: c.l || c.n,
                linkType: c.c ?? '',
                param: c.p != null ? String(c.p) : '',
            })),
            source: 'wialon_local',
        });
    }
    return out;
}
const VIDEO_CMD = /video|camera|stream|playback|qlv|qpb|qtm|photo|mdvr|dvr|live/i;
function filterVideoCommands(commands) {
    return commands
        .filter((c) => VIDEO_CMD.test(c.name) || VIDEO_CMD.test(c.label || '') || VIDEO_CMD.test(String(c.type || '')))
        .map((c) => ({
        name: c.name,
        label: c.label || c.name,
        linkType: c.linkType ?? '',
        param: c.params != null ? String(c.params) : '',
        type: c.type,
    }));
}
async function resolveVideoUnitStubs(credentials, tenantId) {
    if (tenantId) {
        try {
            const fleet = await WialonFleetService.getCachedLiveFleet(tenantId);
            if (fleet.units.length) {
                return fleet.units.map((u) => ({
                    id: u.id,
                    name: u.name,
                    uid: u.uid,
                    hwName: u.hwName,
                    status: u.status,
                    netconn: u.netconn,
                }));
            }
        }
        catch {
            /* fall through to lightweight search */
        }
    }
    return WialonLiveService.listUnitsBasic(credentials);
}
async function batchVideoSettings(client, chunk) {
    if (!chunk.length)
        return new Map();
    const batch = chunk.map((u) => ({
        svc: 'unit/get_video_settings',
        params: { itemId: u.id },
    }));
    try {
        const res = await client.request('core/batch', { params: batch, flags: 0 });
        const map = new Map();
        res.forEach((item, idx) => {
            if (item && typeof item === 'object' && !('error' in item && item.error)) {
                map.set(chunk[idx].id, item);
            }
        });
        return map;
    }
    catch {
        return new Map();
    }
}
async function listHostingVideoUnits(credentials, tenantId) {
    const stubs = await resolveVideoUnitStubs(credentials, tenantId);
    if (!stubs.length)
        return [];
    const batchSize = 80;
    const chunks = [];
    for (let i = 0; i < stubs.length; i += batchSize) {
        chunks.push(stubs.slice(i, i + batchSize));
    }
    return withWialonClient(credentials, async (client) => {
        const maps = await Promise.all(chunks.map((chunk) => batchVideoSettings(client, chunk)));
        const settingsMap = new Map();
        for (const m of maps) {
            m.forEach((v, k) => settingsMap.set(k, v));
        }
        const videoUnits = [];
        for (const u of stubs) {
            const cameras = parseCamerasFromSettings(settingsMap.get(u.id));
            if (!cameras.length)
                continue;
            videoUnits.push({
                id: u.id,
                name: u.name,
                uniqueId: u.uid,
                hwType: u.hwName,
                connected: u.status !== 'offline' && u.netconn !== false,
                cameraCount: cameras.length,
                cameras,
                commands: [],
                source: 'wialon_hosting',
            });
        }
        return videoUnits;
    });
}
async function fetchVideoUnits(credentials, tenantId) {
    try {
        const raw = await WialonLiveService.getVideoUnits(credentials);
        const local = parseLocalVideoUnits(raw);
        if (local.length)
            return local;
    }
    catch {
        /* Wialon Hosting — fall through */
    }
    return listHostingVideoUnits(credentials, tenantId);
}
export class WialonVideoService {
    static async getCachedVideoUnits(tenantId, credentials) {
        const now = Date.now();
        const mem = memoryCache.get(tenantId);
        if (mem && mem.expires > now)
            return mem.data;
        const cache = new CacheService();
        const redisKey = `video:units:${tenantId}`;
        const cached = await cache.get(redisKey);
        if (cached != null) {
            memoryCache.set(tenantId, { data: cached, expires: now + VIDEO_CACHE_TTL_MS });
            return cached;
        }
        let pending = inflight.get(tenantId);
        if (!pending) {
            pending = fetchVideoUnits(credentials, tenantId).finally(() => inflight.delete(tenantId));
            inflight.set(tenantId, pending);
        }
        const data = await pending;
        memoryCache.set(tenantId, { data, expires: Date.now() + VIDEO_CACHE_TTL_MS });
        void cache.set(redisKey, data, VIDEO_REDIS_TTL_SEC);
        return data;
    }
    static async listVideoUnits(credentials) {
        return fetchVideoUnits(credentials);
    }
    static async getUnitDetail(credentials, unitId) {
        let unit;
        let settings = null;
        try {
            const raw = await WialonLiveService.getVideoUnits(credentials);
            const local = parseLocalVideoUnits(raw).find((u) => u.id === unitId);
            if (local) {
                unit = local;
                const cmds = await WialonLiveService.getUnitCommands(credentials, unitId).catch(() => []);
                unit.commands = cmds.map((c) => ({
                    name: c.name,
                    label: c.label || c.name,
                    linkType: c.linkType ?? '',
                    param: c.params != null ? String(c.params) : '',
                    type: c.type,
                }));
                if (!unit.commands.length && local.commands.length) {
                    unit.commands = local.commands;
                }
                return { ...unit, settings: null, allCameras: unit.cameras };
            }
        }
        catch {
            /* hosting */
        }
        settings = await withWialonClient(credentials, async (client) => client.request('unit/get_video_settings', { itemId: unitId })).catch(() => null);
        const cameras = parseCamerasFromSettings(settings, true);
        const activeCameras = cameras.filter((c) => c.active);
        if (!cameras.length)
            throw new Error('Unit has no Wialon video cameras configured');
        const detail = await WialonLiveService.getUnitDetail(credentials, unitId).catch(() => null);
        const commands = await WialonLiveService.getUnitCommands(credentials, unitId).catch(() => []);
        unit = {
            id: unitId,
            name: detail?.name || `Unit ${unitId}`,
            uniqueId: detail?.uid,
            hwType: detail?.hwName,
            connected: detail?.status !== 'offline',
            cameraCount: activeCameras.length || cameras.length,
            cameras: activeCameras.length ? activeCameras : cameras,
            commands: commands.map((c) => ({
                name: c.name,
                label: c.label || c.name,
                linkType: c.linkType ?? '',
                param: c.params != null ? String(c.params) : '',
                type: c.type,
            })),
            source: 'wialon_hosting',
        };
        return { ...unit, settings, allCameras: cameras };
    }
    static async listVideoFiles(credentials, unitId, fromMs, toMs) {
        const files = [];
        const from = fromMs ?? Date.now() - 30 * 24 * 3600_000;
        const to = toMs ?? Date.now();
        await withWialonClient(credentials, async (client) => {
            for (const storageType of [2, 1]) {
                try {
                    const listing = await client.request('file/list', {
                        itemId: unitId,
                        storageType,
                        path: '',
                        mask: '*.mp4,*.avi,*.mov,*.mkv,*.webm,video*,*video*',
                        recursive: true,
                        fullPath: true,
                    });
                    for (const root of listing || []) {
                        const walk = (nodes, prefix) => {
                            for (const node of nodes || []) {
                                const path = prefix ? `${prefix}/${node.n}` : node.n;
                                if (node.c)
                                    walk(node.c, path);
                                else if (node.s != null) {
                                    const occurredAt = parseOccurredAtFromName(path) ?? parseOccurredAtFromName(node.n);
                                    if (!inDateRange(occurredAt, from, to))
                                        continue;
                                    files.push({
                                        id: `file-${storageType}-${path}`,
                                        name: node.n,
                                        sizeBytes: Number(node.s) || undefined,
                                        path,
                                        storageType,
                                        source: 'storage',
                                        tag: 'storage',
                                        occurredAt,
                                    });
                                }
                            }
                        };
                        walk(root.c || [], root.n || '');
                    }
                }
                catch {
                    /* storage may be empty */
                }
            }
            try {
                await client.request('messages/load_interval', {
                    itemId: unitId,
                    timeFrom: Math.floor(from / 1000),
                    timeTo: Math.floor(to / 1000),
                    flags: 0x0001,
                    flagsMask: 0,
                    loadCount: 500,
                });
                const msgs = await client.request('messages/get_messages', { indexFrom: 0, indexTo: 499 });
                for (const m of msgs.messages || []) {
                    const hasVideo = m.tp === 'video' ||
                        (m.p && Object.keys(m.p).some((k) => /video|file|media|photo/i.test(k)));
                    if (!hasVideo)
                        continue;
                    const occurredAt = new Date(m.t * 1000).toISOString();
                    if (!inDateRange(occurredAt, from, to))
                        continue;
                    const meta = messageEventLabel(m.p);
                    files.push({
                        id: `msg-${m.id ?? m.t}`,
                        name: meta.eventType
                            ? `${meta.eventType} · ${new Date(m.t * 1000).toLocaleString()}`
                            : `Video message ${new Date(m.t * 1000).toLocaleString()}`,
                        occurredAt,
                        path: '',
                        source: 'message',
                        messageId: m.id,
                        tag: meta.tag || 'message',
                        channel: meta.channel,
                        eventType: meta.eventType,
                    });
                }
                await client.request('messages/unload', {}).catch(() => undefined);
            }
            catch {
                /* messages optional */
            }
        });
        return files.sort((a, b) => {
            const at = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
            const bt = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
            return bt - at;
        });
    }
    static async createEmbedSession(credentials, unitId, channel) {
        const hostingUrl = hostingUrlFromApiBase(credentials.baseUrl);
        const apiHost = wialonHostFromBaseUrl(credentials.baseUrl);
        let accessToken = credentials.token?.trim() || '';
        try {
            const hash = await withWialonClient(credentials, async (client) => {
                const res = await client.request('core/create_auth_hash', {});
                return res.authHash?.trim() || '';
            });
            if (hash)
                accessToken = hash;
        }
        catch {
            /* client accounts often lack create_auth_hash — use API token */
        }
        if (!accessToken) {
            throw new Error('No Wialon access token available for video embed');
        }
        const loginUrl = buildWialonHostingLoginUrl(hostingUrl, accessToken);
        const videoUrl = unitId != null
            ? buildWialonHostingVideoUrl(hostingUrl, accessToken, unitId, channel)
            : loginUrl;
        return {
            hostingUrl,
            apiHost,
            authHash: accessToken,
            accessToken,
            loginUrl,
            videoUrl,
            unitId: unitId ?? null,
            channel: channel ?? null,
            expiresInSec: 120,
            videoModuleHint: unitId != null
                ? `Open Wialon Video for unit ${unitId}${channel != null ? ` · camera ${channel}` : ''}.`
                : 'After login, open Monitoring → Video.',
        };
    }
    static async getLiveStreamUrl(credentials, unitId, unit) {
        if (unit?.videoUri)
            return unit.videoUri;
        try {
            const raw = await WialonLiveService.getVideoUnits(credentials);
            const local = parseLocalVideoUnits(raw).find((u) => u.id === unitId);
            if (local?.videoUri)
                return local.videoUri;
        }
        catch {
            /* hosting */
        }
        return undefined;
    }
    static async sendVideoCommand(credentials, unitId, commandName, param) {
        return WialonLiveService.sendUnitCommand(credentials, unitId, commandName, param ?? '');
    }
    static mimeFromPath(path) {
        const ext = path.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'mp4':
                return 'video/mp4';
            case 'webm':
                return 'video/webm';
            case 'mov':
                return 'video/quicktime';
            case 'avi':
                return 'video/x-msvideo';
            case 'mkv':
                return 'video/x-matroska';
            default:
                return 'application/octet-stream';
        }
    }
    static async updateVideoSettings(credentials, tenantId, unitId, cameras) {
        await withWialonClient(credentials, async (client) => {
            await client.request('unit/update_video_settings', {
                itemId: unitId,
                settings: cameras.map((c) => ({
                    channel: c.channel,
                    name: c.name,
                    flags: c.flags,
                })),
            });
        });
        memoryCache.delete(tenantId);
        void new CacheService().del(`video:units:${tenantId}`);
    }
    static async readMessageVideoFile(credentials, unitId, messageId) {
        const res = await withWialonClient(credentials, async (client) => client.request('messages/get_message_file', {
            itemId: unitId,
            msgId: messageId,
            contentType: 2,
        }));
        if (!res.content)
            throw new Error('Wialon returned no message video content');
        const fileName = res.name || `message-${messageId}.mp4`;
        return {
            data: Buffer.from(res.content, 'base64'),
            contentType: this.mimeFromPath(fileName),
            fileName,
        };
    }
    static async readStorageFile(credentials, unitId, storageType, path) {
        const res = await withWialonClient(credentials, async (client) => client.request('file/read', {
            itemId: unitId,
            storageType,
            path,
            contentType: 2,
        }));
        if (!res.content)
            throw new Error('Wialon returned empty file content');
        const fileName = path.split('/').pop() || 'video';
        return {
            data: Buffer.from(res.content, 'base64'),
            contentType: this.mimeFromPath(path),
            fileName,
        };
    }
    static async readClip(credentials, clip) {
        if (clip.source === 'message') {
            if (clip.messageId == null)
                throw new Error('messageId is required');
            return this.readMessageVideoFile(credentials, clip.unitId, clip.messageId);
        }
        if (!clip.path)
            throw new Error('path is required for storage clips');
        return this.readStorageFile(credentials, clip.unitId, clip.storageType ?? 2, clip.path);
    }
}
