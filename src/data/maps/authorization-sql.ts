import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { account } from '@/db/auth-schema';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import type { MapPrincipals } from './access';
import { mapAccess, mapBlockAccounts, mapBlocks, maps, pendingMapAccessChanges } from './schema';

export type PendingMapAccessChange = {
  readonly mapId: string;
  readonly version: string;
};

/** True when a block names this account: as a past holder of the character, or as its holder now. */
export function userBlockedFromMap(userId: string, mapId: SQLWrapper): SQL {
  return sql`
    EXISTS (
      SELECT 1
      FROM ${mapBlocks} AS block
      WHERE block.map_id = ${mapId}
        AND (
          EXISTS (
            SELECT 1
            FROM ${mapBlockAccounts} AS holder
            WHERE holder.block_id = block.id
              AND holder.user_id = ${userId}
          )
          OR EXISTS (
            SELECT 1
            FROM ${account} AS linked
            WHERE linked.user_id = ${userId}
              AND linked.provider_id = ${EVE_PROVIDER_ID}
              AND linked.account_id = block.character_id::text
          )
        )
    )
  `;
}

export function authorizedAdminMapsSelection(
  userId: string,
  principals: MapPrincipals,
  mapIds: readonly string[],
  lifecycleCondition: SQL,
) {
  const characterIds = JSON.stringify(principals.characterIds);
  const corporationIds = JSON.stringify(principals.corporationIds);
  const requestedMapIds = JSON.stringify(mapIds);
  return sql`
    SELECT ${maps.id}
    FROM ${maps}
    WHERE ${maps.id} IN (
        SELECT value::uuid
        FROM jsonb_array_elements_text(${requestedMapIds}::jsonb)
      )
      AND ${lifecycleCondition}
      AND (
        ${maps.userId} = ${userId}
        OR (
          NOT ${userBlockedFromMap(userId, maps.id)}
          AND EXISTS (
            SELECT 1
            FROM ${mapAccess} AS authority
            WHERE authority.map_id = ${maps.id}
              AND authority.role = 'admin'::"public"."map_role"
              AND (
                (
                  authority.owner_type = 'character'::"public"."map_access_owner_type"
                  AND authority.owner_id IN (
                    SELECT value::bigint
                    FROM jsonb_array_elements_text(${characterIds}::jsonb)
                  )
                )
                OR (
                  authority.owner_type = 'corporation'::"public"."map_access_owner_type"
                  AND authority.owner_id IN (
                    SELECT value::bigint
                    FROM jsonb_array_elements_text(${corporationIds}::jsonb)
                  )
                )
              )
          )
        )
      )
  `;
}

/** Records the current holder of a blocked character on each map that blocks it, unless they created that map. */
export function recordBlockedCharacterHolders(characterId: number): SQL {
  return sql`
    INSERT INTO ${mapBlockAccounts} (block_id, user_id)
    SELECT block.id, linked.user_id
    FROM ${mapBlocks} AS block
    INNER JOIN ${maps} AS blocked_map ON blocked_map.id = block.map_id
    INNER JOIN ${account} AS linked
      ON linked.provider_id = ${EVE_PROVIDER_ID}
      AND linked.account_id = block.character_id::text
    WHERE block.character_id = ${characterId}
      AND linked.user_id <> blocked_map.user_id
    ON CONFLICT DO NOTHING
  `;
}

export function enqueuePendingMapAccessSelection(mapIds: SQL) {
  return sql`
    INSERT INTO ${pendingMapAccessChanges} (map_id)
    ${mapIds}
    ON CONFLICT (map_id) DO UPDATE SET version = gen_random_uuid()
    RETURNING map_id AS "mapId", version
  `;
}
