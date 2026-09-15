import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { characters } from '@/db/auth-schema';
import { bestEffort } from '@/lib/best-effort';
import type { AnyPgDb } from '@/lib/db-types';
import type { PurgeContributor } from '@/platform/purge/types';
import {
  enqueuePendingMapAccessSelection,
  mapAuthorizationRows,
} from './authorization-sql';
import { getOwnedMapIds } from './queries';
import { mapAccess, maps } from './schema';

export interface MapAccessProjectionPurgeHooks {
  readonly deliverCaptured: (
    changes: { mapId: string; version: string }[],
  ) => Promise<unknown>;
  readonly purgeMapChain: (mapId: string) => Promise<unknown>;
  readonly purgeUserClaims: (userId: string) => Promise<unknown>;
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

async function purgeCharacterMapGrants(
  characterId: number,
  database: AnyPgDb = db,
): Promise<{ mapId: string; version: string }[]> {
  const result = await database.execute<{ mapId: string; version: string }>(sql`
    WITH affected AS (
      SELECT DISTINCT ${mapAccess.mapId} AS id
      FROM ${mapAccess}
      WHERE (
        ${mapAccess.ownerType} = 'character'::"public"."map_access_owner_type"
        AND ${mapAccess.ownerId} = ${characterId}
      ) OR (
        ${mapAccess.ownerType} = 'corporation'::"public"."map_access_owner_type"
        AND ${mapAccess.ownerId} = (
          SELECT ${characters.corporationId}
          FROM ${characters}
          WHERE ${characters.characterId} = ${characterId}
        )
      )
    ), deleted AS (
      DELETE FROM ${mapAccess}
      WHERE ${mapAccess.ownerType} = 'character'::"public"."map_access_owner_type"
        AND ${mapAccess.ownerId} = ${characterId}
    )
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM affected`)}
  `);
  return mapAuthorizationRows(result);
}

export function createMapsPurgeContributor(
  hooks: MapAccessProjectionPurgeHooks,
): PurgeContributor {
  return {
    name: 'maps',
    tier: 'credential',
    claims: [maps, mapAccess],
    async purgeCharacter({ characterId }) {
      const pending = await purgeCharacterMapGrants(characterId);
      if (pending.length > 0) await hooks.deliverCaptured(pending);
    },
    async purgeUser({ userId }) {
      await purgeOwnedMapChainsThenDeleteMaps(userId, hooks.purgeMapChain);
      await bestEffort('maps/purge', 'user claim purge', userId, () =>
        hooks.purgeUserClaims(userId),
      );
    },
  };
}
