import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgDb } from '@/lib/db-types';
import type { MapPrincipals } from './access';
import { mapAccess, maps, pendingMapAccessChanges } from './schema';

export type PendingMapAccessChange = {
  readonly mapId: string;
  readonly version: string;
};

export function mapAuthorizationRows(
  result: Awaited<ReturnType<AnyPgDb['execute']>>,
) {
  return Array.isArray(result) ? result : result.rows;
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
        OR EXISTS (
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
