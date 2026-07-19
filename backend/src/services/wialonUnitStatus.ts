import type { WialonSearchItem } from '../adapters/wialonUtils.js';
import { wialonObjectValues } from '../adapters/wialonUtils.js';

export type WialonHostingStatus = {
  status: 'moving' | 'idle' | 'stopped' | 'offline';
  motionState?: string;
};

const DEFAULT_OFFLINE_SEC = 600;
const DEFAULT_MIN_MOVING_SPEED = 5;

function lastMessageAgeSec(item: WialonSearchItem): number | undefined {
  const now = Math.floor(Date.now() / 1000);
  const t = item.lmsg?.t ?? item.pos?.t;
  if (!t) return undefined;
  return now - t;
}

function minMovingSpeed(item: WialonSearchItem): number {
  const rtd = (item as { rtd?: { minMovingSpeed?: number } }).rtd;
  return rtd?.minMovingSpeed ?? DEFAULT_MIN_MOVING_SPEED;
}

function ignitionFromItem(item: WialonSearchItem): boolean | undefined {
  const sens = item.sens;
  if (sens) {
    for (const s of wialonObjectValues(sens)) {
      const name = (s?.n || '').toLowerCase();
      const type = String(s?.t ?? '').toLowerCase();
      if (!name.includes('ignition') && !name.includes('genset') && type !== 'engine ignition') continue;
      const param = s?.p;
      if (param && item.lmsg?.p) {
        const val = item.lmsg.p[param];
        if (val === 1 || val === '1' || val === true) return true;
        if (val === 0 || val === '0' || val === false) return false;
      }
      if (param && item.prms?.[param]) {
        const val = item.prms[param].v;
        if (val === 1 || val === '1') return true;
        if (val === 0 || val === '0') return false;
      }
    }
  }

  const lmsg = item.lmsg?.p;
  if (lmsg) {
    for (const key of ['ignition', 'ign', 'engine_status', 'acc', 'io_1', 'din1']) {
      if (lmsg[key] !== undefined) {
        const val = lmsg[key];
        return val === 1 || val === '1' || val === true;
      }
    }
  }

  const prms = item.prms;
  if (prms) {
    for (const key of ['ignition', 'ign', 'engine_status', 'acc']) {
      if (prms[key]?.v !== undefined) {
        const val = prms[key].v;
        return val === 1 || val === '1';
      }
    }
  }

  return undefined;
}

function motionStateFromCalc(
  item: WialonSearchItem,
  calcSensors?: Array<{ n: string; v: string }>
): string | undefined {
  if (!calcSensors?.length) return undefined;

  const prp = item.prp || {};
  const motionId = prp.motion_state_sensor_id;
  if (motionId && item.sens) {
    const def = item.sens[motionId];
    if (def?.n) {
      const hit = calcSensors.find((s) => s.n === def.n);
      if (hit?.v) return hit.v;
    }
  }

  const motionNamed = calcSensors.find((s) => /motion state/i.test(s.n));
  return motionNamed?.v;
}

function statusFromMotionStateText(text: string): WialonHostingStatus['status'] | undefined {
  const t = text.toLowerCase();
  if (t.includes('mov')) return 'moving';
  if (t.includes('idle') || t.includes('park')) return 'idle';
  if (t.includes('stop')) return 'stopped';
  if (t.includes('off')) return 'offline';
  return undefined;
}

export type WialonStatusOptions = {
  /** Generators / machinery — never use speed or trip "moving". */
  stationary?: boolean;
};

/**
 * Wialon Hosting status — netconn, message age, trip/motion (vehicles), ignition (all).
 * Stationary assets: offline | idle (engine on) | stopped — never moving.
 */
export function deriveWialonHostingStatus(
  item: WialonSearchItem,
  calcSensors?: Array<{ n: string; v: string }>,
  opts?: WialonStatusOptions,
): WialonHostingStatus {
  const stationary = opts?.stationary === true;
  const motionState = motionStateFromCalc(item, calcSensors);

  if ((item as { netconn?: boolean }).netconn === false) {
    return { status: 'offline', motionState };
  }

  const age = lastMessageAgeSec(item);
  if (age == null || age > DEFAULT_OFFLINE_SEC) {
    return { status: 'offline', motionState };
  }

  if (stationary) {
    const ign = ignitionFromItem(item);
    if (ign === true) return { status: 'idle', motionState: motionState || 'Running' };
    if (ign === false) return { status: 'stopped', motionState: motionState || 'Stopped' };
    if (motionState) {
      const t = motionState.toLowerCase();
      if (t.includes('run') || t.includes('idle') || t.includes('on')) {
        return { status: 'idle', motionState };
      }
      if (t.includes('stop') || t.includes('off')) {
        return { status: 'stopped', motionState };
      }
    }
    return { status: 'stopped', motionState };
  }

  if (motionState) {
    const fromMotion = statusFromMotionStateText(motionState);
    if (fromMotion) return { status: fromMotion, motionState };
  }

  const speed = item.pos?.s ?? 0;
  if (speed > minMovingSpeed(item)) {
    return { status: 'moving', motionState };
  }

  const ign = ignitionFromItem(item);
  if (ign === true) return { status: 'idle', motionState };
  if (ign === false) return { status: 'stopped', motionState };

  return { status: 'stopped', motionState };
}

/** @deprecated use deriveWialonHostingStatus */
export const deriveWialonUnitStatus = (item: WialonSearchItem) =>
  deriveWialonHostingStatus(item).status;
