import { recordExpiryFor } from '@/data/esi-store';
import type { EsiFetchOptions } from '@/platform/esi';
import { affiliationKey } from './affiliation-key';
import { fetchAffiliations, type AffiliationAnswer } from './affiliation-source';
import { captureAffiliationObservedAt, updateAffiliations } from './affiliation-store';

export interface AffiliationRefreshOutcome {
  readonly refreshed: number;
  readonly accessChanged: boolean;
  readonly transientFailure: boolean;
}

/** Each batch's expiry, recorded per character once its rows have stood, so the next view asks only when CCP says to. */
async function recordAnswers(answers: readonly AffiliationAnswer[]): Promise<void> {
  for (const answer of answers) {
    await recordExpiryFor(answer.characterIds.map(affiliationKey), answer.stamp);
  }
}

export async function refreshAffiliationsWithOutcome(
  characterIds: number[],
  opts?: EsiFetchOptions,
): Promise<AffiliationRefreshOutcome> {
  if (characterIds.length === 0) return { refreshed: 0, accessChanged: false, transientFailure: false };
  try {
    const observedAt = await captureAffiliationObservedAt();
    const result = await fetchAffiliations(characterIds, opts);
    const persisted = await updateAffiliations(result.rows, observedAt);
    await recordAnswers(result.answers);
    return { ...persisted, transientFailure: result.transientFailure };
  } catch (err) {
    console.error('[auth/affiliation] refresh failed', err);
    return { refreshed: 0, accessChanged: false, transientFailure: true };
  }
}
