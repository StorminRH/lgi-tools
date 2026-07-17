// Numeric formatters (counts and percentages) shared across surfaces.

/** Whole-unit counts (material quantities) with thousands separators. */
export function formatQuantity(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Compact whole-unit count (e.g. 540000 → "540K", 1_200_000 → "1.2M") for tight
 * spaces like the QTY ring centre, where a full thousands-separated count won't fit.
 */
export function formatCompactQuantity(value: number): string {
  return Math.round(value).toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

/** Percentage with one decimal. Null or non-finite → an em dash. */
export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}
