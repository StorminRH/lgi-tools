import { and, asc, isNull, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { account, characters } from '@/db/auth-schema';
import { db, directClient } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import type { MapRole } from './access-contract';
import {
  enqueuePendingMapAccessSelection,
  mapAuthorizationRows,
  userBlockedFromMap,
  type PendingMapAccessChange,
} from './authorization-sql';
import { mapAccess, maps } from './schema';

export interface GrandfatherGrant {
  readonly userId: string;
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

function sharedAccessEligible(alias: string, authorizationFailureCutoff: Date): SQL {
  const linked = sql.identifier(alias);
  return sql`${linked}.refresh_token IS NOT NULL AND (
    ${linked}.authorization_failure_first_at IS NULL
    OR ${linked}.authorization_failure_first_at > ${authorizationFailureCutoff.toISOString()}::timestamptz
  )`;
}

const ROLE_RANK: Record<MapRole, number> = { viewer: 1, editor: 2, admin: 3 };

/**
 * Rechecks ownership and current access in the grant write. Snapshot roles
 * cap the resulting grant; a revoke, downgrade, block or sale cannot turn a
 * stale candidate into more access. Existing grants remain authoritative.
 */
export async function insertGrandfatherGrants(
  mapId: string,
  grants: readonly GrandfatherGrant[],
  authorizationFailureCutoff: Date,
  database: AnyPgDb = drizzle(directClient),
): Promise<void> {
  if (grants.length === 0) return;
  await database.transaction(async (transaction) => {
    await transaction.execute(sql`SELECT ${maps.id} FROM ${maps} WHERE ${maps.id} = ${mapId} FOR UPDATE`);
    await writeGrandfatherGrants(mapId, grants, authorizationFailureCutoff, transaction);
  });
}

async function writeGrandfatherGrants(
  mapId: string,
  grants: readonly GrandfatherGrant[],
  authorizationFailureCutoff: Date,
  database: AnyPgDb,
): Promise<void> {
  const candidates = sql.join(grants.map((grant) => sql`
    SELECT ${grant.userId}::text AS user_id, ${grant.characterId}::bigint AS character_id,
      ${ROLE_RANK[grant.role]}::integer AS role_rank,
      NOT ${userBlockedFromMap(grant.userId, sql`${mapId}::uuid`)} AS unblocked
  `), sql` UNION ALL `);
  await database.execute(sql`
    WITH candidates AS (${candidates}), permitted AS (
      SELECT candidate.character_id,
        LEAST(candidate.role_rank, CASE WHEN managed.user_id = candidate.user_id THEN 3
          ELSE COALESCE(authority.role_rank, 0) END) AS role_rank
      FROM candidates AS candidate
      INNER JOIN ${maps} AS managed ON managed.id = ${mapId}
      INNER JOIN ${account} AS owned
        ON owned.user_id = candidate.user_id AND owned.provider_id = ${EVE_PROVIDER_ID}
        AND owned.account_id = candidate.character_id::text
      LEFT JOIN ${characters} AS owned_profile ON owned_profile.character_id = candidate.character_id
      CROSS JOIN LATERAL (
        SELECT max(CASE current_grant.role
          WHEN 'admin' THEN 3 WHEN 'editor' THEN 2 ELSE 1 END) AS role_rank
        FROM ${mapAccess} AS current_grant
        INNER JOIN ${account} AS linked ON linked.user_id = candidate.user_id
          AND linked.provider_id = ${EVE_PROVIDER_ID}
        LEFT JOIN ${characters} AS profile ON profile.character_id::text = linked.account_id
        WHERE current_grant.map_id = managed.id
          AND ${sharedAccessEligible('linked', authorizationFailureCutoff)}
          AND (
            (current_grant.owner_type = 'character' AND current_grant.owner_id::text = linked.account_id)
            OR (current_grant.owner_type = 'corporation' AND current_grant.owner_id = profile.corporation_id)
          )
      ) AS authority
      WHERE managed.character_scoped_at IS NULL AND managed.archived_at IS NULL
        AND managed.tombstoned_at IS NULL
        AND (managed.user_id = candidate.user_id OR candidate.unblocked)
        AND NOT (
          ${sharedAccessEligible('owned', authorizationFailureCutoff)} AND EXISTS (
            SELECT 1 FROM ${mapAccess} AS matching
            WHERE matching.map_id = managed.id AND (
              (matching.owner_type = 'character' AND matching.owner_id = candidate.character_id)
              OR (matching.owner_type = 'corporation' AND matching.owner_id = owned_profile.corporation_id)
            )
          )
        )
    )
    INSERT INTO ${mapAccess} (map_id, owner_type, owner_id, role)
    SELECT ${mapId}, 'character'::"public"."map_access_owner_type", character_id,
      (CASE role_rank WHEN 3 THEN 'admin' WHEN 2 THEN 'editor' ELSE 'viewer' END)::"public"."map_role"
    FROM permitted WHERE role_rank > 0
    ON CONFLICT (map_id, owner_type, owner_id) DO NOTHING
  `);
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
