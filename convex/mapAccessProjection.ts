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
import { internalMutation } from './_generated/server';
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
 * Converges the mapAccess table to exactly the stated claim set for one map:
 * inserts missing rows, replaces rows whose ordered roles differ, deletes rows
 * for absent users and every duplicate beyond the first, and skips identical
 * rows so an unchanged re-projection writes nothing. Guarantees exactly one
 * row per (mapId, userId) afterwards for ANY caller: the desired input is
 * last-entry-wins deduped by userId and each roles array is canonicalized
 * (unique values, MAP_ROLE_PRECEDENCE order) before compare/store, so a
 * repeated userId or unordered roles in one payload cannot create duplicates
 * or byte-different equal sets. Empty claims = full teardown for the map.
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
    const desired = new Map<string, MapRole[]>();
    for (const claim of claims) {
      desired.set(claim.userId, canonicalizeMapRoles(claim.roles));
    }

    const existing = await ctx.db
      .query('mapAccess')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .collect();

    const byUser = new Map<string, typeof existing>();
    for (const row of existing) {
      const rows = byUser.get(row.userId) ?? [];
      rows.push(row);
      byUser.set(row.userId, rows);
    }

    let inserted = 0;
    let updated = 0;
    let deleted = 0;
    let unchanged = 0;

    for (const [userId, roles] of desired) {
      const rows = byUser.get(userId) ?? [];
      byUser.delete(userId);

      if (rows.length === 0) {
        await ctx.db.insert('mapAccess', { mapId, userId, roles });
        inserted += 1;
        continue;
      }

      // rows.length > 0 was checked above; keeper is the first existing claim.
      const keeper = rows[0]!;
      for (const duplicate of rows.slice(1)) {
        await ctx.db.delete(duplicate._id);
        deleted += 1;
      }

      if (rolesEqual(keeper.roles, roles)) {
        unchanged += 1;
        continue;
      }

      await ctx.db.patch(keeper._id, { roles });
      updated += 1;
    }

    for (const rows of byUser.values()) {
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

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
