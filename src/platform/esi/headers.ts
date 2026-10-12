/**
 * The one integer and HTTP-date parse for ESI answers and the scoreboard's
 * stored counts. It imports nothing: the Convex isolate bundles platform/esi.
 */

/** A base-10 integer, prefix-parsed like `parseInt` ('12abc' is 12); null when absent or not a number. */
export function parseIntOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function intHeader(headers: Headers, name: string): number | null {
  return parseIntOrNull(headers.get(name));
}

/** An HTTP-date (ESI's Expires) in epoch ms; null when absent or unparseable. */
export function httpDateMs(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** ESI's X-Pages total: one page when the header is missing or malformed, and never fewer. */
export function esiPageCount(headers: Headers): number {
  return Math.max(1, intHeader(headers, 'X-Pages') ?? 1);
}
