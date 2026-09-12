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
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { reprojectMapsForCorporations } from './map-access-identity';
import {
  resolveMapPrincipalsWithOutcome,
  type ResolvedMapPrincipals,
} from './map-access-principals';

export { resolveMapPrincipals } from './map-access-principals';

export interface MapChromeData {
  readonly maps: readonly AuthorizedMapRow[];
  readonly deletedMaps: readonly DeletedRestorableMapRow[];
  readonly corporations: readonly CorporationAccessOption[];
  readonly grantsByMapId: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
}

export async function listMapChromeData(userId: string): Promise<MapChromeData> {
  const { principals, changedCorporationIds }: ResolvedMapPrincipals =
    await resolveMapPrincipalsWithOutcome(userId);
  await reprojectMapsForCorporations(changedCorporationIds);
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
