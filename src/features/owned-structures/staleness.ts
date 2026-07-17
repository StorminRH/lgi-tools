// Corp owned-structures staleness gate (3.7.9) — mirrors the owned-assets gate.
// PURE + clock-injected so it is unit-testable in isolation; the on-view refresh
// loads the per-corp `last_refreshed_at` and the caller injects `now`. This is the
// PRIMARY dedup, and the shared one: because the stamp is on the corp-keyed row,
// the FIRST member's view per window does the ESI work and every other member's
// view inside the window short-circuits here (no vend, no roles read, no fetch).

/**
 * Matches ESI's own 3600s cache on GET /corporations/\{id\}/structures/ — there is no
 * point refreshing more often than upstream updates.
 */
export const STRUCTURES_TTL_MS = 60 * 60 * 1000;

/**
 * A refresh is due when the corp was never synced or its sync is older than the TTL.
 * `refreshedAt` is null until the first successful sync.
 */
export function isStructuresStale(refreshedAt: Date | null, now: Date): boolean {
  if (refreshedAt === null) return true;
  return now.getTime() - refreshedAt.getTime() > STRUCTURES_TTL_MS;
}
