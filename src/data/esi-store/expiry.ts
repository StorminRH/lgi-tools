import type { CacheLifeUntilExpires, StoredRow } from './types';

/**
 * When an answer expires: CCP's Expires when it sent one, else the route's
 * published cache time counted from when we asked (still CCP's number, not
 * a hand-picked window), else null, which means due at once.
 */
export function expiryFor(
  headerExpiresAt: number | null,
  specCacheSeconds: number | null,
  checkedAt: number,
): number | null {
  if (headerExpiresAt !== null) return headerExpiresAt;
  return specCacheSeconds === null ? null : checkedAt + specCacheSeconds * 1000;
}

/** A missing row, a row with no expiry, and a row whose expiry has passed are all due. */
export function isExpired(expiresAt: number | null, now: number): boolean {
  return expiresAt === null || expiresAt <= now;
}

/** The earliest expiry over a set of rows: null when any row is missing or has none, since that key is due. */
export function earliestExpiry(rows: readonly (StoredRow | null)[]): number | null {
  let earliest: number | null = null;
  for (const row of rows) {
    if (row === null || row.expiresAt === null) return null;
    if (earliest === null || row.expiresAt < earliest) earliest = row.expiresAt;
  }
  return earliest;
}

/**
 * The cacheLife of an entry built from stored data: revalidate and expire
 * both at CCP's Expires, so Next drops the entry when the stored copy is
 * due. The 1 s floor is not a freshness window; cacheLife accepts negative
 * values unchecked, so a lifetime already past must still be a number Next
 * can act on.
 */
export function untilExpires(expiresAt: number | null, now: number = Date.now()): CacheLifeUntilExpires {
  const seconds = expiresAt === null ? 1 : Math.max(1, Math.ceil((expiresAt - now) / 1000));
  return { stale: seconds, revalidate: seconds, expire: seconds };
}
