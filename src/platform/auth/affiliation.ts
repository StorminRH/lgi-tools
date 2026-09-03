import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { fetchAffiliations } from './affiliation-source';
import { characterIsInCorp, isMemberOfCorp } from './membership';
import { getCharacterAffiliation, getUserAffiliations, updateAffiliations } from './affiliation-store';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

/**
 * Postgres advisory-lock key for the nightly affiliation refresh cron. Held only
 * by /api/cron/refresh-affiliations to skip an overlapping run of itself (the
 * upserts are idempotent — this guards against a redundant double ESI pull, not
 * data integrity). Distinct project-unique bigint — must not collide with
 * ADVISORY_LOCK_GSC_SYNC (…015) or ADVISORY_LOCK_INDUSTRY_INDICES (…014).
 */
export const ADVISORY_LOCK_AFFILIATION_REFRESH = BigInt(8273619016);

/** Detailed refresh outcome for callers that must distinguish transient ESI failure. */
export interface AffiliationRefreshOutcome {
  readonly refreshed: number;
  readonly transientFailure: boolean;
}

export async function refreshAffiliationsWithOutcome(
  characterIds: number[],
): Promise<AffiliationRefreshOutcome> {
  if (characterIds.length === 0) return { refreshed: 0, transientFailure: false };
  try {
    const { rows, transientFailure } = await fetchAffiliations(characterIds);
    await updateAffiliations(rows);
    return { refreshed: rows.length, transientFailure };
  } catch (err) {
    console.error('[auth/affiliation] refresh failed', err);
    return { refreshed: 0, transientFailure: true };
  }
}

/**
 * Fetch fresh affiliations for these characters and write them to the Neon cache.
 * Best-effort — never throws (the source already classifies per-batch ESI
 * failures; this guards the upsert too) so a refresh can't break sign-in, the
 * enumeration route, or the cron. Returns the number of rows refreshed (for cron
 * telemetry). Used by all three triggers: login/link, on-view (write-behind),
 * and the cron.
 */
export async function refreshAffiliations(characterIds: number[]): Promise<number> {
  return (await refreshAffiliationsWithOutcome(characterIds)).refreshed;
}

export async function refreshStaleAffiliationsForUserWithOutcome(
  userId: string,
): Promise<AffiliationRefreshOutcome> {
  const affiliations = await getUserAffiliations(userId);
  const now = new Date();
  const staleIds = affiliations
    .filter((a) => AFFILIATION_FRESHNESS.isStale(a.refreshedAt, now))
    .map((a) => a.characterId);
  return refreshAffiliationsWithOutcome(staleIds);
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
  return (await refreshStaleAffiliationsForUserWithOutcome(userId)).refreshed;
}

export async function isUserCurrentMemberOfCorp(
  userId: string,
  corporationId: number,
): Promise<boolean> {
  const affiliations = await getUserAffiliations(userId);
  return isMemberOfCorp(affiliations, corporationId, new Date());
}

export async function isCharacterCurrentMemberOfCorp(
  characterId: number,
  corporationId: number,
): Promise<boolean> {
  const affiliation = await getCharacterAffiliation(characterId);
  return characterIsInCorp(affiliation, corporationId, new Date());
}
