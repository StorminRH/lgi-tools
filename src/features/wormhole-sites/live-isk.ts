export function liveIskFor(units: number | null, unitPrice: number | null): number | null {
  if (units == null || units <= 0) return null;
  if (!unitPrice) return null;
  return Math.round(units * unitPrice);
}
