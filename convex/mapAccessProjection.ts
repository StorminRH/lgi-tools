import { v } from 'convex/values';
import {
  canonicalizeMapRoles,
  type MapRole,
} from '@/data/maps/access-contract';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { currentMapRoleValidator } from './lib/mapEntityContracts';
import {
  deleteAllTrackingForMap,
  deleteTrackingForUser,
  purgeTrackingForUserBatch,
} from './mapTrackingTeardown';

export const MAP_ACCESS_PURGE_BATCH = 128;

export interface ReconcileCounts {
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly unchanged: number;
}

export type ReconcileResult = ReconcileCounts & {
  readonly outcome: 'applied' | 'duplicate' | 'stale';
};

export interface UserClaimsPurgeResult {
  readonly deleted: number;
  readonly hasMore: boolean;
}

function rolesEqual(
  left: readonly (MapRole | 'owner')[],
  right: readonly MapRole[],
): boolean {
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

function toDesiredClaims(
  claims: ReadonlyArray<{ readonly userId: string; readonly roles: readonly MapRole[] }>,
): Map<string, MapRole[]> {
  const desired = new Map<string, MapRole[]>();
  for (const claim of claims) {
    const roles = canonicalizeMapRoles(claim.roles);
    if (roles.length === 0) continue;
    desired.set(claim.userId, roles);
  }
  return desired;
}

function indexClaimsByUser(
  existing: Doc<'mapAccess'>[],
): Map<string, Doc<'mapAccess'>[]> {
  const byUser = new Map<string, Doc<'mapAccess'>[]>();
  for (const row of existing) {
    const rows = byUser.get(row.userId) ?? [];
    rows.push(row);
    byUser.set(row.userId, rows);
  }
  return byUser;
}

async function applyDesiredUserClaim(
  ctx: MutationCtx,
  mapId: string,
  userId: string,
  roles: MapRole[],
  rows: Doc<'mapAccess'>[],
): Promise<Pick<ReconcileCounts, 'inserted' | 'updated' | 'deleted' | 'unchanged'>> {
  const [keeper, ...duplicates] = rows;
  if (keeper === undefined) {
    await ctx.db.insert('mapAccess', { mapId, userId, roles });
    return { inserted: 1, updated: 0, deleted: 0, unchanged: 0 };
  }

  let deleted = 0;
  for (const duplicate of duplicates) {
    await ctx.db.delete(duplicate._id);
    deleted += 1;
  }

  if (rolesEqual(keeper.roles, roles)) {
    return { inserted: 0, updated: 0, deleted, unchanged: 1 };
  }

  await ctx.db.patch(keeper._id, { roles });
  return { inserted: 0, updated: 1, deleted, unchanged: 0 };
}

async function deleteClaimRows(
  ctx: MutationCtx,
  rows: Iterable<Doc<'mapAccess'>[]>,
): Promise<number> {
  let deleted = 0;
  for (const group of rows) {
    for (const row of group) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }
  }
  return deleted;
}

export const reconcileMapClaims = internalMutation({
  args: {
    mapId: v.string(),
    revision: v.number(),
    claims: v.array(
      v.object({
        userId: v.string(),
        roles: v.array(currentMapRoleValidator),
      }),
    ),
  },
  returns: v.object({
    inserted: v.number(),
    updated: v.number(),
    deleted: v.number(),
    unchanged: v.number(),
    outcome: v.union(
      v.literal('applied'),
      v.literal('duplicate'),
      v.literal('stale'),
    ),
  }),
  handler: async (ctx, { mapId, revision, claims }): Promise<ReconcileResult> => {
    const watermark = await ctx.db
      .query('mapAccessProjectionWatermarks')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .unique();
    if (watermark !== null && revision < watermark.revision) {
      return {
        inserted: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        outcome: 'stale',
      };
    }
    if (watermark?.revision === revision) {
      return {
        inserted: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        outcome: 'duplicate',
      };
    }

    const desired = toDesiredClaims(claims);
    const existing = await ctx.db
      .query('mapAccess')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .collect();
    const byUser = indexClaimsByUser(existing);

    let inserted = 0;
    let updated = 0;
    let deleted = 0;
    let unchanged = 0;

    for (const [userId, roles] of desired) {
      const rows = byUser.get(userId) ?? [];
      byUser.delete(userId);
      const delta = await applyDesiredUserClaim(ctx, mapId, userId, roles, rows);
      inserted += delta.inserted;
      updated += delta.updated;
      deleted += delta.deleted;
      unchanged += delta.unchanged;
    }

    const revokedUserIds = [...byUser.keys()];
    deleted += await deleteClaimRows(ctx, byUser.values());
    if (desired.size === 0) {
      await deleteAllTrackingForMap(ctx, mapId);
    } else {
      for (const userId of revokedUserIds) {
        await deleteTrackingForUser(ctx, mapId, userId);
      }
    }
    if (watermark === null) {
      await ctx.db.insert('mapAccessProjectionWatermarks', { mapId, revision });
    } else {
      await ctx.db.patch(watermark._id, { revision });
    }
    return {
      inserted,
      updated,
      deleted,
      unchanged,
      outcome: 'applied',
    };
  },
});

/**
 * Deletes one user's claims across all maps through by_user in batches of at
 * most 128, returning deleted and hasMore so the calling HTTP action can loop
 * to completion without an unbounded single-transaction scan.
 */
export const purgeUserClaims = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<UserClaimsPurgeResult> => {
    const rows = await ctx.db
      .query('mapAccess')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(MAP_ACCESS_PURGE_BATCH + 1);

    const doomed = rows.slice(0, MAP_ACCESS_PURGE_BATCH);
    for (const row of doomed) {
      await ctx.db.delete(row._id);
    }

    // Also sweep the user's mapTracking rows: the dedicated best-effort
    // /purge-location-tracking door can fail silently, and a deleted account
    // has no later sync or projection to reclaim its rows — without this,
    // forMap would keep serving the purged user's last-known location to
    // every remaining map member indefinitely.
    const tracking = await purgeTrackingForUserBatch(
      ctx,
      userId,
      MAP_ACCESS_PURGE_BATCH,
    );

    return {
      deleted: doomed.length + tracking.deleted,
      hasMore: rows.length > MAP_ACCESS_PURGE_BATCH || tracking.hasMore,
    };
  },
});
