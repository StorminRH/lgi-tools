// Small number/ISK formatters for the Industry Planner. Co-located in the
// shared lib (not a feature) so server and client planner code can both use
// them. The wormhole-sites feature keeps its own older formatters — those are
// not refactored here (out of scope for 3.0.5).

// Abbreviated ISK for totals, margins, and extended/unit costs. Null or
// non-finite → an em dash. Two significant decimals at B/M scale, one at K.
export function formatIsk(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

// Whole-unit counts (material quantities) with thousands separators.
export function formatQuantity(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

// Percentage with one decimal. Null or non-finite → an em dash.
export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(1)}%`;
}
