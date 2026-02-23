import { session } from '@/auth/session';

const TIMEZONE_STORAGE_KEY = 'timeZone';

function normalizeBackendTimestamp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  // If backend value has no timezone marker, treat it as UTC for consistency.
  const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed);
  return hasTimezone ? trimmed : `${trimmed}Z`;
}

export function getUserLocale(): string {
  const explicitLocale = session.user?.locale?.trim();
  if (explicitLocale) return explicitLocale;
  const lang = session.user?.language;
  if (lang === 'da') return 'da-DK';
  if (lang === 'en') return 'en-GB';
  return navigator.language || 'en-GB';
}

export function getUserTimeZone(): string {
  const fromProfile = session.user?.timezone?.trim();
  if (fromProfile) return fromProfile;

  const stored = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
  if (stored) return stored;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function toEpochMillis(value: string | null): number | null {
  if (!value) return null;
  const d = new Date(normalizeBackendTimestamp(value));
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function formatDateTimeForUser(value: string | null): string {
  if (!value) return '—';

  const normalized = normalizeBackendTimestamp(value);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  const datePart = formatDateForUser(date);
  const timePart = formatTimeForUser(date);
  return `${datePart} ${timePart}`;
}

export function getUserWeekStart(): number {
  const v = session.user?.week_start;
  if (Number.isInteger(v) && v !== undefined && v >= 1 && v <= 7) {
    return v;
  }
  return 1;
}

export function formatDateForUser(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(normalizeBackendTimestamp(value)) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '—';

  const locale = getUserLocale();
  const timeZone = getUserTimeZone();
  const format = session.user?.date_format ?? 'locale';

  if (format === 'locale') {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone,
    }).format(date);
  }

  const parts = getDatePartsInTimeZone(date, locale, timeZone);
  if (!parts) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone,
    }).format(date);
  }

  const day = String(parts.day).padStart(2, '0');
  const month = String(parts.month).padStart(2, '0');
  const year = String(parts.year);

  if (format === 'dd-mm-yyyy') {
    return `${day}-${month}-${year}`;
  }
  if (format === 'mm/dd/yyyy') {
    return `${month}/${day}/${year}`;
  }
  // dd_month_yyyy
  const monthName = new Intl.DateTimeFormat(locale, {
    month: 'long',
    timeZone,
  }).format(date);
  return `${day} ${monthName} ${year}`;
}

export function formatIsoDateForUser(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const year = Number.parseInt(m[1] ?? '', 10);
  const month = Number.parseInt(m[2] ?? '', 10);
  const day = Number.parseInt(m[3] ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return isoDate;
  }

  const format = session.user?.date_format ?? 'locale';
  const locale = getUserLocale();

  if (format === 'dd-mm-yyyy') {
    return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
  }
  if (format === 'mm/dd/yyyy') {
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  if (format === 'dd_month_yyyy') {
    const monthName = new Intl.DateTimeFormat(locale, {
      month: 'long',
      timeZone: 'UTC',
    }).format(utcDate);
    return `${String(day).padStart(2, '0')} ${monthName} ${year}`;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(utcDate);
}

export function formatTimeForUser(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(normalizeBackendTimestamp(value)) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '—';

  const locale = getUserLocale();
  const timeZone = getUserTimeZone();
  const use12h = (session.user?.time_format ?? '24h') === '12h';

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: use12h,
    timeZone,
  }).format(date);
}

export function formatClockForUser(clock: string | null): string {
  if (!clock) return '—';
  const m = clock.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return clock;
  const h = Number.parseInt(m[1] ?? '', 10);
  const min = Number.parseInt(m[2] ?? '', 10);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return clock;
  }

  if ((session.user?.time_format ?? '24h') === '24h') {
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${String(hour12).padStart(2, '0')}:${String(min).padStart(2, '0')} ${suffix}`;
}

export function formatClockRangeForUser(start: string, end: string | null): string {
  const a = formatClockForUser(start);
  if (!end) return a;
  return `${a} – ${formatClockForUser(end)}`;
}

export function normalizeClockInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = Number.parseInt(hhmm[1] ?? '', 10);
    const m = Number.parseInt(hhmm[2] ?? '', 10);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      return null;
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const ampm = raw.match(/^(\d{1,2}):(\d{2})\s*([aApP][mM])$/);
  if (ampm) {
    const h12 = Number.parseInt(ampm[1] ?? '', 10);
    const m = Number.parseInt(ampm[2] ?? '', 10);
    const suffix = (ampm[3] ?? '').toUpperCase();
    if (!Number.isInteger(h12) || !Number.isInteger(m) || h12 < 1 || h12 > 12 || m < 0 || m > 59) {
      return null;
    }

    let h24 = h12 % 12;
    if (suffix === 'PM') h24 += 12;
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

function getDatePartsInTimeZone(date: Date, locale: string, timeZone: string): { year: number; month: number; day: number } | null {
  const parts = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(date);

  const year = Number.parseInt(parts.find((p) => p.type === 'year')?.value ?? '', 10);
  const month = Number.parseInt(parts.find((p) => p.type === 'month')?.value ?? '', 10);
  const day = Number.parseInt(parts.find((p) => p.type === 'day')?.value ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  return { year, month, day };
}
