import { Router } from 'express';
import { requireTenant, type TenantRequest } from '../../middleware/tenant.js';
import { requireCommandAccess } from '../../middleware/rbac.js';
import { success, error } from '../../utils/response.js';
import { VideoOrchestrator } from '../../orchestrators/VideoOrchestrator.js';
import { WialonVideoService } from '../../services/WialonVideoService.js';
import { WialonVideoStreamService } from '../../services/WialonVideoStreamService.js';
import {
  fetchUpstream,
  getStreamByAccessToken,
  getStreamUpstream,
  resolveProxyToken,
  rewriteM3u8Playlist,
} from '../../services/wialonStreamCache.js';
import { loadTenantWialonCreds } from '../../services/tenantWialonCredentials.js';
import { query } from '../../config/database.js';
import { toCamelRows } from '../../utils/mapper.js';
import { VideoShareLinkService, type VideoClipRef } from '../../services/VideoShareLinkService.js';

const router = Router();

router.get('/streams', requireTenant, async (req: TenantRequest, res) => {
  const orch = new VideoOrchestrator(req.tenantId!);
  const streams = await orch.listStreams();
  return success(res, streams);
});

router.get('/units', requireTenant, async (req: TenantRequest, res) => {
  try {
    const creds = await loadTenantWialonCreds(req.tenantId!);
    const units = await WialonVideoService.getCachedVideoUnits(req.tenantId!, creds);
    return success(res, {
      units: units.map((u) => ({
        ...u,
        cameras: u.cameras ?? [],
        commands: [],
      })),
      count: units.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/units/:unitId', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    if (Number.isNaN(unitId)) return error(res, 'Invalid unit id');
    const creds = await loadTenantWialonCreds(req.tenantId!);
    const detail = await WialonVideoService.getUnitDetail(creds, unitId);
    return success(res, detail);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/units/:unitId/files', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    if (Number.isNaN(unitId)) return error(res, 'Invalid unit id');
    const fromRaw = req.query.from ? parseInt(String(req.query.from), 10) : undefined;
    const toRaw = req.query.to ? parseInt(String(req.query.to), 10) : undefined;
    // Accept seconds (frontend legacy) or milliseconds
    const from = fromRaw != null ? (fromRaw < 1_000_000_000_000 ? fromRaw * 1000 : fromRaw) : undefined;
    const to = toRaw != null ? (toRaw < 1_000_000_000_000 ? toRaw * 1000 : toRaw) : undefined;
    const creds = await loadTenantWialonCreds(req.tenantId!);
    const files = await WialonVideoService.listVideoFiles(creds, unitId, from, to);
    return success(res, { unitId, files, count: files.length });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/clips/share', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.body?.unitId), 10);
    const source = String(req.body?.source || '');
    if (Number.isNaN(unitId)) return error(res, 'unitId is required');
    if (source !== 'storage' && source !== 'message') {
      return error(res, 'source must be storage or message');
    }

    const clipRef: VideoClipRef = {
      unitId,
      source,
      path: req.body?.path != null ? String(req.body.path) : undefined,
      storageType:
        req.body?.storageType != null ? (parseInt(String(req.body.storageType), 10) as 1 | 2) : undefined,
      messageId: req.body?.messageId != null ? parseInt(String(req.body.messageId), 10) : undefined,
    };

    const link = await VideoShareLinkService.create(req.tenantId!, clipRef, {
      label: req.body?.label != null ? String(req.body.label) : undefined,
      expiresInHours: req.body?.expiresInHours != null ? Number(req.body.expiresInHours) : undefined,
      createdBy: req.user?.id,
    });
    return success(res, link);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/units/:unitId/files/stream', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    if (Number.isNaN(unitId)) return error(res, 'Invalid unit id');
    const path = String(req.query.path || '');
    if (!path) return error(res, 'path query parameter is required');
    const storageType = parseInt(String(req.query.storageType || '2'), 10);
    if (storageType !== 1 && storageType !== 2) return error(res, 'storageType must be 1 or 2');
    const download = req.query.download === '1' || req.query.download === 'true';
    const creds = await loadTenantWialonCreds(req.tenantId!);
    const file = await WialonVideoService.readStorageFile(
      creds,
      unitId,
      storageType as 1 | 2,
      path
    );
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.fileName)}"`
    );
    res.send(file.data);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.patch('/units/:unitId/cameras', requireTenant, requireCommandAccess, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    if (Number.isNaN(unitId)) return error(res, 'Invalid unit id');
    const cameras = req.body?.cameras;
    if (!Array.isArray(cameras) || !cameras.length) return error(res, 'cameras array is required');
    const creds = await loadTenantWialonCreds(req.tenantId!);
    await WialonVideoService.updateVideoSettings(
      creds,
      req.tenantId!,
      unitId,
      cameras.map((c: { channel: number; name: string; flags: number }) => ({
        channel: Number(c.channel),
        name: String(c.name || ''),
        flags: Number(c.flags ?? 0),
      }))
    );
    const detail = await WialonVideoService.getUnitDetail(creds, unitId);
    return success(res, detail);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/units/:unitId/messages/:messageId/file', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    const messageId = parseInt(String(req.params.messageId), 10);
    if (Number.isNaN(unitId) || Number.isNaN(messageId)) return error(res, 'Invalid id');
    const download = req.query.download === '1' || req.query.download === 'true';
    const creds = await loadTenantWialonCreds(req.tenantId!);
    const file = await WialonVideoService.readMessageVideoFile(creds, unitId, messageId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.fileName)}"`
    );
    res.send(file.data);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/units/:unitId/cameras/:channel/live/start', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    const channel = parseInt(String(req.params.channel), 10);
    if (Number.isNaN(unitId) || Number.isNaN(channel)) return error(res, 'Invalid unit or channel');
    const creds = await loadTenantWialonCreds(req.tenantId!);
    const result = await WialonVideoStreamService.startLiveStream(
      req.tenantId!,
      creds,
      unitId,
      channel
    );
    return success(res, result);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

function resolveLiveStreamEntry(req: TenantRequest, unitId: number, channel: number) {
  const streamToken = typeof req.query.streamToken === 'string' ? req.query.streamToken : '';
  if (streamToken) {
    const byToken = getStreamByAccessToken(streamToken);
    if (byToken) return byToken;
  }
  return getStreamUpstream(req.tenantId!, unitId, channel);
}

router.get('/units/:unitId/cameras/:channel/live/playlist.m3u8', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    const channel = parseInt(String(req.params.channel), 10);
    if (Number.isNaN(unitId) || Number.isNaN(channel)) return error(res, 'Invalid unit or channel');
    const entry = resolveLiveStreamEntry(req, unitId, channel);
    if (!entry) return error(res, 'Live stream not started — click Go Live first');
    const upstream = await fetchUpstream(entry.upstreamUrl);
    const isPlaylist =
      /\.m3u8/i.test(entry.upstreamUrl) ||
      upstream.contentType.includes('mpegurl') ||
      upstream.body.toString('utf8', 0, 20).includes('#EXTM3U');
    if (!isPlaylist) {
      res.setHeader('Content-Type', upstream.contentType);
      return res.status(upstream.status).send(upstream.body);
    }
    const streamToken = typeof req.query.streamToken === 'string' ? req.query.streamToken : entry.accessToken;
    const segmentPrefix = `/api/client/surveillance/proxy/segment/${streamToken}/`;
    const rewritten = rewriteM3u8Playlist(upstream.body.toString('utf8'), entry.upstreamUrl, segmentPrefix);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(rewritten);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/units/:unitId/cameras/:channel/live/stream', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    const channel = parseInt(String(req.params.channel), 10);
    if (Number.isNaN(unitId) || Number.isNaN(channel)) return error(res, 'Invalid unit or channel');
    const entry = resolveLiveStreamEntry(req, unitId, channel);
    if (!entry) return error(res, 'Live stream not started — click Go Live first');
    const range = req.headers.range ? String(req.headers.range) : undefined;
    const upstream = await fetchUpstream(entry.upstreamUrl, range);
    res.setHeader('Content-Type', upstream.contentType);
    if (range) res.setHeader('Accept-Ranges', 'bytes');
    res.status(upstream.status === 206 ? 206 : 200);
    return res.send(upstream.body);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/proxy/segment/:streamToken/:segToken', requireTenant, async (req: TenantRequest, res) => {
  try {
    const streamToken = String(req.params.streamToken);
    const entry = getStreamByAccessToken(streamToken);
    if (!entry) return error(res, 'Live stream session expired — click Go Live again');
    const url = resolveProxyToken(String(req.params.segToken));
    if (!url) return error(res, 'Stream segment expired — restart live view');
    const range = req.headers.range ? String(req.headers.range) : undefined;
    const upstream = await fetchUpstream(url, range);
    const textStart = upstream.body.toString('utf8', 0, 20);
    if (textStart.includes('#EXTM3U')) {
      const segmentPrefix = `/api/client/surveillance/proxy/segment/${streamToken}/`;
      const rewritten = rewriteM3u8Playlist(upstream.body.toString('utf8'), url, segmentPrefix);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(rewritten);
    }
    res.setHeader('Content-Type', upstream.contentType);
    if (range) res.setHeader('Accept-Ranges', 'bytes');
    res.status(upstream.status === 206 ? 206 : 200);
    return res.send(upstream.body);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/embed-session', requireTenant, async (req: TenantRequest, res) => {
  try {
    const unitId = req.query.unitId ? parseInt(String(req.query.unitId), 10) : undefined;
    const channel = req.query.channel ? parseInt(String(req.query.channel), 10) : undefined;
    const creds = await loadTenantWialonCreds(req.tenantId!);
    const session = await WialonVideoService.createEmbedSession(
      creds,
      unitId && !Number.isNaN(unitId) ? unitId : undefined,
      channel && !Number.isNaN(channel) ? channel : undefined
    );
    return success(res, session);
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.post('/units/:unitId/commands', requireTenant, requireCommandAccess, async (req: TenantRequest, res) => {
  try {
    const unitId = parseInt(String(req.params.unitId), 10);
    const commandName = String(req.body?.commandName || '');
    if (!commandName) return error(res, 'commandName is required');
    const param = req.body?.param != null ? String(req.body.param) : undefined;
    const creds = await loadTenantWialonCreds(req.tenantId!);
    const result = await WialonVideoService.sendVideoCommand(creds, unitId, commandName, param);
    return success(res, { unitId, commandName, result });
  } catch (e) {
    return error(res, (e as Error).message);
  }
});

router.get('/violations', requireTenant, async (req: TenantRequest, res) => {
  const limit = parseInt(String(req.query.limit || '50'), 10);
  const unitIdFilter = req.query.unitId ? parseInt(String(req.query.unitId), 10) : undefined;
  const includeClips = req.query.includeClips !== '0';

  const { rows: eco } = await query(
    `SELECT id, unit_id, unit_name, violation_type as type, severity, occurred_at, driver_name, 'eco' as source
     FROM eco_driving_violations WHERE tenant_id = $1 ORDER BY occurred_at DESC LIMIT $2`,
    [req.tenantId, limit]
  );
  const { rows: alerts } = await query(
    `SELECT a.id, a.title, a.type, a.severity, a.occurred_at, a.video_url, a.source_type as source,
            am.external_id as unit_id, ast.name as unit_name
     FROM alerts a
     LEFT JOIN asset_mappings am ON am.asset_id = a.asset_id AND am.source_type = 'wialon'
     LEFT JOIN assets ast ON ast.id = a.asset_id
     WHERE a.tenant_id = $1 AND (a.video_url IS NOT NULL OR am.external_id IS NOT NULL)
     ORDER BY a.occurred_at DESC LIMIT $2`,
    [req.tenantId, limit]
  );

  type ViolationRow = Record<string, unknown> & {
    unitId?: string | number;
    clip?: VideoClipRef;
  };

  const combined: ViolationRow[] = [
    ...toCamelRows(eco).map((r) => ({
      ...r,
      category: 'driving',
      unitId: (r as Record<string, unknown>).unitId,
      violationType: (r as Record<string, unknown>).type,
    })),
    ...toCamelRows(alerts).map((r) => ({
      ...r,
      category: (r as Record<string, unknown>).videoUrl ? 'video' : 'alert',
    })),
  ];

  if (includeClips && unitIdFilter != null && !Number.isNaN(unitIdFilter)) {
    try {
      const creds = await loadTenantWialonCreds(req.tenantId!);
      const toMs = Date.now();
      const fromMs = toMs - 30 * 24 * 3600_000;
      const files = await WialonVideoService.listVideoFiles(creds, unitIdFilter, fromMs, toMs);
      for (const f of files.filter((file) => file.source === 'message' && file.messageId != null)) {
        combined.push({
          id: f.id,
          title: f.eventType || f.name,
          type: 'video_clip',
          severity: 'info',
          occurredAt: f.occurredAt,
          unitId: unitIdFilter,
          unitName: undefined,
          source: 'wialon',
          category: 'video',
          clip: {
            unitId: unitIdFilter,
            source: 'message',
            messageId: f.messageId,
          },
        });
      }
    } catch {
      /* Wialon clips optional when tenant not linked */
    }
  }

  const filtered =
    unitIdFilter != null && !Number.isNaN(unitIdFilter)
      ? combined.filter((r) => String(r.unitId ?? '') === String(unitIdFilter))
      : combined;

  filtered.sort((a, b) => {
    const aTime = new Date(String(a.occurredAt || 0)).getTime();
    const bTime = new Date(String(b.occurredAt || 0)).getTime();
    return bTime - aTime;
  });

  return success(res, filtered.slice(0, limit));
});

export default router;
