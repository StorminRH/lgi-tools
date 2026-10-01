import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bestEffort } from '@/lib/best-effort';
import type { AnyPgDb } from '@/lib/db-types';
import type { MergeSubject, MergeTx, PurgeContributor } from '@/platform/purge/types';
import {
  enqueuePendingMapAccessSelection,
  mapAuthorizationRows,
  type PendingMapAccessChange,
} from './authorization-sql';
import {
  affectedMapIdsSelection,
  characterGrantCondition,
  getOwnedMapIds,
} from './queries';
import { mapAccess, mapBlocks, maps } from './schema';

export interface MapAccessProjectionPurgeHooks {
  readonly deliverCaptured: (
    changes: PendingMapAccessChange[],
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

/** The survivor inherits the source's blocks, both as the blocked account and as the blocker. */
export async function mergeMapBlocks(tx: MergeTx, subject: MergeSubject): Promise<void> {
  await tx.update(mapBlocks)
    .set({ userId: subject.survivorUserId })
    .where(eq(mapBlocks.userId, subject.sourceUserId));
  await tx.update(mapBlocks)
    .set({ blockedByUserId: subject.survivorUserId })
    .where(eq(mapBlocks.blockedByUserId, subject.sourceUserId));
}

/** A deleted account leaves its blocks in place; only the account columns are cleared. */
export async function forgetMapBlockAccounts(
  userId: string,
  database: AnyPgDb = db,
): Promise<void> {
  await database.update(mapBlocks).set({ userId: null }).where(eq(mapBlocks.userId, userId));
  await database.update(mapBlocks)
    .set({ blockedByUserId: null })
    .where(eq(mapBlocks.blockedByUserId, userId));
}

async function purgeCharacterMapGrants(
  characterId: number,
  database: AnyPgDb = db,
): Promise<PendingMapAccessChange[]> {
  return mapAuthorizationRows<PendingMapAccessChange>(database, sql`
    WITH affected AS (
      ${affectedMapIdsSelection(characterId)}
    ), deleted AS (
      DELETE FROM ${mapAccess}
      WHERE ${characterGrantCondition(characterId)}
    )
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM affected`)}
  `);
}

export function createMapsPurgeContributor(
  hooks: MapAccessProjectionPurgeHooks,
): PurgeContributor {
  return {
    name: 'maps',
    tier: 'credential',
    claims: [maps, mapAccess, mapBlocks],
    merge: [
      { table: maps, rule: 'rekey' },
      { table: mapAccess, rule: 'follows-character' },
      {
        tables: [mapBlocks],
        rule: 'custom',
        reason: 'A block keeps both the blocked account and the blocker, and the unique key is per map and character, so both account columns move to the survivor without collision.',
        merge: mergeMapBlocks,
      },
    ],
    async purgeCharacter({ characterId }) {
      const pending = await purgeCharacterMapGrants(characterId);
      // Retry work is already durable; delivery must not stop the remaining purge.
      if (pending.length > 0) {
        await bestEffort('maps/purge', 'projection', String(characterId), () =>
          hooks.deliverCaptured(pending),
        );
      }
    },
    async purgeUser({ userId }) {
      await purgeOwnedMapChainsThenDeleteMaps(userId, hooks.purgeMapChain);
      await forgetMapBlockAccounts(userId);
      await bestEffort('maps/purge', 'user claim purge', userId, () =>
        hooks.purgeUserClaims(userId),
      );
    },
  };
}
