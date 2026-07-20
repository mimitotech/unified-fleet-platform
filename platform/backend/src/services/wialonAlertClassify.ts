import type { FleetAlert } from '@ufp/shared';

export type RawMsg = {
  item_id?: number;
  t: number;
  f?: number;
  tp?: string;
  et?: string;
  x?: number;
  y?: number;
  rt?: number;
  p?: Record<string, unknown>;
};

/** Classify Wialon notification / event names into stable alert types. */
export function classifyWialonAlertType(raw: string): string {
  const s = raw.toLowerCase();

  // Driving safety
  if (/harsh\s*brak|hard\s*brak|emergency\s*brak|sudden\s*brak|\bbraking\b|\bbrake\b/.test(s)) {
    return 'harsh_braking';
  }
  if (/harsh\s*accel|hard\s*accel|rapid\s*accel|sudden\s*accel|\bacceleration\b/.test(s)) {
    return 'harsh_acceleration';
  }
  if (/harsh\s*corner|hard\s*turn|cornering|\bturn\b.*viol/.test(s)) return 'harsh_cornering';
  if (/speeding|over\s*speed|speed\s*limit|max\s*speed|speed\s*viol/.test(s)) return 'speeding';
  if (/\bidle\b|idling|excessive\s*idle/.test(s)) return 'idling';
  if (/towing|tow\s*alert|unauthorized\s*move/.test(s)) return 'towing';
  if (/\bsos\b|panic|alarm\s*button|emergency\s*button/.test(s)) return 'sos';
  if (/eco\s*driv|drive\s*rank|reckless|driver\s*viol/.test(s)) return 'eco_violation';

  // Fuel — match before generator so genset unit names don't steal fuel events
  if (/fuel\s*theft|sudden\s*fuel|fuel\s*drop|drain|drained|fuel\s*loss|fuel\s*steal/.test(s)) {
    return 'fuel_theft';
  }
  if (/fuel\s*fill|filling|refuel|fuel\s*up|replenish|tank\s*fill/.test(s)) return 'fuel_filling';
  if (/low\s*fuel|fuel\s*level|fuel\s*alert|fuel\s*sensor|tank\s*low|tank\s*empty/.test(s)) {
    return 'fuel_level';
  }

  // Generators / mains power (stationary assets)
  if (/generat|genset|standby\s*power|backup\s*power/.test(s)) {
    if (/power\s*(off|cut|fail|lost|down)|mains\s*fail|grid\s*fail|utility\s*off|blackout/.test(s)) {
      return 'power_cut';
    }
    if (/power\s*(on|restor|return|up)|mains\s*(on|ok|restor)|grid\s*(on|ok)/.test(s)) {
      return 'power_restore';
    }
    if (/\b(off|stop|shutdown|stopped)\b/.test(s)) return 'generator_off';
    if (/\b(on|start|started|running|run)\b/.test(s)) return 'generator_on';
    return 'generator';
  }
  if (/power\s*(off|cut|fail|lost|down)|mains\s*fail|grid\s*fail|utility\s*off|blackout|outage/.test(s)) {
    return 'power_cut';
  }
  if (/power\s*(on|restor|return)|mains\s*(on|ok|restor)|grid\s*(on|ok)|utility\s*restor/.test(s)) {
    return 'power_restore';
  }

  // Sensors & equipment
  if (/batter|voltage|pwr_ext|pwr_int|low\s*volt|external\s*power/.test(s)) return 'battery';
  if (/temp(erature)?|overheat|coolant|thermostat/.test(s)) return 'temperature';
  if (/door|hatch|cover\s*open|boot\s*open|trunk\s*open/.test(s)) return 'door';
  if (/connect|offline|no\s*gps|gps\s*lost|signal\s*lost|link\s*down|no\s*signal|lost\s*connection/.test(s)) {
    return 'connection';
  }
  if (/maintain|service\s*interval|service\s*due|odometer\s*service/.test(s)) return 'maintenance';
  if (/sensor|analog|digital\s*input|input\s*\d|param\s*alert|lls|counter/.test(s)) return 'sensor';

  // Places / engine
  if (/geofence|geo\s*zone|zone\s*in|zone\s*out|geozone|route\s*control|enter\s*zone|leave\s*zone/.test(s)) {
    return 'geofence';
  }
  if (/ignition\s*on|engine\s*on|acc\s*on/.test(s)) return 'ignition_on';
  if (/ignition\s*off|engine\s*off|acc\s*off/.test(s)) return 'ignition_off';

  // Generic violation leftover
  if (/violation/.test(s)) return 'eco_violation';

  return 'fleet_event';
}

export function severityForAlertType(
  type: string,
  flags?: number,
): FleetAlert['severity'] {
  // Event flag 0x1 = violation
  if (flags != null && (flags & 1) === 1) return 'critical';
  if (
    type === 'fuel_theft' ||
    type === 'sos' ||
    type === 'harsh_braking' ||
    type === 'power_cut' ||
    type === 'generator_off'
  ) {
    return 'critical';
  }
  if (
    type === 'speeding' ||
    type === 'harsh_acceleration' ||
    type === 'harsh_cornering' ||
    type === 'fuel_level' ||
    type === 'battery' ||
    type === 'temperature' ||
    type === 'connection' ||
    type === 'geofence' ||
    type === 'towing' ||
    type === 'idling' ||
    type === 'door' ||
    type === 'sensor'
  ) {
    return 'warning';
  }
  if (
    type === 'fuel_filling' ||
    type === 'ignition_on' ||
    type === 'ignition_off' ||
    type === 'power_restore' ||
    type === 'generator_on' ||
    type === 'maintenance'
  ) {
    return 'info';
  }
  return 'warning';
}

export function normalizeTaskMessages(raw: unknown): RawMsg[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as RawMsg[];
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.messages)) return o.messages as RawMsg[];
    if (o.messages && typeof o.messages === 'object') {
      return Object.values(o.messages as Record<string, RawMsg>);
    }
    // Some Wialon builds return the map at the top level.
    const vals = Object.values(o);
    if (vals.length && vals.every((v) => v && typeof v === 'object' && 't' in (v as object))) {
      return vals as RawMsg[];
    }
  }
  return [];
}

function classificationBlob(m: RawMsg, extras: string[] = []): string {
  const p = m.p || {};
  return [
    ...extras,
    m.et,
    m.tp,
    p.task_evt_name,
    p.name,
    p.notification,
    p.notif_name,
    p.evt_name,
    p.trigger_type,
    p.text,
    p.msg,
    p.task_description,
    p.param,
  ]
    .filter(Boolean)
    .map(String)
    .join(' ');
}

function withUnitLabel(title: string, unitName?: string): string {
  const clean = title.trim() || 'Fleet alert';
  if (!unitName) return clean;
  if (clean.toLowerCase().includes(unitName.toLowerCase())) return clean;
  return `${clean} · ${unitName}`;
}

/** Map any Wialon task / event / triggered-notification message into a FleetAlert. */
export function mapUnitMessageToAlert(
  m: RawMsg,
  unitNameById: Map<number, string>,
  fallbackUnitId?: number,
): FleetAlert {
  const p = m.p || {};
  const unitId =
    m.item_id ??
    (typeof p.unit_id === 'number' ? p.unit_id : undefined) ??
    fallbackUnitId;
  const unitName = unitId != null ? unitNameById.get(unitId) : undefined;

  const eventName =
    String(
      p.task_evt_name ||
        p.name ||
        p.notification ||
        p.notif_name ||
        p.evt_name ||
        m.et ||
        (m.f === 16384 ? 'Notification' : null) ||
        m.tp ||
        'Fleet alert',
    )
      .replace(/\bWialon\b/gi, '')
      .trim() || 'Fleet alert';

  const descriptionParts = [
    p.task_description,
    p.text,
    p.msg,
    p.param,
    p.trigger_type ? `Trigger: ${p.trigger_type}` : null,
    unitName && !String(p.text || '').includes(unitName) ? `Unit: ${unitName}` : null,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim())
    .filter(Boolean);

  const type = classifyWialonAlertType(classificationBlob(m, [eventName]));
  const title = withUnitLabel(eventName, unitName);
  const externalId = `${unitId ?? 'x'}-${m.t}-${type}-${String(p.task_id || p.name || m.et || m.tp || '').slice(0, 40)}`;

  return {
    id: `wialon-${externalId}`,
    type,
    severity: severityForAlertType(type, m.f),
    title: title.slice(0, 220),
    description: descriptionParts.join(' · ').slice(0, 1000) || undefined,
    latitude: m.y ?? (typeof p.y === 'number' ? p.y : undefined),
    longitude: m.x ?? (typeof p.x === 'number' ? p.x : undefined),
    timestamp: new Date((m.t || m.rt || 0) * 1000),
    sourceType: 'wialon',
    externalId,
    assetId: unitId != null ? String(unitId) : undefined,
    acknowledged: false,
  };
}

/** @deprecated use mapUnitMessageToAlert */
export function mapTaskMessageToAlert(
  m: RawMsg,
  unitNameById: Map<number, string>,
): FleetAlert {
  return mapUnitMessageToAlert(m, unitNameById);
}

const NOISE_TITLE = /engine\s*hours?|mileage\s*(counter)?|odometer|counter\s*(reset|update|value)|initial\s*(mileage|engine)|gprs\s*traffic|traffic\s*counter/i;
const GENERIC_TITLE = /^(fleet alert|notification|event|evt|task|message|unknown)$/i;

/**
 * Drop technical counter registrations and empty shells that are not
 * real configured notifications (they render with no useful details).
 */
export function isNoiseAlert(alert: FleetAlert): boolean {
  const title = (alert.title || '').trim();
  const desc = (alert.description || '').trim();
  const bareTitle = title.replace(/\s*·\s*[^·]+$/, '').trim();

  if (NOISE_TITLE.test(bareTitle) && desc.length < 12) return true;
  if (GENERIC_TITLE.test(bareTitle) && !desc) return true;
  if (!bareTitle && !desc) return true;
  return false;
}
