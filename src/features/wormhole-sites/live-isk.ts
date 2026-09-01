/**
 * The one place units × per-unit sell price becomes ISK — shared so the server
 * overlay (live-prices.ts) and the client island compute the same figure.
 * Kept DB-free (no query imports) so the client island can import it without
 * dragging the database client into the browser bundle. Returns null when
 * there's no positive unit count or no sell price to apply.
 */
export function liveIskFor(units: number | null, unitPrice: number | null): number | null {
  if (units == null || units <= 0) return null;
  if (!unitPrice) return null;
  return Math.round(units * unitPrice);
}
