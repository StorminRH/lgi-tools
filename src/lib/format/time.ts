// Absolute calendar date in UTC ("19 Jun 2026"), for cached/prerendered
// readouts where a live "x ago" would be frozen at build time. Accepts a Date or
// an ISO string; null / unparseable → an em dash.
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

// ISO calendar day ("2026-06-19") for admin readouts that key/label by date.
export function formatIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Coarse "x ago" for live-ish readouts: floors to the largest of m/h/d/w/mo,
// sub-minute and future timestamps read "just now". `now` is injectable for
// tests; production passes the default wall clock.
export function formatRelativeTime(date: Date | null, now: number = Date.now()): string {
  if (!date) return '—';
  const diffMs = now - date.getTime();
  if (diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Compact remaining-time for "finishes in …" labels: largest two units of
// d/h/m, sub-minute floors to "<1m".
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
