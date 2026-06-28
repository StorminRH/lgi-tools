// Owned-assets staleness gate (3.7.7.1) — mirrors the owned-blueprints gate.
// PURE + clock-injected so it is unit-testable in isolation; the on-view refresh
// loads the per-owner `last_refreshed_at` and the caller injects `now`. This is
// the PRIMARY dedup: a re-view inside the window makes no ESI call at all (the
// held-etag 304 is only the secondary, when the window has lapsed).

// Matches ESI's own 3600s cache on the assets endpoints — there is no point
// refreshing more often than upstream updates. One TTL governs both owner types
// (character + corporation) since both endpoints carry the same cache window.
export const ASSETS_TTL_MS = 60 * 60 * 1000;

// A refresh is due when the owner was never synced or its sync is older than the
// TTL. `refreshedAt` is null until the first successful sync.
export function isAssetsStale(refreshedAt: Date | null, now: Date): boolean {
  if (refreshedAt === null) return true;
  return now.getTime() - refreshedAt.getTime() > ASSETS_TTL_MS;
}
