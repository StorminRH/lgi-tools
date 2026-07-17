// Corp-affiliation orchestration (3.7.3.2): the refresh (fetch → cache) and the
// membership decisions (load → fail-closed verdict) that compose the ESI source
// (affiliation-source.ts), the Neon cache readers/writer (affiliation-store.ts),
// and the pure predicates (membership.ts). This module is the logic over those
// data sources.
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { fetchAffiliations } from './affiliation-source';
import { characterIsInCorp, isMemberOfCorp } from './membership';
import { getCharacterAffiliation, getUserAffiliations, upsertAffiliations } from './affiliation-store';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

/**
 * Postgres advisory-lock key for the nightly affiliation refresh cron. Held only
 * by /api/cron/refresh-affiliations to skip an overlapping run of itself (the
 * upserts are idempotent — this guards against a redundant double ESI pull, not
 * data integrity). Distinct project-unique bigint — must not collide with
 * ADVISORY_LOCK_GSC_SYNC (…015) or ADVISORY_LOCK_INDUSTRY_INDICES (…014).
 */
export const ADVISORY_LOCK_AFFILIATION_REFRESH = BigInt(8273619016);

/**
 * Fetch fresh affiliations for these characters and write them to the Neon cache.
 * Best-effort — never throws (the source already swallows per-batch ESI failures;
 * this guards the upsert too) so a refresh can't break sign-in, the enumeration
 * route, or the cron. Returns the number of rows refreshed (for cron telemetry).
 * Used by all three triggers: login/link, on-view (write-behind), and the cron.
 */
export async function refreshAffiliations(characterIds: number[]): Promise<number> {
  if (characterIds.length === 0) return 0;
  try {
    const rows = await fetchAffiliations(characterIds);
    await upsertAffiliations(rows);
    return rows.length;
  } catch (err) {
    console.error('[auth/affiliation] refresh failed', err);
    return 0;
  }
}

/**
 * Refresh every stale / never-refreshed affiliation among a user's linked
 * characters, so a membership decision taken straight after runs on ≤1h-fresh data
 * — the audited gate's refresh-then-decide step. Best-effort: delegates to
 * refreshAffiliations (which swallows ESI failures), so a refresh that can't reach
 * ESI leaves the cache stale and the following decision fails closed. Returns the
 * number of rows refreshed.
 */
export async function refreshStaleAffiliationsForUser(userId: string): Promise<number> {
  const affiliations = await getUserAffiliations(userId);
  const now = new Date();
  const staleIds = affiliations
    .filter((a) => AFFILIATION_FRESHNESS.isStale(a.refreshedAt, now))
    .map((a) => a.characterId);
  return refreshAffiliations(staleIds);
}

/**
 * Is this user a current member of corporationId — i.e. does any of their linked
 * characters have a FRESH cached affiliation in that corp? Fail-closed (the 3.7.3.3
 * gate's core check). The gate refreshes stale affiliations before calling this so
 * its decision is on ≤1h-fresh data.
 */
export async function isUserCurrentMemberOfCorp(
  userId: string,
  corporationId: number,
): Promise<boolean> {
  const affiliations = await getUserAffiliations(userId);
  return isMemberOfCorp(affiliations, corporationId, new Date());
}

/**
 * Is this specific character a current member of corporationId. The by-character
 * form for consumers that gate on one pilot rather than the whole user.
 */
export async function isCharacterCurrentMemberOfCorp(
  characterId: number,
  corporationId: number,
): Promise<boolean> {
  const affiliation = await getCharacterAffiliation(characterId);
  return characterIsInCorp(affiliation, corporationId, new Date());
}
