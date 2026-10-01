import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { account } from '@/db/auth-schema';
import type { AnyPgDb } from '@/lib/db-types';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import type { MapPrincipals } from './access';
import { mapAccess, mapBlocks, maps, pendingMapAccessChanges } from './schema';

export type PendingMapAccessChange = {
  readonly mapId: string;
  readonly version: string;
};

export async function mapAuthorizationRows<T extends Record<string, unknown>>(
  database: AnyPgDb,
  query: SQL,
): Promise<T[]> {
  const result = await database.execute<T>(query);
  return Array.isArray(result) ? result : result.rows;
}

/** True when a block names this account: as the holder at block time, or through a character it holds now. */
export function userBlockedFromMap(userId: string, mapId: SQLWrapper): SQL {
  return sql`
    EXISTS (
      SELECT 1
      FROM ${mapBlocks} AS block
      WHERE block.map_id = ${mapId}
        AND (
          block.user_id = ${userId}
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

export function enqueuePendingMapAccessSelection(mapIds: SQL) {
  return sql`
    INSERT INTO ${pendingMapAccessChanges} (map_id)
    ${mapIds}
    ON CONFLICT (map_id) DO UPDATE SET version = gen_random_uuid()
    RETURNING map_id AS "mapId", version
  `;
}
