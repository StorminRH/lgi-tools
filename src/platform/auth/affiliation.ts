import { fetchAffiliations } from './affiliation-source';
import { updateAffiliations } from './affiliation-store';

export interface AffiliationRefreshOutcome {
  readonly refreshed: number;
  readonly accessChanged: boolean;
  readonly transientFailure: boolean;
}

let observationSequence = 0;

function nextObservationSequence(): number {
  observationSequence += 1;
  return observationSequence;
}

export async function refreshAffiliationsWithOutcome(
  characterIds: number[],
): Promise<AffiliationRefreshOutcome> {
  if (characterIds.length === 0) return { refreshed: 0, accessChanged: false, transientFailure: false };
  const observedAt = new Date();
  const sequence = nextObservationSequence();
  try {
    const result = await fetchAffiliations(characterIds);
    const persisted = await updateAffiliations(result.rows, observedAt, sequence);
    return { ...persisted, transientFailure: result.transientFailure };
  } catch (err) {
    console.error('[auth/affiliation] refresh failed', err);
    return { refreshed: 0, accessChanged: false, transientFailure: true };
  }
}

export async function refreshAffiliations(characterIds: number[]): Promise<number> {
  return (await refreshAffiliationsWithOutcome(characterIds)).refreshed;
}
