// The one place units × per-unit buy price becomes ISK — shared so the server
// overlay (live-prices.ts) and the client island compute the same figure.
// Kept DB-free (no query imports) so the client island can import it without
// dragging the database client into the browser bundle. Returns null when
// there's no positive unit count or no buy price to apply.
export function liveIskFor(units: number | null, pct5Buy: number | null): number | null {
  if (units == null || units <= 0) return null;
  if (!pct5Buy) return null;
  return Math.round(units * pct5Buy);
}
