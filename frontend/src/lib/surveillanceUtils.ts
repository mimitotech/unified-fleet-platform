const LIVE_CMD = /live|stream|qlv|video.?on|camera.?on|start.?video/i;
const PLAYBACK_CMD = /playback|qpb|play.?back|history.?video/i;

export type VideoCommand = { name: string; label: string; param?: string };

export function findLiveCommand(commands: VideoCommand[]) {
  return commands.find((c) => LIVE_CMD.test(c.name) || LIVE_CMD.test(c.label));
}

export function findPlaybackCommand(commands: VideoCommand[]) {
  return commands.find((c) => PLAYBACK_CMD.test(c.name) || PLAYBACK_CMD.test(c.label));
}

/** Build Wialon MDVR command param with optional camera index and time range. */
export function buildVideoCommandParam(
  command: VideoCommand | undefined,
  opts: { cameraIndex?: number; fromSec?: number; toSec?: number }
): string {
  const base = command?.param?.trim() || '';
  const cam = opts.cameraIndex != null && opts.cameraIndex > 0 ? String(opts.cameraIndex) : '';

  if (opts.fromSec != null && opts.toSec != null) {
    if (base.includes('{') || base.includes(',')) {
      return base
        .replace(/\{from\}/gi, String(opts.fromSec))
        .replace(/\{to\}/gi, String(opts.toSec))
        .replace(/\{camera\}/gi, cam || '0');
    }
    const parts = [opts.fromSec, opts.toSec];
    if (cam) parts.push(Number(cam));
    return parts.join(',');
  }

  if (cam && base) return `${base},${cam}`;
  if (cam) return cam;
  return base;
}
