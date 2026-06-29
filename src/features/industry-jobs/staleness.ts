// Personal industry-jobs staleness gate (MIGRATE.B.2) — mirrors the skill-queue gate
// (skill-queue/staleness.ts). PURE + clock-injected so it is unit-testable in
// isolation; the on-view refresh loads the per-character `last_refreshed_at` and the
// caller injects `now`. This is the PRIMARY dedup: a re-view inside the window makes
// no ESI call at all (the held-etag 304 is only the secondary, when the window lapsed).

// Matches the VERIFIED 300s ESI cache on the character industry-jobs endpoint
// (esi.evetech.net swagger x-cached-seconds=300; the Convex tracker's FALLBACK_TTL_MS
// and the engine's cadence floor agree) — there is no point refreshing more often than
// upstream updates. A job's live "ready" is derived client-side from its absolute
// end_date, so this window costs only one cheap conditional read per lapsed view, not
// a re-fetch of unchanging data.
export const JOBS_TTL_MS = 300 * 1000;

// A refresh is due when the character was never synced or its sync is older than the
// TTL. `refreshedAt` is null until the first successful sync.
export function isJobsStale(refreshedAt: Date | null, now: Date): boolean {
  if (refreshedAt === null) return true;
  return now.getTime() - refreshedAt.getTime() > JOBS_TTL_MS;
}
