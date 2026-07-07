import { BRAND } from '@/lib/branding';

export const TERMS_VERSION = '2026-06-30';

export const TERMS_OF_USE = [
  {
    title: 'Authorized platform use',
    body: `${BRAND.fullName} (${BRAND.name}) is provided by Mimito for legitimate fleet and asset management. You may use the system only for business purposes authorized by your organization and in compliance with applicable laws.`,
  },
  {
    title: 'Account security',
    body: 'You are responsible for safeguarding your login credentials. Do not share passwords, reuse credentials across systems, or allow unauthorized persons to access your account. Report suspected compromise to your administrator immediately.',
  },
  {
    title: 'Telematics & third-party data',
    body: 'Vehicle location, sensor, video, and alert data may originate from integrated providers (e.g. Wialon, LocoNav, TrackSolid Pro). Your organization is responsible for lawful collection and use of telematics data from drivers, employees, and assets.',
  },
  {
    title: 'Location & GPS privacy',
    body: 'Live and historical GPS data displayed in MAMS may identify individuals or assets. Access location data only when your role requires it and only for legitimate operational, safety, or compliance purposes.',
  },
  {
    title: 'Video surveillance',
    body: 'Where surveillance modules are enabled, video streams and recordings must be handled according to your organization\'s privacy policies and local regulations. Unauthorized copying, distribution, or misuse of footage is prohibited.',
  },
  {
    title: 'Role-based access & confidentiality',
    body: 'Your permissions are limited to modules and data assigned to your role and tenant. You must not attempt to access other tenants, bypass controls, export data without authorization, or disclose confidential fleet information.',
  },
  {
    title: 'Acceptable use',
    body: 'You must not interfere with platform operation, probe security controls, introduce malware, scrape data at scale, or use MAMS for unlawful surveillance, harassment, or any purpose outside your organization\'s approved use.',
  },
  {
    title: 'Audit & monitoring',
    body: 'MAMS may log sign-ins, configuration changes, and administrative actions for security and compliance. By using the platform you acknowledge that such activity may be reviewed by authorized Mimito or tenant administrators.',
  },
  {
    title: 'Service availability',
    body: 'Map, tracking, and integration features depend on network connectivity and third-party telematics services. Mimito does not guarantee uninterrupted availability and is not liable for delays caused by external providers or connectivity issues.',
  },
  {
    title: 'Acceptance & updates',
    body: 'By selecting Accept, you confirm that you have read these terms and agree to comply with them. Mimito may update these terms; continued use after notice may require renewed acceptance.',
  },
] as const;
