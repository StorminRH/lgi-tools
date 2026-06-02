// ISK formatters shared across the wormhole-sites surfaces. Kept in their own
// module (not a server component) so both the server bodies and the client live
// island import the same rounding without dragging a server component into the
// client bundle.

const ISK_ZEROS = 1_000_000;

// Compact figure for a row value: "123.4M" / "1.2B", "—" when absent.
export function formatIsk(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B`;
  return `${(isk / ISK_ZEROS).toFixed(1)}M`;
}

// Same magnitude, with the unit — used by the card header and section footer.
export function formatIskHeader(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B ISK`;
  return `${(isk / 1_000_000).toFixed(1)}M ISK`;
}
