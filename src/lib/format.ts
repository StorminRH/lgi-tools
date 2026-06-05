// Small number/ISK formatters shared across surfaces. Co-located in the shared
// lib (not a feature) so server and client code can both use them, and so the
// several precision variants different surfaces want live in one place rather
// than drifting as per-component reimplementations.

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

// Coarser ISK for dense table cells: one decimal at B/M, whole K below a
// million (the sites table's column width can't fit two decimals). Null or
// non-finite → an em dash.
export function formatIskShort(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  return `${(value / 1_000).toFixed(0)}K`;
}

// Compact ISK for search-result subtitles: one decimal at B, whole millions
// below (search rows never show sub-million values). Null or non-finite → an
// em dash.
export function formatIskCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  return `${(value / 1_000_000).toFixed(0)}M`;
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
