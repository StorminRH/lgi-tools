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
