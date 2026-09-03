import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { bestEffort } from '@/lib/best-effort';
import type { PurgeContributor } from '@/platform/purge/types';
import {
  getCharacterCorporationId,
  getMapIdsWithCharacterGrant,
  getMapIdsWithCorporationGrants,
  getOwnedMapIds,
} from './queries';
import { mapAccess, maps } from './schema';

export interface MapAccessProjectionPurgeHooks {
  readonly projectMap: (mapId: string) => Promise<unknown>;
  readonly purgeMapChain: (mapId: string) => Promise<unknown>;
  readonly purgeUserClaims: (userId: string) => Promise<unknown>;
}

async function deleteCharacterMapGrants(characterId: number): Promise<void> {
  await db
    .delete(mapAccess)
    .where(
      and(
        eq(mapAccess.ownerType, 'character'),
        eq(mapAccess.ownerId, characterId),
      ),
    );
}

async function deleteOwnedMaps(userId: string): Promise<void> {
  await db.delete(maps).where(eq(maps.userId, userId));
}

async function purgeOwnedMapChainsThenDeleteMaps(
  userId: string,
  purgeMapChain: MapAccessProjectionPurgeHooks['purgeMapChain'],
): Promise<void> {
  const ownedMapIds = await getOwnedMapIds(userId);
  for (const mapId of ownedMapIds) {
    await purgeMapChain(mapId);
  }
  await deleteOwnedMaps(userId);
}

export function createMapsPurgeContributor(
  hooks: MapAccessProjectionPurgeHooks,
): PurgeContributor {
  return {
    name: 'maps',
    tier: 'credential',
    claims: [maps, mapAccess],
    async purgeCharacter({ characterId }) {
      const corporationId = await getCharacterCorporationId(characterId);
      const characterMaps = await getMapIdsWithCharacterGrant(characterId);
      const corporationMaps =
        corporationId === null
          ? []
          : await getMapIdsWithCorporationGrants([corporationId]);
      const affectedMapIds = [...new Set([...characterMaps, ...corporationMaps])];

      await deleteCharacterMapGrants(characterId);

      for (const mapId of affectedMapIds) {
        await bestEffort('maps/purge', 'projection', mapId, () =>
          hooks.projectMap(mapId),
        );
      }
    },
    async purgeUser({ userId }) {
      await purgeOwnedMapChainsThenDeleteMaps(userId, hooks.purgeMapChain);
      await bestEffort('maps/purge', 'user claim purge', userId, () =>
        hooks.purgeUserClaims(userId),
      );
    },
  };
}
