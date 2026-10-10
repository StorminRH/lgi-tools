import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { db } from '@/db';
import { executeRows } from '@/lib/db-execute';
import type { AnyPgDb } from '@/lib/db-types';
import type { MapPrincipals } from './access';
import {
  activeAdminMapsSelection,
  authorizedAdminMapsSelection,
  enqueuePendingMapAccessSelection,
  type PendingMapAccessChange,
} from './authorization-sql';
import {
  activeMapLifecycle,
  archivedMapLifecycle,
  MAP_DELETE_GRACE_MS,
  purgeClaimedMapLifecycle,
  purgeQueuedMapLifecycle,
  tombstonedMapLifecycle,
} from './lifecycle-contract';
import { restorableMapCondition } from './lifecycle-sql';
import { maps } from './schema';

const MAP_PURGE_MAPS_PER_RUN = 25;

export const MAP_STAGED_PURGE_HOLD_MS = 30_000;

export interface PurgeableMap {
  readonly id: string;
}

/**
 * Moves the authorized map into `lifecycle`, then queues its reprojection, in
 * one statement. `.getSQL()` keeps the UPDATE bare: an interpolated builder
 * would be parenthesised, and a CTE body cannot be.
 */
async function transitionAuthorizedMap(
  authorizedMap: SQL,
  lifecycle: ReturnType<typeof activeMapLifecycle> | ReturnType<typeof archivedMapLifecycle>,
  now: Date,
  database: AnyPgDb,
): Promise<PendingMapAccessChange | null> {
  const update = database
    .update(maps)
    .set({ ...lifecycle, updatedAt: now })
    .where(sql`${maps.id} IN (SELECT id FROM authorized_map)`)
    .returning({ id: maps.id });
  const [row] = await executeRows<PendingMapAccessChange>(database, sql`
    WITH authorized_map AS (${authorizedMap}), updated AS (${update.getSQL()})
    ${enqueuePendingMapAccessSelection(sql`SELECT id FROM updated`)}
  `);
  return row ?? null;
}

export async function archiveAuthorizedMap(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  now: Date = new Date(),
  database: AnyPgDb = db,
): Promise<PendingMapAccessChange | null> {
  return transitionAuthorizedMap(
    activeAdminMapsSelection(userId, principals, [mapId]),
    archivedMapLifecycle(now),
    now,
    database,
  );
}

export async function restoreAuthorizedMap(
  userId: string,
  principals: MapPrincipals,
  mapId: string,
  now: Date = new Date(),
  database: AnyPgDb = db,
): Promise<PendingMapAccessChange | null> {
  return transitionAuthorizedMap(
    authorizedAdminMapsSelection(userId, principals, [mapId], restorableMapCondition(now)),
    activeMapLifecycle(now),
    now,
    database,
  );
}

export async function requestAuthorizedMapPurge(
  userId: string,
  mapId: string,
  now: Date = new Date(),
  database: AnyPgDb = db,
): Promise<boolean> {
  const updated = await database
    .update(maps)
    .set({ ...purgeQueuedMapLifecycle(now), updatedAt: now })
    .where(and(eq(maps.id, mapId), eq(maps.userId, userId), restorableMapCondition(now)))
    .returning({ id: maps.id });
  return updated.length === 1;
}

/** Sweepable maps. The grace arm is the complement of restorableMapCondition. */
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

  const lifecycle = purgeClaimedMapLifecycle(now);
  const claimed = await database
    .update(maps)
    .set({
      ...lifecycle,
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
    .set({ ...tombstonedMapLifecycle(now), updatedAt: now })
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
