import { fetchAffiliations, type AffiliationRow } from './affiliation-source';
import { updateAffiliations } from './affiliation-store';

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

export interface AffiliationRefreshRows {
  readonly rows: AffiliationRow[];
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

/**
 * Refresh + return the confirmed rows, so the corp-access resolver can merge
 * fresh ESI state in memory without a second broad read. Only rows whose write
 * was confirmed are returned — an unconfirmed write stays stale and the
 * membership decision fails closed.
 */
export async function refreshAffiliationsWithRows(
  characterIds: number[],
): Promise<AffiliationRefreshRows> {
  if (characterIds.length === 0) return { rows: [], transientFailure: false };
  try {
    const { rows, transientFailure } = await fetchAffiliations(characterIds);
    const confirmed = new Set(await updateAffiliations(rows));
    return { rows: rows.filter((row) => confirmed.has(row.characterId)), transientFailure };
  } catch (err) {
    console.error('[auth/affiliation] refresh failed', err);
    return { rows: [], transientFailure: true };
  }
}
