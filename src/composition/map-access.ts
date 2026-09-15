import type {
  CorporationAccessOption,
  MapAccessGrantOption,
} from '@/data/maps/access-contract';
import {
  getAuthorizedMapGrantsForMaps,
  listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals,
  type AuthorizedMapRow,
  type DeletedRestorableMapRow,
} from '@/data/maps/queries';
import { resolveUserCorpAccess } from '@/platform/auth/corp-access';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import type { MapPrincipals } from '@/data/maps/access';

export interface ResolvedMapPrincipals {
  readonly principals: MapPrincipals;
  readonly refreshTransientFailure: boolean;
}

export interface MapChromeData {
  readonly maps: readonly AuthorizedMapRow[];
  readonly deletedMaps: readonly DeletedRestorableMapRow[];
  readonly corporations: readonly CorporationAccessOption[];
  readonly grantsByMapId: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
}

export async function resolveMapPrincipalsWithOutcome(
  userId: string,
): Promise<ResolvedMapPrincipals> {
  const access = await resolveUserCorpAccess(userId);
  return {
    principals: {
      characterIds: [...access.allCharacterIds],
      corporationIds: [...access.memberCorpIds],
    },
    refreshTransientFailure: access.transientFailure,
  };
}

export async function resolveMapPrincipals(userId: string): Promise<MapPrincipals> {
  const { principals } = await resolveMapPrincipalsWithOutcome(userId);
  return principals;
}

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
