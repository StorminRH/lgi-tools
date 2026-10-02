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
import { mapAccess, mapBlockAccounts, mapBlocks, maps } from './schema';

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

/**
 * The survivor inherits the source's place on every block, once per block,
 * except on maps the survivor now created, and becomes the blocker of record.
 */
export async function mergeMapBlocks(tx: MergeTx, subject: MergeSubject): Promise<void> {
  await tx.execute(sql`
    INSERT INTO ${mapBlockAccounts} (block_id, user_id)
    SELECT holder.block_id, ${subject.survivorUserId}
    FROM ${mapBlockAccounts} AS holder
    WHERE holder.user_id = ${subject.sourceUserId}
    ON CONFLICT DO NOTHING
  `);
  await tx.delete(mapBlockAccounts).where(eq(mapBlockAccounts.userId, subject.sourceUserId));
  await tx.execute(sql`
    DELETE FROM ${mapBlockAccounts} AS holder
    USING ${mapBlocks} AS block, ${maps} AS blocked_map
    WHERE holder.block_id = block.id
      AND blocked_map.id = block.map_id
      AND holder.user_id = blocked_map.user_id
      AND holder.user_id = ${subject.survivorUserId}
  `);
  await tx.update(mapBlocks)
    .set({ blockedByUserId: subject.survivorUserId })
    .where(eq(mapBlocks.blockedByUserId, subject.sourceUserId));
}

/** A deleted account leaves its blocks in place; only its own rows go. */
export async function forgetMapBlockAccounts(
  userId: string,
  database: AnyPgDb = db,
): Promise<void> {
  await database.delete(mapBlockAccounts).where(eq(mapBlockAccounts.userId, userId));
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
    claims: [maps, mapAccess, mapBlocks, mapBlockAccounts],
    merge: [
      { table: maps, rule: 'rekey' },
      { table: mapAccess, rule: 'follows-character' },
      {
        tables: [mapBlocks, mapBlockAccounts],
        rule: 'custom',
        reason: 'Holder rows are unique per block and account, so the source rows move to the survivor without duplicates, and are dropped on maps the survivor now created; the blocker of record moves too.',
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
