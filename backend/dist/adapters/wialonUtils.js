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
};
/** Fleet list — monitoring + props, fields, image, hw, trip detector, connection. */
export const WIALON_UNIT_FLAGS = WIALON_UNIT_FLAG.BASE |
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
export const WIALON_UNIT_DETAIL_FLAGS = WIALON_UNIT_FLAGS | WIALON_UNIT_FLAG.MAINTENANCE | WIALON_UNIT_FLAG.PROFILE;
const WIALON_ERRORS = {
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
export function formatWialonError(code, reason) {
    const base = WIALON_ERRORS[code] || `Unknown error (code ${code})`;
    return reason ? `${base} — ${reason}` : base;
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
export function wialonObjectValues(obj) {
    if (!obj)
        return [];
    return Object.values(obj);
}
