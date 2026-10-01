import { v } from 'convex/values';
import {
  canonicalizeMapRoles,
  type MapRole,
} from '@/data/maps/access-contract';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  currentMapRoleValidator,
  currentRolesFromStored,
  mapClaimCharactersValidator,
  type MapClaimCharacter,
  type StoredMapRole,
} from './lib/mapEntityContracts';
import {
  deleteAllTrackingForMap,
  deleteTrackingForUser,
  deleteTrackingOutsideCharacters,
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
  left: readonly StoredMapRole[],
  right: readonly MapRole[],
): boolean {
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

interface DesiredClaim {
  readonly roles: MapRole[];
  readonly characters: MapClaimCharacter[] | undefined;
}

function toDesiredClaims(
  claims: ReadonlyArray<{
    readonly userId: string;
    readonly roles: readonly MapRole[];
    readonly characters?: readonly MapClaimCharacter[];
  }>,
): Map<string, DesiredClaim> {
  const desired = new Map<string, DesiredClaim>();
  for (const claim of claims) {
    const roles = canonicalizeMapRoles(claim.roles);
    if (roles.length === 0) continue;
    desired.set(claim.userId, {
      roles,
      characters: claim.characters === undefined ? undefined : [...claim.characters],
    });
  }
  return desired;
}

function charactersEqual(
  left: readonly MapClaimCharacter[] | undefined,
  right: readonly MapClaimCharacter[] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((character, index) =>
    character.characterId === right[index]?.characterId && character.name === right[index]?.name);
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
  claim: DesiredClaim,
  rows: Doc<'mapAccess'>[],
): Promise<Pick<ReconcileCounts, 'inserted' | 'updated' | 'deleted' | 'unchanged'>> {
  const { roles, characters } = claim;
  const [keeper, ...duplicates] = rows;
  if (keeper === undefined) {
    await ctx.db.insert('mapAccess', { mapId, userId, roles, characters });
    return { inserted: 1, updated: 0, deleted: 0, unchanged: 0 };
  }

  let deleted = 0;
  for (const duplicate of duplicates) {
    await ctx.db.delete(duplicate._id);
    deleted += 1;
  }

  if (rolesEqual(keeper.roles, roles) && charactersEqual(keeper.characters, characters)) {
    return { inserted: 0, updated: 0, deleted, unchanged: 1 };
  }

  await ctx.db.replace(keeper._id, { mapId, userId, roles, characters });
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
        characters: v.optional(mapClaimCharactersValidator),
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

    for (const [userId, claim] of desired) {
      const rows = byUser.get(userId) ?? [];
      byUser.delete(userId);
      const delta = await applyDesiredUserClaim(ctx, mapId, userId, claim, rows);
      inserted += delta.inserted;
      updated += delta.updated;
      deleted += delta.deleted;
      unchanged += delta.unchanged;
      if (claim.characters !== undefined) {
        await deleteTrackingOutsideCharacters(ctx, mapId, userId, claim.characters);
      }
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

// A character unlink can affect more maps than one projection request can deliver.
// Revoke only this user's affected claims before removing the linked account; other
// maps and other users retain their access while the full projections catch up.
export const purgeUserMapClaims = internalMutation({
  args: { userId: v.string(), revision: v.number(), mapIds: v.array(v.string()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { userId, revision, mapIds }) => {
    let deleted = 0;
    for (const mapId of new Set(mapIds)) {
      const watermark = await ctx.db
        .query('mapAccessProjectionWatermarks')
        .withIndex('by_map', (q) => q.eq('mapId', mapId))
        .unique();
      if (watermark === null) {
        await ctx.db.insert('mapAccessProjectionWatermarks', { mapId, revision });
      } else if (watermark.revision < revision) {
        await ctx.db.patch(watermark._id, { revision });
      }
      const rows = await ctx.db
        .query('mapAccess')
        .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
        .take(MAP_ACCESS_PURGE_BATCH);
      for (const row of rows) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    return { deleted };
  },
});

export const remapLegacyOwnerRoles = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    remapped: v.number(),
    continueCursor: v.union(v.string(), v.null()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('mapAccess').paginate({
      numItems: MAP_ACCESS_PURGE_BATCH,
      cursor: cursor ?? null,
    });
    let remapped = 0;
    for (const row of page.page) {
      const roles = currentRolesFromStored(row.roles);
      if (rolesEqual(row.roles, roles)) continue;
      await ctx.db.patch(row._id, { roles });
      remapped += 1;
    }
    return {
      remapped,
      continueCursor: page.isDone ? null : page.continueCursor,
      isDone: page.isDone,
    };
  },
});
