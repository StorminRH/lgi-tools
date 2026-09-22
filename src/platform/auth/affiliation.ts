import { fetchAffiliations } from './affiliation-source';
import { captureAffiliationObservedAt, updateAffiliations } from './affiliation-store';

export interface AffiliationRefreshOutcome {
  readonly refreshed: number;
  readonly accessChanged: boolean;
  readonly transientFailure: boolean;
}

export async function refreshAffiliationsWithOutcome(
  characterIds: number[],
): Promise<AffiliationRefreshOutcome> {
  if (characterIds.length === 0) return { refreshed: 0, accessChanged: false, transientFailure: false };
  try {
    const observedAt = await captureAffiliationObservedAt();
    const result = await fetchAffiliations(characterIds);
    const persisted = await updateAffiliations(result.rows, observedAt);
    return { ...persisted, transientFailure: result.transientFailure };
  } catch (err) {
    console.error('[auth/affiliation] refresh failed', err);
    return { refreshed: 0, accessChanged: false, transientFailure: true };
  }
}

export async function refreshAffiliations(characterIds: number[]): Promise<number> {
  return (await refreshAffiliationsWithOutcome(characterIds)).refreshed;
}
