/** Credential field guide — matches backend adapters exactly */

export const INTEGRATION_GUIDE = {
  wialon: {
    label: 'Wialon',
    summary: 'GPS, fuel, drivers, geofences, commands, trips',
    fields: [
      {
        key: 'token',
        label: 'API token',
        hint: 'Wialon login token. After save, use Link account in the tree to scope this tenant to one client admin account.',
      },
      {
        key: 'baseUrl',
        label: 'API host (optional)',
        hint: 'Default https://hst-api.wialon.com/wialon/ajax.html — use .eu / .us if your data centre differs.',
      },
      {
        key: 'accountId',
        label: 'Scope to Wialon account ID (optional)',
        hint: 'Limit vehicle sync to one client billing account (sys_billing_account_guid). Pick from hierarchy after probe.',
      },
      {
        key: 'operateAs',
        label: 'Operate as user ID (optional)',
        hint: 'token/login operateAs — act as a sub-user with their ACL (route planning, reports, etc.).',
      },
    ],
    steps: ['Link account from Wialon Center', 'Select Wialon users', 'Sync Now', 'Activate tenant'],
    webhook: null,
  },
  loconav: {
    label: 'LocoNav',
    summary: 'GPS, video alerts (webhooks), vehicle list',
    fields: [
      {
        key: 'userAuthentication',
        label: 'User-Authentication token',
        hint: 'From LocoNav developer / API settings. Uses Integration API v1 (/integration/api/v1/vehicles). Set LOCONAV_API_URL if needed (api.a.loconav.com or api.loconav.com).',
      },
    ],
    steps: ['Save token', 'Test connection', 'Sync Now', 'Configure webhook in LocoNav portal'],
    webhook: {
      header: 'x-loconav-signature or x-signature',
      envSecret: 'LOCONAV_WEBHOOK_SECRET',
    },
  },
  tracksolid: {
    label: 'TrackSolid Pro (Jimi)',
    summary: 'GPS, video, fuel, geofences, commands, OBD, alerts',
    fields: [
      { key: 'appKey', label: 'App Key', hint: 'TrackSolid / Jimi developer portal → application app_key' },
      { key: 'appSecret', label: 'App Secret', hint: 'Application app_secret (never share publicly)' },
      { key: 'account', label: 'Account ID (user_id)', hint: 'TrackSolid account user_id used for jimi.oauth.token.get' },
      { key: 'password', label: 'Account password', hint: 'Plain password — stored as MD5 server-side. Leave blank on re-save to keep existing.' },
    ],
    steps: ['Save all four fields', 'Test connection', 'Sync Now', 'Configure webhook in TrackSolid portal'],
    webhook: {
      header: 'x-tracksolid-signature',
      envSecret: 'TRACKSOLID_WEBHOOK_SECRET',
    },
  },
} as const;

export type IntegrationSource = keyof typeof INTEGRATION_GUIDE;
