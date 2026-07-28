import {
  resolveMapRole,
  type MapAccess,
  type MapPrincipals,
} from '@/data/maps/access';
import { getMapAccessSubject, getMapGrants } from '@/data/maps/queries';
import {
  getUserAffiliations,
} from '@/platform/auth/affiliation-store';
import { refreshStaleAffiliationsForUser } from '@/platform/auth/affiliation';
import { memberCorpIds } from '@/platform/auth/membership';

/**
 * Resolves a Better Auth user into the EVE principals they act as. This is the single seam where
 * character and corporation principals bind to a user id for Neon-side map callers.
 */
export async function resolveMapPrincipals(userId: string): Promise<MapPrincipals> {
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  return {
    characterIds: affiliations.map((affiliation) => affiliation.characterId),
    corporationIds: memberCorpIds(affiliations, new Date()),
  };
}

/**
 * The single map authorization gate (decision D5). Resolves a signed-in user and map into their
 * role and view/edit capabilities. The answer is authoritative and safe to await inside Suspense;
 * it never returns a provisional denial that a later affiliation refresh would contradict.
 */
export async function getMapAccess(userId: string, mapId: string): Promise<MapAccess> {
  const map = await getMapAccessSubject(mapId);
  if (map === null) return { role: null, canView: false, canEdit: false };

  const principals = await resolveMapPrincipals(userId);
  const grants = await getMapGrants(mapId);
  return resolveMapRole({
    isCreator: map.userId === userId,
    grants,
    principals,
  });
}
