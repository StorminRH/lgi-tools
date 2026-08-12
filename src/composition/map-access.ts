import {
  resolveMapRole,
  type MapAccess,
  type MapPrincipals,
} from '@/data/maps/access';
import type {
  CorporationAccessOption,
  MapAccessGrantOption,
} from '@/data/maps/access-contract';
import {
  getMapAccessSubject,
  getMapGrants,
  getAuthorizedMapGrantsForMaps,
  listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals,
  type AuthorizedMapRow,
  type DeletedRestorableMapRow,
} from '@/data/maps/queries';
import {
  getUserAffiliations,
} from '@/platform/auth/affiliation-store';
import { refreshStaleAffiliationsForUserWithOutcome } from '@/platform/auth/affiliation';
import { memberCorpIds } from '@/platform/auth/membership';
import { resolveEntityNames } from '@/data/eve-data/entity-names';

/** Principals plus whether the preceding stale refresh hit a transient ESI failure. */
export interface ResolvedMapPrincipals {
  readonly principals: MapPrincipals;
  readonly refreshTransientFailure: boolean;
}

/** Request-time Atlas chrome data derived from the single durable map listing. */
export interface MapChromeData {
  readonly maps: readonly AuthorizedMapRow[];
  readonly deletedMaps: readonly DeletedRestorableMapRow[];
  readonly corporations: readonly CorporationAccessOption[];
  readonly grantsByMapId: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
}

/**
 * Resolves a Better Auth user into the EVE principals they act as, refreshing
 * stale affiliations first and reporting whether that refresh failed transiently.
 * This is the single seam where character and corporation principals bind to a
 * user id for Neon-side map callers — one affiliation read path for both the
 * principals and the projection shortfall guard.
 */
export async function resolveMapPrincipalsWithOutcome(
  userId: string,
): Promise<ResolvedMapPrincipals> {
  const { transientFailure } = await refreshStaleAffiliationsForUserWithOutcome(userId);
  const affiliations = await getUserAffiliations(userId);
  return {
    principals: {
      characterIds: affiliations.map((affiliation) => affiliation.characterId),
      corporationIds: memberCorpIds(affiliations, new Date()),
    },
    refreshTransientFailure: transientFailure,
  };
}

/**
 * Resolves a Better Auth user into the EVE principals they act as. This is the single seam where
 * character and corporation principals bind to a user id for Neon-side map callers.
 */
export async function resolveMapPrincipals(userId: string): Promise<MapPrincipals> {
  const { principals } = await resolveMapPrincipalsWithOutcome(userId);
  return principals;
}

/**
 * Loads the Atlas switcher and access-management seed through one principal
 * resolution and the single authorized-list owner. Grant rows are fetched in
 * one batch only for maps where the effective role permits management.
 */
export async function listMapChromeData(userId: string): Promise<MapChromeData> {
  const principals = await resolveMapPrincipals(userId);
  const [maps, deletedMaps] = await Promise.all([
    listAuthorizedMapsForPrincipals(userId, principals),
    listDeletedRestorableMapsForPrincipals(userId, principals),
  ]);
  const adminMapIds = maps
    .filter((map) => map.role === 'admin')
    .map((map) => map.id);
  const grants = await getAuthorizedMapGrantsForMaps(
    userId,
    principals,
    adminMapIds,
  );
  const names = await resolveEntityNames([
    ...principals.corporationIds,
    ...grants.map((grant) => grant.ownerId),
  ]);
  const corporations = principals.corporationIds.map((corporationId) => ({
    corporationId,
    name: names[String(corporationId)] ?? `Corporation ${corporationId}`,
  }));
  const grantsByMapId: Record<string, MapAccessGrantOption[]> = Object.fromEntries(
    adminMapIds.map((mapId) => [mapId, []]),
  );
  for (const { mapId, ...grant } of grants) {
    grantsByMapId[mapId]?.push({
      ...grant,
      name:
        names[String(grant.ownerId)] ??
        `${grant.ownerType === 'character' ? 'Character' : 'Corporation'} ${grant.ownerId}`,
    });
  }
  return { maps, deletedMaps, corporations, grantsByMapId };
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

/** Lists every live durable map the user may view through the single principal resolver. */
export async function listAuthorizedMaps(userId: string): Promise<AuthorizedMapRow[]> {
  return listAuthorizedMapsForPrincipals(userId, await resolveMapPrincipals(userId));
}

/** Lists in-grace deleted maps the user may restore through the same authority inputs. */
export async function listDeletedRestorableMaps(
  userId: string,
): Promise<DeletedRestorableMapRow[]> {
  return listDeletedRestorableMapsForPrincipals(
    userId,
    await resolveMapPrincipals(userId),
  );
}
