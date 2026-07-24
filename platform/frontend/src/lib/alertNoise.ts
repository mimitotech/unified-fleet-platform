/** Match backend isNoiseAlert — Engine_Hours / counter registrations are not real alerts. */
export const ALERT_NOISE_PATTERN =
  /engine[\s_-]*hours?|mileage[\s_-]*(counter)?|odometer|counter[\s_-]*(reset|update|value)|initial[\s_-]*(mileage|engine)|gprs[\s_-]*traffic|traffic[\s_-]*counter|service[\s_-]*interval[\s_-]*hours|mh[\s_-]*counter|moto[\s_-]*hours?/i;

export function isNoiseAlertTitle(title?: string, description?: string, type?: string): boolean {
  const blob = `${title || ''} ${description || ''} ${type || ''}`;
  return ALERT_NOISE_PATTERN.test(blob);
}
