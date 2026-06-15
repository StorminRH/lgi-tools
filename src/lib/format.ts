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

// Two-letter typographic monogram for a name — the initials of the first two
// words, else the first two characters. Used by the industry recents/favorites
// rows and job table, where the icons are typographic rather than images.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
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
