import { after } from 'next/server';
import { reconcileAffiliationAccess } from './map-affiliation-access';
import type {
  CorporationAccessOption,
  MapAccessGrantOption,
  MapBlockOption,
} from '@/data/maps/access-contract';
import { getAuthorizedMapBlocksForMaps, type MapBlockRow } from '@/data/maps/blocks';
import {
  getAuthorizedMapGrantsForMaps,
  listAuthorizedMapsForPrincipals,
  listDeletedRestorableMapsForPrincipals,
  type AuthorizedMapRow,
  type DeletedRestorableMapRow,
} from '@/data/maps/queries';
import { resolveUserCorpAccess } from '@/composition/corp-access';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import type { MapPrincipals } from '@/data/maps/access';
import { nameOrUnresolved } from '@/lib/format/names';

export interface MapChromeData {
  readonly maps: readonly AuthorizedMapRow[];
  readonly deletedMaps: readonly DeletedRestorableMapRow[];
  readonly corporations: readonly CorporationAccessOption[];
  readonly grantsByMapId: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
  readonly blocksByMapId: Readonly<Record<string, readonly MapBlockOption[]>>;
}

export async function resolveMapPrincipals(userId: string): Promise<MapPrincipals> {
  const access = await resolveUserCorpAccess(userId);
  return { characterIds: access.authorizedCharacterIds, corporationIds: access.corporationIds };
}

function groupBlocksByMap(
  adminMapIds: readonly string[],
  blocks: readonly MapBlockRow[],
  names: Readonly<Record<string, string>>,
): Record<string, MapBlockOption[]> {
  const byMap: Record<string, MapBlockOption[]> = Object.fromEntries(
    adminMapIds.map((mapId) => [mapId, []]),
  );
  for (const { mapId, characterId } of blocks) {
    byMap[mapId]?.push({ characterId, name: nameOrUnresolved(names, characterId, 'character') });
  }
  return byMap;
}

export async function listMapChromeData(userId: string): Promise<MapChromeData> {
  const principals = await resolveMapPrincipals(userId);
  after(reconcileAffiliationAccess);
  const [maps, deletedMaps] = await Promise.all([
    listAuthorizedMapsForPrincipals(userId, principals),
    listDeletedRestorableMapsForPrincipals(userId, principals),
  ]);
  const adminMapIds = maps
    .filter((map) => map.role === 'admin')
    .map((map) => map.id);
  const [grants, blocks] = await Promise.all([
    getAuthorizedMapGrantsForMaps(userId, principals, adminMapIds),
    getAuthorizedMapBlocksForMaps(userId, principals, adminMapIds),
  ]);
  const names = await resolveEntityNames([
    ...principals.corporationIds,
    ...grants.map((grant) => grant.ownerId),
    ...blocks.map((block) => block.characterId),
  ]);
  const corporations = principals.corporationIds.map((corporationId) => ({
    corporationId,
    name: nameOrUnresolved(names, corporationId, 'corporation'),
  }));
  const grantsByMapId: Record<string, MapAccessGrantOption[]> = Object.fromEntries(
    adminMapIds.map((mapId) => [mapId, []]),
  );
  for (const { mapId, ...grant } of grants) {
    grantsByMapId[mapId]?.push({
      ...grant,
      name: nameOrUnresolved(names, grant.ownerId, grant.ownerType),
    });
  }
  const blocksByMapId = groupBlocksByMap(adminMapIds, blocks, names);
  return { maps, deletedMaps, corporations, grantsByMapId, blocksByMapId };
}
