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
