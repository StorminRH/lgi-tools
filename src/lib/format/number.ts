// Numeric formatters (counts and percentages) shared across surfaces.

// Whole-unit counts (material quantities) with thousands separators.
export function formatQuantity(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

// Percentage with one decimal. Null or non-finite → an em dash.
export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}
