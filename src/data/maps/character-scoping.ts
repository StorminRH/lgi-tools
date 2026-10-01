import { and, asc, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import type { MapRole } from './access-contract';
import {
  enqueuePendingMapAccessSelection,
  mapAuthorizationRows,
  type PendingMapAccessChange,
} from './authorization-sql';
import { mapAccess, maps } from './schema';

export interface GrandfatherGrant {
  readonly characterId: number;
  readonly role: MapRole;
}

/** Live maps that still grant tracking per account, oldest id first so a batch resumes in order. */
export async function listUnscopedMapIds(limit: number, database: AnyPgDb = db): Promise<string[]> {
  const rows = await database
    .select({ id: maps.id })
    .from(maps)
    .where(and(isNull(maps.characterScopedAt), isNull(maps.tombstonedAt)))
    .orderBy(asc(maps.id))
    .limit(limit);
  return rows.map((row) => row.id);
}

/**
 * In one statement: add each grandfathered character grant (an existing grant
 * for the character wins), stamp the map character-scoped, and queue its
 * reprojection. Repeating it adds only grants that are still missing.
 */
export async function grandfatherCharacterGrants(
  mapId: string,
  grants: readonly GrandfatherGrant[],
  database: AnyPgDb = db,
): Promise<PendingMapAccessChange | null> {
  const [row] = await mapAuthorizationRows<PendingMapAccessChange>(database, sql`
    WITH target AS (
      SELECT ${maps.id} AS id FROM ${maps}
      WHERE ${maps.id} = ${mapId} AND ${maps.tombstonedAt} IS NULL
    ), inserted AS (
      INSERT INTO ${mapAccess} (map_id, owner_type, owner_id, role)
      SELECT target.id, 'character'::"public"."map_access_owner_type",
        grandfathered.character_id, grandfathered.role::"public"."map_role"
      FROM target
      CROSS JOIN jsonb_to_recordset(${JSON.stringify(grants.map((grant) => ({
        character_id: grant.characterId,
        role: grant.role,
      })))}::jsonb) AS grandfathered(character_id bigint, role text)
      ON CONFLICT (map_id, owner_type, owner_id) DO NOTHING
    ), stamped AS (
      UPDATE ${maps} SET character_scoped_at = now()
      WHERE ${maps.id} IN (SELECT id FROM target) AND ${maps.characterScopedAt} IS NULL
    )
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM target`)}
  `);
  return row ?? null;
}
