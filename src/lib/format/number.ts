export function formatQuantity(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatCompactQuantity(value: number): string {
  return Math.round(value).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}
