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

/**
 * Active maps that still grant tracking per account, oldest id first so a
 * batch resumes in order. Archived maps wait: archiving tears their tracking
 * down, so they are scoped by the first batch after a restore, once their
 * pilots track again.
 */
export async function listUnscopedMapIds(limit: number, database: AnyPgDb = db): Promise<string[]> {
  const rows = await database
    .select({ id: maps.id })
    .from(maps)
    .where(and(isNull(maps.characterScopedAt), isNull(maps.archivedAt), isNull(maps.tombstonedAt)))
    .orderBy(asc(maps.id))
    .limit(limit);
  return rows.map((row) => row.id);
}

/** Adds each grandfathered character grant; an existing grant for the character wins. */
export async function insertGrandfatherGrants(
  mapId: string,
  grants: readonly GrandfatherGrant[],
  database: AnyPgDb = db,
): Promise<void> {
  if (grants.length === 0) return;
  await database
    .insert(mapAccess)
    .values(grants.map((grant) => ({
      mapId,
      ownerType: 'character' as const,
      ownerId: grant.characterId,
      role: grant.role,
    })))
    .onConflictDoNothing({ target: [mapAccess.mapId, mapAccess.ownerType, mapAccess.ownerId] });
}

/**
 * The backfill's last step: stamp a live map character-scoped and queue its
 * reprojection in one statement. Null when the map is gone.
 */
export async function stampCharacterScoped(
  mapId: string,
  database: AnyPgDb = db,
): Promise<PendingMapAccessChange | null> {
  const [row] = await mapAuthorizationRows<PendingMapAccessChange>(database, sql`
    WITH target AS (
      SELECT ${maps.id} AS id FROM ${maps}
      WHERE ${maps.id} = ${mapId} AND ${maps.tombstonedAt} IS NULL
    ), stamped AS (
      UPDATE ${maps} SET character_scoped_at = now()
      WHERE ${maps.id} IN (SELECT id FROM target) AND ${maps.characterScopedAt} IS NULL
    )
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM target`)}
  `);
  return row ?? null;
}
