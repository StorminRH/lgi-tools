import { fetchAffiliations } from './affiliation-source';
import { updateAffiliations } from './affiliation-store';
import { SYNTHETIC_PILOT } from './synthetic-pilot';

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
    const result = await fetchAffiliations(characterIds);
    const rows = result.transientFailure ? result.rows : withConfirmedDepartures(characterIds, result.rows);
    const persisted = await updateAffiliations(rows);
    return { ...persisted, transientFailure: result.transientFailure };
  } catch (err) {
    console.error('[auth/affiliation] refresh failed', err);
    return { refreshed: 0, accessChanged: false, transientFailure: true };
  }
}

function withConfirmedDepartures(
  requested: readonly number[],
  rows: Parameters<typeof updateAffiliations>[0],
): Parameters<typeof updateAffiliations>[0] {
  const returned = new Set(rows.map((row) => row.characterId));
  const departures = requested
    .filter((characterId) => !returned.has(characterId))
    .filter((characterId) => process.env.NODE_ENV !== 'development' || characterId !== SYNTHETIC_PILOT.characterId)
    .map((characterId) => ({ characterId, corporationId: null, allianceId: null, factionId: null }));
  return departures.length === 0 ? rows : [...rows, ...departures];
}

export async function refreshAffiliations(characterIds: number[]): Promise<number> {
  return (await refreshAffiliationsWithOutcome(characterIds)).refreshed;
}
