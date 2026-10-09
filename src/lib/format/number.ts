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

/** A count with its noun, pluralised: `1 job`, `12 jobs`, `3 matches`. */
export function formatCount(count: number, one: string, many = `${one}s`): string {
  return `${formatQuantity(count)} ${count === 1 ? one : many}`;
}
