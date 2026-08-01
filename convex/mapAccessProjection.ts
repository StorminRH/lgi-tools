// The sole production writer of the projected mapAccess claim table.
//
// Neon remains the authority: every durable grant change computes a complete desired
// claim set and posts it here. This module only converges storage to that stated set —
// it never reads Neon, never invents grants, and never answers a durable authority
// question. Teardown (claims: []) and resynchronization are the same idempotent
// operation as a grant-change projection.
import { v } from 'convex/values';
import {
  canonicalizeMapRoles,
  type MapRole,
} from '@/data/maps/access-contract';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { mapRoleValidator } from './lib/mapEntityContracts';

/** Maximum claim rows one user-purge call deletes, bounding the transaction write budget. */
export const MAP_ACCESS_PURGE_BATCH = 128;

/** Counts returned by one full-state reconcile for evidence and idempotence proofs. */
export interface ReconcileCounts {
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly unchanged: number;
}

/** Outcome of one bounded per-user claim purge, including exact continuation truth. */
export interface UserClaimsPurgeResult {
  readonly deleted: number;
  readonly hasMore: boolean;
}

function rolesEqual(left: readonly MapRole[], right: readonly MapRole[]): boolean {
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

/**
 * Last-entry-wins desired claim map: roles are canonicalized, and empty roles
 * mean absence so they never create a ghost row.
 */
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
  if (rows.length === 0) {
    await ctx.db.insert('mapAccess', { mapId, userId, roles });
    return { inserted: 1, updated: 0, deleted: 0, unchanged: 0 };
  }

  // rows.length > 0 was checked above; keeper is the first existing claim.
  const keeper = rows[0]!;
  let deleted = 0;
  for (const duplicate of rows.slice(1)) {
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

/**
 * Converges the mapAccess table to exactly the stated claim set for one map:
 * inserts missing rows, replaces rows whose ordered roles differ, deletes rows
 * for absent users and every duplicate beyond the first, and skips identical
 * rows so an unchanged re-projection writes nothing. Guarantees exactly one
 * row per (mapId, userId) afterwards for ANY caller: the desired input is
 * last-entry-wins deduped by userId and each roles array is canonicalized
 * (unique values, MAP_ROLE_PRECEDENCE order) before compare/store, so a
 * repeated userId or unordered roles in one payload cannot create duplicates
 * or byte-different equal sets. Empty claims = full teardown for the map;
 * empty roles on a present userId also mean absence.
 */
export const reconcileMapClaims = internalMutation({
  args: {
    mapId: v.string(),
    claims: v.array(
      v.object({
        userId: v.string(),
        roles: v.array(mapRoleValidator),
      }),
    ),
  },
  handler: async (ctx, { mapId, claims }): Promise<ReconcileCounts> => {
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

    deleted += await deleteClaimRows(ctx, byUser.values());
    return { inserted, updated, deleted, unchanged };
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

    return {
      deleted: doomed.length,
      hasMore: rows.length > MAP_ACCESS_PURGE_BATCH,
    };
  },
});
