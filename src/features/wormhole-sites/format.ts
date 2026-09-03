const ISK_ZEROS = 1_000_000;

export function formatIsk(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B`;
  return `${(isk / ISK_ZEROS).toFixed(1)}M`;
}

export function formatIskHeader(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B ISK`;
  return `${(isk / 1_000_000).toFixed(1)}M ISK`;
}
