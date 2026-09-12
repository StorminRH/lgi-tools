import type { MapPrincipals } from '@/data/maps/access';
import { getUserAffiliations } from '@/platform/auth/affiliation-store';
import { refreshStaleAffiliationsForUserWithOutcome } from '@/platform/auth/affiliation';
import { memberCorpIds } from '@/platform/auth/membership';

export interface ResolvedMapPrincipals {
  readonly principals: MapPrincipals;
  readonly refreshTransientFailure: boolean;
  readonly changedCorporationIds: readonly number[];
}

export async function resolveMapPrincipalsWithOutcome(
  userId: string,
): Promise<ResolvedMapPrincipals> {
  const { transientFailure, changedCorporationIds } =
    await refreshStaleAffiliationsForUserWithOutcome(userId);
  const affiliations = await getUserAffiliations(userId);
  return {
    principals: {
      characterIds: affiliations.map((affiliation) => affiliation.characterId),
      corporationIds: memberCorpIds(affiliations, new Date()),
    },
    refreshTransientFailure: transientFailure,
    changedCorporationIds,
  };
}

export async function resolveMapPrincipals(userId: string): Promise<MapPrincipals> {
  const { principals } = await resolveMapPrincipalsWithOutcome(userId);
  return principals;
}
