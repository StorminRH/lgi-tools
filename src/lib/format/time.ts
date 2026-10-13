import { isoDay } from '@/lib/iso-date';

/** A Date, epoch milliseconds, or a parseable date string (an offset-free date-time string reads as local time). */
export type DateInput = Date | number | string;

/** The instant a value names, or null for null or an invalid date. */
function toDate(value: DateInput | null): Date | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const UTC_DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `9 Oct 2026` in UTC, or `—` for null or an invalid date. */
export function formatUtcDate(value: DateInput | null): string {
  const date = toDate(value);
  return date === null ? '—' : UTC_DAY.format(date);
}

/** Drops the year from a {@link formatUtcDate} label (`9 Oct 2026` to `9 Oct`) for axis ticks and dense rows. */
export function stripUtcYear(label: string): string {
  return label.replace(/ \d{4}$/, '');
}

const UTC_TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hourCycle: 'h23',
});

/** `14:05` in UTC, or `—` for null or an invalid date. */
export function formatUtcTime(value: DateInput | null): string {
  const date = toDate(value);
  return date === null ? '—' : UTC_TIME.format(date);
}

/** `2026-10-09`, the UTC calendar day; throws on an invalid date. */
export function formatIsoDay(value: Date | number): string {
  return isoDay(value);
}

/**
 * `2026-10-09 14:05 UTC` for audit rows and job timestamps, or `empty` for
 * null or an invalid date. `zone: false` drops the ` UTC` label where a column
 * header already names the zone.
 */
export function formatUtcMinute(
  value: DateInput | null,
  { empty = '—', zone = true }: { empty?: string; zone?: boolean } = {},
): string {
  const date = toDate(value);
  if (date === null) return empty;
  const stamp = date.toISOString().replace('T', ' ').slice(0, 16);
  return zone ? `${stamp} UTC` : stamp;
}

/**
 * Compact floored age of an elapsed duration: `<1m` under a minute (negative
 * durations included), then `Nm`, `Nh` below `dayAfterHours`, then `Nd`. With
 * `largest: 'mo'` days roll into `Nw` below 30 days and `Nmo` (30-day months)
 * after.
 */
export function formatElapsed(
  ms: number,
  { dayAfterHours = 24, largest = 'd' }: { dayAfterHours?: number; largest?: 'd' | 'mo' } = {},
): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < dayAfterHours) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (largest === 'd' || days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

export function formatRelativeTime(
  date: Date | null,
  now?: number,
  largest: 'd' | 'mo' = 'mo',
): string {
  if (!date) return '—';
  const diffMs = (now ?? Date.now()) - date.getTime();
  if (diffMs < 60_000) return 'just now';
  return `${formatElapsed(diffMs, { largest })} ago`;
}

export function formatRemaining(ms: number): string {
  if (ms < 60_000) return '<1m';
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}
