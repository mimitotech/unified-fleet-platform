const LIVE_CMD = /live|stream|qlv|video.?on|camera.?on|start.?video|open.?video|real.?time|preview/i;
export function pickLiveCommand(commands) {
    return commands.find((c) => LIVE_CMD.test(c.name) ||
        LIVE_CMD.test(c.label || '') ||
        LIVE_CMD.test(String(c.type || '')));
}
export function buildLiveCommandParam(command, channel) {
    const base = command?.params?.trim() || '';
    const ch = String(channel > 0 ? channel : 1);
    if (base.includes('{camera}'))
        return base.replace(/\{camera\}/gi, ch);
    if (base.includes(','))
        return `${base.split(',')[0]},${ch}`;
    if (base && /^\d+$/.test(base))
        return ch;
    if (base)
        return `${base},${ch}`;
    return ch;
}
function readParam(params, keys) {
    for (const k of keys) {
        const v = params[k];
        if (v != null && String(v).trim())
            return String(v).trim();
    }
    return '';
}
function messageChannel(params) {
    const raw = readParam(params, ['cha_n', 'channel', 'ch', 'camera', 'cam']);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}
export function extractVideoUriFromParams(params, channel) {
    if (!params)
        return null;
    const ch = messageChannel(params);
    if (channel != null && ch > 0 && ch !== channel)
        return null;
    const uri = readParam(params, [
        'video_uri',
        'video uri',
        'video_url',
        'video url',
        'url',
        'hls',
        'm3u8',
        'stream_url',
        'stream url',
    ]);
    if (!uri)
        return null;
    if (/^https?:\/\//i.test(uri) || uri.startsWith('//'))
        return uri;
    if (uri.startsWith('/'))
        return uri;
    return null;
}
export function appendChannelToVideoUri(videoUri, channel) {
    if (!videoUri || channel <= 0)
        return videoUri;
    if (/channel[=\/]/i.test(videoUri) || /ch[=\/]/i.test(videoUri))
        return videoUri;
    const sep = videoUri.includes('?') ? '&' : '?';
    return `${videoUri}${sep}channel=${channel}`;
}
/** Candidate Wialon Hosting video-service live URLs (from token/login video_service_url). */
export function buildVideoServiceLiveUrls(videoServiceUrl, sid, unitId, channel) {
    const base = videoServiceUrl.replace(/\/+$/, '');
    const q = `sid=${encodeURIComponent(sid)}&itemId=${unitId}&channel=${channel}`;
    return [
        `${base}/live?${q}`,
        `${base}/live/${unitId}/${channel}?sid=${encodeURIComponent(sid)}`,
        `${base}/hls/${unitId}/${channel}/index.m3u8?sid=${encodeURIComponent(sid)}`,
        `${base}/api/live?${q}`,
        `${base}/stream?${q}`,
    ];
}
export async function findVideoUriInMessages(client, unitId, channel) {
    try {
        await client.request('messages/load_last', {
            itemId: unitId,
            flags: 0,
            flagsMask: 0,
            loadCount: 120,
        });
        const res = await client.request('messages/get_messages', { indexFrom: 0, indexTo: 119 });
        for (const m of res.messages || []) {
            const uri = extractVideoUriFromParams(m.p, channel);
            if (uri)
                return uri;
        }
    }
    catch {
        /* optional */
    }
    finally {
        await client.request('messages/unload', {}).catch(() => undefined);
    }
    return null;
}
export async function probeStreamUrl(url) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: { Range: 'bytes=0-1' },
        });
        clearTimeout(timer);
        return res.ok || res.status === 206;
    }
    catch {
        return false;
    }
}
