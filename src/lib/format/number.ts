/** A whole number grouped in en-US, so server and client agree; `—` for null or non-finite. */
export function formatQuantity(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
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
  const rounded = Math.round(count);
  return `${formatQuantity(rounded)} ${rounded === 1 ? one : many}`;
}
