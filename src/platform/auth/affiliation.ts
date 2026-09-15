import { fetchAffiliations } from './affiliation-source';
import { updateAffiliations } from './affiliation-store';

export interface AffiliationRefreshOutcome {
  readonly refreshed: number;
  readonly accessChanged: boolean;
  readonly transientFailure: boolean;
}

/** Fetch and persist once; counts reflect confirmed writes, not unpersisted ESI rows. */
export async function refreshAffiliationsWithOutcome(
  characterIds: number[],
): Promise<AffiliationRefreshOutcome> {
  if (characterIds.length === 0) return { refreshed: 0, accessChanged: false, transientFailure: false };
  try {
    const result = await fetchAffiliations(characterIds);
    const persisted = await updateAffiliations(result.rows);
    return { ...persisted, transientFailure: result.transientFailure };
  } catch (err) {
    console.error('[auth/affiliation] refresh failed', err);
    return { refreshed: 0, accessChanged: false, transientFailure: true };
  }
}

/** Best-effort refresh for login and background sync; stale access still fails closed. */
export async function refreshAffiliations(characterIds: number[]): Promise<number> {
  return (await refreshAffiliationsWithOutcome(characterIds)).refreshed;
}
