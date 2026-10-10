import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { account } from '@/db/auth-schema';
import { executeRows } from '@/lib/db-execute';
import type { AnyPgDb } from '@/lib/db-types';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import type { MapPrincipals } from './access';
import {
  authorizedAdminMapsSelection,
  enqueuePendingMapAccessSelection,
  type PendingMapAccessChange,
} from './authorization-sql';
import { mapBlockAccounts, mapBlocks, maps } from './schema';

export interface MapBlockRow {
  readonly mapId: string;
  readonly characterId: number;
}

export interface MapBlockAttempt {
  readonly creatorUserId: string;
  readonly holderUserId: string | null;
  readonly pending: PendingMapAccessChange | null;
}

function activeAdminMaps(userId: string, principals: MapPrincipals, mapIds: readonly string[]) {
  return authorizedAdminMapsSelection(
    userId,
    principals,
    mapIds,
    sql`${maps.archivedAt} IS NULL AND ${maps.tombstonedAt} IS NULL`,
  );
}

function currentHolder(characterId: number) {
  return sql`
    SELECT linked.user_id
    FROM ${account} AS linked
    WHERE linked.provider_id = ${EVE_PROVIDER_ID}
      AND linked.account_id = ${String(characterId)}
    LIMIT 1
  `;
}

/**
 * Blocks a character on a map the caller administers, unless the character
 * belongs to the caller or the map creator. Null means the caller is not an
 * admin of that active map.
 */
export async function blockAuthorizedMapCharacter(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  characterId: number,
  database: AnyPgDb = db,
): Promise<MapBlockAttempt | null> {
  const [row] = await executeRows<{
    creatorUserId: string;
    holderUserId: string | null;
    mapId: string | null;
    version: string | null;
  }>(database, sql`
    WITH target AS (
      SELECT target_map.id, target_map.user_id AS creator_user_id,
        (${currentHolder(characterId)}) AS holder_user_id
      FROM ${maps} AS target_map
      WHERE target_map.id IN (${activeAdminMaps(userId, principals, [mapId])})
    ), allowed AS (
      SELECT id, holder_user_id
      FROM target
      WHERE holder_user_id IS DISTINCT FROM creator_user_id
        AND holder_user_id IS DISTINCT FROM ${userId}
    ), inserted AS (
      INSERT INTO ${mapBlocks} (map_id, character_id, blocked_by_user_id)
      SELECT id, ${characterId}, ${userId}
      FROM allowed
      ON CONFLICT (map_id, character_id) DO UPDATE SET blocked_at = ${mapBlocks.blockedAt}
      RETURNING id
    ), recorded AS (
      INSERT INTO ${mapBlockAccounts} (block_id, user_id)
      SELECT inserted.id, allowed.holder_user_id
      FROM inserted CROSS JOIN allowed
      WHERE allowed.holder_user_id IS NOT NULL
      ON CONFLICT DO NOTHING
    ), pending AS (
      ${enqueuePendingMapAccessSelection(sql`SELECT id FROM allowed`)}
    )
    SELECT target.creator_user_id AS "creatorUserId",
      target.holder_user_id AS "holderUserId",
      pending."mapId", pending.version
    FROM target
    LEFT JOIN pending ON true
  `);
  if (row === undefined) return null;
  return {
    creatorUserId: row.creatorUserId,
    holderUserId: row.holderUserId,
    pending: row.mapId === null || row.version === null
      ? null
      : { mapId: row.mapId, version: row.version },
  };
}

/** Removes a block on a map the caller administers; null when they do not. */
export async function unblockAuthorizedMapCharacter(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  characterId: number,
  database: AnyPgDb = db,
): Promise<PendingMapAccessChange | null> {
  const [row] = await executeRows<PendingMapAccessChange>(database, sql`
    WITH authorized_map AS (
      ${activeAdminMaps(userId, principals, [mapId])}
    ), removed AS (
      DELETE FROM ${mapBlocks}
      WHERE ${mapBlocks.mapId} IN (SELECT id FROM authorized_map)
        AND ${mapBlocks.characterId} = ${characterId}
    )
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM authorized_map`)}
  `);
  return row ?? null;
}

/** The blocked characters of the maps the caller administers. */
export async function getAuthorizedMapBlocksForMaps(
  userId: string,
  principals: MapPrincipals,
  mapIds: readonly string[],
  database: AnyPgDb = db,
): Promise<MapBlockRow[]> {
  const uniqueMapIds = [...new Set(mapIds)];
  if (uniqueMapIds.length === 0) return [];
  const rows = await executeRows<{ mapId: string; characterId: number | string }>(database, sql`
    SELECT block.map_id AS "mapId", block.character_id AS "characterId"
    FROM ${mapBlocks} AS block
    WHERE block.map_id IN (${activeAdminMaps(userId, principals, uniqueMapIds)})
    ORDER BY block.map_id, block.blocked_at, block.character_id
  `);
  return rows.map((row) => ({ mapId: row.mapId, characterId: Number(row.characterId) }));
}

/** Accounts kept off a map: every recorded holder of a blocked character and its holder now. */
export async function getBlockedMapUserIds(
  mapId: string,
  database: AnyPgDb = db,
): Promise<string[]> {
  const rows = await executeRows<{ userId: string }>(database, sql`
    SELECT holder.user_id AS "userId"
    FROM ${mapBlocks} AS block
    INNER JOIN ${mapBlockAccounts} AS holder ON holder.block_id = block.id
    WHERE block.map_id = ${mapId}
    UNION
    SELECT linked.user_id AS "userId"
    FROM ${mapBlocks} AS block
    INNER JOIN ${account} AS linked
      ON linked.provider_id = ${EVE_PROVIDER_ID}
      AND linked.account_id = block.character_id::text
    WHERE block.map_id = ${mapId}
  `);
  return rows.map((row) => row.userId);
}
