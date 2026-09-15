import { freshnessGate } from '@/lib/esi-datasets/freshness';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

export interface CachedAffiliation {
  characterId: number;
  corporationId: number | null;
  allianceId: number | null;
  factionId: number | null;
  refreshedAt: Date | null;
}

export function memberCharacterIdInCorp(
  affiliations: CachedAffiliation[],
  corporationId: number,
  now: Date,
): number | null {
  const match = affiliations.find(
    (a) =>
      a.corporationId === corporationId
      && !AFFILIATION_FRESHNESS.isStale(a.refreshedAt, now),
  );
  return match ? match.characterId : null;
}

export function memberCharacterIdsInCorp(
  affiliations: CachedAffiliation[],
  corporationId: number,
  now: Date,
): number[] {
  return affiliations
    .filter(
      (a) =>
        a.corporationId === corporationId
        && !AFFILIATION_FRESHNESS.isStale(a.refreshedAt, now),
    )
    .map((a) => a.characterId);
}

export function memberCorpIds(affiliations: CachedAffiliation[], now: Date): number[] {
  const ids = new Set<number>();
  for (const a of affiliations) {
    if (
      a.corporationId !== null
      && !AFFILIATION_FRESHNESS.isStale(a.refreshedAt, now)
    ) {
      ids.add(a.corporationId);
    }
  }
  return [...ids];
}
