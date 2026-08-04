import { withWialonClient } from './WialonSessionService.js';
import { WialonLiveService } from './WialonLiveService.js';
import { appendChannelToVideoUri, buildLiveCommandParam, buildVideoServiceLiveUrls, findVideoUriInMessages, pickLiveCommand, probeStreamUrl, } from './wialonVideoStream.js';
import { setStreamUpstream } from './wialonStreamCache.js';
function isHlsUrl(url) {
    return /\.m3u8(\?|$)/i.test(url) || url.includes('application/vnd.apple.mpegurl');
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
async function resolveUpstreamUrl(credentials, unitId, channel) {
    return withWialonClient(credentials, async (client) => {
        const commands = await WialonLiveService.getUnitCommands(credentials, unitId).catch(() => []);
        const liveCmd = pickLiveCommand(commands);
        if (liveCmd) {
            const param = buildLiveCommandParam(liveCmd, channel);
            await client.request('unit/exec_cmd', {
                itemId: unitId,
                commandName: liveCmd.name,
                linkType: liveCmd.linkType ?? '',
                param,
                timeout: 60,
                flags: 0,
            });
        }
        try {
            const raw = await client.request('user/get_video_units', {});
            const items = Array.isArray(raw) ? raw : raw?.units;
            if (Array.isArray(items)) {
                const unit = items.find((u) => Number(u.id) === unitId);
                if (unit?.video_uri) {
                    return appendChannelToVideoUri(unit.video_uri, channel);
                }
            }
        }
        catch {
            /* hosting */
        }
        for (let i = 0; i < 8; i++) {
            const fromMsg = await findVideoUriInMessages(client, unitId, channel);
            if (fromMsg)
                return fromMsg;
            if (i < 7)
                await sleep(1500);
        }
        const videoServiceUrl = client.getVideoServiceUrl();
        const sid = client.getSessionId();
        if (videoServiceUrl && sid) {
            const candidates = buildVideoServiceLiveUrls(videoServiceUrl, sid, unitId, channel);
            for (const url of candidates) {
                if (await probeStreamUrl(url))
                    return url;
            }
            return candidates[0];
        }
        throw new Error('Could not resolve a live stream URL from Wialon. Confirm video billing, camera flags, and that the unit is online.');
    });
}
export class WialonVideoStreamService {
    static buildPlaybackPath(unitId, channel, streamType) {
        const suffix = streamType === 'hls' ? 'playlist.m3u8' : 'stream';
        return `/api/client/surveillance/units/${unitId}/cameras/${channel}/live/${suffix}`;
    }
    static async startLiveStream(tenantId, credentials, unitId, channel) {
        const ch = channel > 0 ? channel : 1;
        const upstream = await resolveUpstreamUrl(credentials, unitId, ch);
        const streamType = isHlsUrl(upstream) ? 'hls' : 'progressive';
        const accessToken = setStreamUpstream(tenantId, unitId, ch, upstream);
        const playbackPath = this.buildPlaybackPath(unitId, ch, streamType);
        return {
            streamType,
            playbackUrl: `${playbackPath}?streamToken=${accessToken}`,
            channel: ch,
            unitId,
            startedAt: new Date().toISOString(),
        };
    }
}
