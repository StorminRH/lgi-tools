import { isoDay } from '@/lib/iso-date';

const UTC_DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatUtcDate(value: Date | string | null): string {
  if (value == null) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return UTC_DAY.format(date);
}

const UTC_TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  hourCycle: 'h23',
});

export function formatUtcTime(value: Date | number | null): string {
  if (value == null) return '—';
  const date = typeof value === 'number' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return UTC_TIME.format(date);
}

export function formatIsoDay(date: Date): string {
  return isoDay(date);
}

/** `YYYY-MM-DD HH:mm` in UTC, for audit rows and job timestamps. */
export function formatUtcMinute(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 16);
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
