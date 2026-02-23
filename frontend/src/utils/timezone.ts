import { getTimeZones } from '@vvo/tzdb';

export function getBrowserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function collectTimezones(profileTimezone?: string | null): string[] {
  const fromProfile = (profileTimezone ?? '').trim();
  const browserTz = getBrowserTimeZone();
  const fromTzdb = getTimeZones().map((tz) => tz.name);

  return Array.from(new Set([fromProfile, browserTz, ...fromTzdb].filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}
