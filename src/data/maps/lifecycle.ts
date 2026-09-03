import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import type { MapPrincipals } from './access';
import {
  authorizedAdminMapsSelection,
  mapAuthorizationRows,
} from './authorization-sql';
import { MAP_DELETE_GRACE_MS } from './queries';
import { maps } from './schema';

const MAP_PURGE_MAPS_PER_RUN = 25;

export const MAP_STAGED_PURGE_HOLD_MS = 30_000;

export const ADVISORY_LOCK_MAP_PURGE = 8_273_619_019;

export interface PurgeableMap {
  readonly id: string;
}

function oneAuthorizedRow(
  result: Awaited<ReturnType<AnyPgDb['execute']>>,
): boolean {
  return mapAuthorizationRows(result).length === 1;
}

export async function archiveAuthorizedMap(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  now: Date = new Date(),
  database: AnyPgDb = db,
): Promise<boolean> {
  const nowIso = now.toISOString();
  const result = await database.execute(sql`
    WITH authorized_map AS (
      ${authorizedAdminMapsSelection(
        userId,
        principals,
        [mapId],
        sql`${maps.archivedAt} IS NULL AND ${maps.tombstonedAt} IS NULL`,
      )}
    )
    UPDATE ${maps}
    SET archived_at = ${nowIso}::timestamptz,
        purge_requested_at = NULL,
        purge_claimed_at = NULL,
        tombstoned_at = NULL,
        lifecycle_status = 'archived',
        lifecycle_entered_at = ${nowIso}::timestamptz,
        updated_at = ${nowIso}::timestamptz
    WHERE ${maps.id} IN (SELECT id FROM authorized_map)
    RETURNING ${maps.id}
  `);
  return oneAuthorizedRow(result);
}

export async function restoreAuthorizedMap(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  now: Date = new Date(),
  database: AnyPgDb = db,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - MAP_DELETE_GRACE_MS);
  const cutoffIso = cutoff.toISOString();
  const nowIso = now.toISOString();
  const result = await database.execute(sql`
    WITH authorized_map AS (
      ${authorizedAdminMapsSelection(
        userId,
        principals,
        [mapId],
        sql`${maps.archivedAt} IS NOT NULL
          AND ${maps.archivedAt} > ${cutoffIso}::timestamptz
          AND ${maps.purgeRequestedAt} IS NULL
          AND ${maps.purgeClaimedAt} IS NULL
          AND ${maps.tombstonedAt} IS NULL`,
      )}
    )
    UPDATE ${maps}
    SET archived_at = NULL,
        purge_requested_at = NULL,
        purge_claimed_at = NULL,
        tombstoned_at = NULL,
        lifecycle_status = 'active',
        lifecycle_entered_at = ${nowIso}::timestamptz,
        updated_at = ${nowIso}::timestamptz
    WHERE ${maps.id} IN (SELECT id FROM authorized_map)
    RETURNING ${maps.id}
  `);
  return oneAuthorizedRow(result);
}

export async function requestAuthorizedMapPurge(
  userId: string,
  mapId: string,
  now: Date = new Date(),
  database: AnyPgDb = db,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - MAP_DELETE_GRACE_MS);
  const updated = await database
    .update(maps)
    .set({
      purgeRequestedAt: now,
      lifecycleStatus: 'purge_queued',
      lifecycleEnteredAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(maps.id, mapId),
        eq(maps.userId, userId),
        isNotNull(maps.archivedAt),
        gte(maps.archivedAt, cutoff),
        isNull(maps.tombstonedAt),
        isNull(maps.purgeRequestedAt),
        isNull(maps.purgeClaimedAt),
      ),
    )
    .returning({ id: maps.id });
  return updated.length === 1;
}

function purgeEligibility(now: Date) {
  const graceCutoff = new Date(now.getTime() - MAP_DELETE_GRACE_MS);
  const stagedHoldCutoff = new Date(now.getTime() - MAP_STAGED_PURGE_HOLD_MS);
  return and(
    isNotNull(maps.archivedAt),
    isNull(maps.tombstonedAt),
    or(
      and(
        isNotNull(maps.purgeRequestedAt),
        lte(maps.createdAt, stagedHoldCutoff),
      ),
      lte(maps.archivedAt, graceCutoff),
    ),
  );
}

export async function claimPurgeableMaps(
  now: Date = new Date(),
  limit = MAP_PURGE_MAPS_PER_RUN,
  database: AnyPgDb = db,
): Promise<PurgeableMap[]> {
  const candidates = await database
    .select({ id: maps.id })
    .from(maps)
    .where(purgeEligibility(now))
    .orderBy(
      asc(sql`coalesce(${maps.purgeRequestedAt}, ${maps.archivedAt})`),
      asc(maps.id),
    )
    .limit(limit);
  if (candidates.length === 0) return [];

  const claimed = await database
    .update(maps)
    .set({
      purgeClaimedAt: now,
      lifecycleStatus: 'purge_claimed',
      lifecycleEnteredAt: now,
      updatedAt: now,
    })
    .where(
      and(
        inArray(
          maps.id,
          candidates.map(({ id }) => id),
        ),
        purgeEligibility(now),
      ),
    )
    .returning({ id: maps.id });
  const order = new Map(candidates.map(({ id }, index) => [id, index]));
  return claimed.sort(
    (left, right) =>
      (order.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

export async function tombstonePurgedMap(
  mapId: string,
  now: Date = new Date(),
  database: AnyPgDb = db,
): Promise<boolean> {
  const updated = await database
    .update(maps)
    .set({
      tombstonedAt: now,
      lifecycleStatus: 'tombstoned',
      lifecycleEnteredAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(maps.id, mapId),
        isNotNull(maps.purgeClaimedAt),
        purgeEligibility(now),
      ),
    )
    .returning({ id: maps.id });
  return updated.length === 1;
}
