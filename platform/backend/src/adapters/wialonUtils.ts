/** Wialon Remote API helpers — aligned with working Mamsvv wialon-client / wialon-helpers */

/** Wialon unit data flags (aligned with Wialon SDK). */
export const WIALON_UNIT_FLAG = {
  BASE: 0x00000001,
  CUSTOM_PROPS: 0x00000002,
  CUSTOM_FIELDS: 0x00000008,
  IMAGE: 0x00000010,
  ADVANCED: 0x00000100,
  /** Commands available at the moment (cmds array). */
  COMMANDS_AVAILABLE: 0x00000200,
  LAST_MSG_POS: 0x00000400,
  SENSORS: 0x00001000,
  COUNTERS: 0x00002000,
  MAINTENANCE: 0x00008000,
  TRIP_FUEL: 0x00020000,
  /** All commands configured on the unit (cml map). */
  COMMANDS: 0x00080000,
  MSG_PARAMS: 0x00100000,
  CONNECTION: 0x00200000,
  PROFILE: 0x00800000,
} as const;

/** Fleet list — monitoring + props, fields, image, hw, trip detector, connection. */
export const WIALON_UNIT_FLAGS =
  WIALON_UNIT_FLAG.BASE |
  WIALON_UNIT_FLAG.CUSTOM_PROPS |
  WIALON_UNIT_FLAG.CUSTOM_FIELDS |
  WIALON_UNIT_FLAG.IMAGE |
  WIALON_UNIT_FLAG.ADVANCED |
  WIALON_UNIT_FLAG.LAST_MSG_POS |
  WIALON_UNIT_FLAG.SENSORS |
  WIALON_UNIT_FLAG.COUNTERS |
  WIALON_UNIT_FLAG.TRIP_FUEL |
  WIALON_UNIT_FLAG.MSG_PARAMS |
  WIALON_UNIT_FLAG.CONNECTION;

/** Full unit detail — fleet flags + maintenance + profile. */
export const WIALON_UNIT_DETAIL_FLAGS =
  WIALON_UNIT_FLAGS | WIALON_UNIT_FLAG.MAINTENANCE | WIALON_UNIT_FLAG.PROFILE;

const WIALON_ERRORS: Record<number, string> = {
  1: 'Invalid session',
  2: 'Invalid service',
  3: 'Invalid result',
  4: 'Invalid input',
  5: 'Error performing request',
  6: 'Unknown error',
  7: 'Access denied',
  8: 'Invalid or expired token',
  9: 'Authorization server is unavailable',
  1001: 'No messages for selected interval',
  1002: 'Item with such unique property already exists',
  1003: 'Only one request is allowed at the moment',
  1004: 'Limit of concurrent requests exceeded',
  1005: 'Execution time has exceeded the limit',
  1006: 'Exceeding the limit of attempts to enter a password',
};

export function formatWialonError(code: number, reason?: string): string {
  const base = WIALON_ERRORS[code] || `Unknown error (code ${code})`;
  return reason ? `${base} — ${reason}` : base;
}

export interface WialonSearchItem {
  id: number;
  nm: string;
  uri?: string;
  ugi?: number;
  pos?: { x: number; y: number; s: number; z?: number; t: number; sc?: number; c?: number };
  prp?: Record<string, string>;
  flds?: Record<string, { id?: number; n?: string; v?: string }>;
  cnm?: number;
  cneh?: number;
  ph?: string;
  uid?: string;
  hw?: number;
  sens?: Record<
    string,
    {
      n?: string;
      t?: string | number;
      p?: string;
      u?: string;
      tbl?: unknown[];
      /** Optional sensor constant / max (vendor-specific). */
      c?: number | string;
      max?: number | string;
    }
  >;
  prms?: Record<string, { v?: number | string; ct?: number; at?: number }>;
  /** Profile fields (PROFILE flag). */
  pflds?: Record<string, { id?: number; n?: string; v?: string }>;
  si?: Record<string, { n?: string; nmt?: number; cnm?: number }>;
  lmsg?: { t?: number; p?: Record<string, unknown> };
  netconn?: boolean;
  rtd?: {
    type?: number;
    gpsCorrection?: boolean;
    minSat?: number;
    minMovingSpeed?: number;
    minStayTime?: number;
    maxMessagesDistance?: number;
    minTripTime?: number;
    minTripDistance?: number;
  };
  bact?: number;
  bpact?: number;
  crt?: number;
  ld?: number;
  /** Present with ADVANCED flag (0x100): 0/false = deactivated, 1/true = activated. */
  act?: boolean | number;
  /** Deactivation time (UNIX). Non-zero means the unit is deactivated. */
  dactt?: number;
  zl?: Record<string, { id: number; n: string }>;
  rcfg?: { color?: number; descr?: string; units?: number[] };
  rep?: Record<string, { id: number; n: string; ct?: string }>;
  unf?: Record<
    string,
    {
      id: number;
      /** Modern Wialon Hosting name field. */
      n?: string;
      /** Legacy SDK name field (still returned by some tokens / hosting builds). */
      nm?: string;
      ac?: number;
      ta?: number;
      td?: number;
      fl?: number;
      un?: number[];
      trg?: string | { t?: string };
    }
  >;
}

export interface WialonSearchResult {
  items: WialonSearchItem[];
  totalItemsCount?: number;
}

export const WIALON_SEARCH_PAGE_SIZE = 500;

/** Resource: base + billing (account id, parent account) */
export const WIALON_RESOURCE_ACCOUNT_FLAGS = 5;

/** User: base + billing + other props (last login) */
export const WIALON_USER_FLAGS = 261;

/** Resource: base + drivers */
export const WIALON_RESOURCE_DRIVERS_FLAGS = 257;

/** Resource: base + geofences (zl) */
export const WIALON_RESOURCE_GEOFENCES_FLAGS = 4097;

/** Resource: base + notifications (unf) — 1 | 1024 */
export const WIALON_RESOURCE_NOTIFICATIONS_FLAGS = 1025;

export function wialonObjectValues<T>(obj: Record<string, T> | undefined): T[] {
  if (!obj) return [];
  return Object.values(obj);
}
