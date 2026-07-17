// Skill-queue staleness gate (MIGRATE.B.1) — mirrors the owned-blueprints gate
// (staleness.ts), which mirrors the affiliation gate (membership.ts). PURE +
// clock-injected so it is unit-testable in isolation; the on-view refresh loads the
// per-character `last_refreshed_at` and the caller injects `now`. This is the
// PRIMARY dedup: a re-view inside the window makes no ESI call at all (the held-etag
// 304 is only the secondary, when the window has lapsed).

/**
 * Matches the VERIFIED 120s ESI cache on both the skills and skillqueue endpoints
 * (esi.evetech.net swagger x-cached-seconds=120) — there is no point refreshing more
 * often than upstream updates. The live PROGRESS of the queue is derived client-side
 * from each entry's absolute finish_date, so this short window costs only one cheap
 * conditional read per lapsed view, not a re-fetch of unchanging data.
 */
export const SKILLS_TTL_MS = 120 * 1000;

/**
 * A refresh is due when the character was never synced or its sync is older than the
 * TTL. `refreshedAt` is null until the first successful sync.
 */
export function isSkillsStale(refreshedAt: Date | null, now: Date): boolean {
  if (refreshedAt === null) return true;
  return now.getTime() - refreshedAt.getTime() > SKILLS_TTL_MS;
}
