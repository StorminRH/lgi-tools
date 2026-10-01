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
import { readMapTracking } from './lib/mapTrackingCapacity';
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

/**
 * `characterScoped` is present (and true) only when the map's claims carry
 * characters, so a caller that never sends them sees the old response shape.
 * `unscoped-refused` answers a claim set without characters for a map that
 * already went character-scoped: a sender running older code must retry.
 */
export type ReconcileResult = ReconcileCounts & {
  readonly outcome: 'applied' | 'duplicate' | 'stale' | 'unscoped-refused';
  readonly characterScoped?: true;
};

const NO_COUNTS: ReconcileCounts = { inserted: 0, updated: 0, deleted: 0, unchanged: 0 };

function claimsCarryCharacters(
  claims: ReadonlyArray<{ readonly characters?: readonly MapClaimCharacter[] }>,
): boolean {
  return claims.length > 0 && claims.every((claim) => claim.characters !== undefined);
}

function scopedMarker(scoped: boolean | undefined): { characterScoped?: true } {
  return scoped === true ? { characterScoped: true } : {};
}

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

function refusedOutcome(
  watermark: Doc<'mapAccessProjectionWatermarks'> | null,
  revision: number,
  claimCount: number,
  carried: boolean,
): ReconcileResult | null {
  if (watermark === null) return null;
  if (revision < watermark.revision) return { ...NO_COUNTS, outcome: 'stale' };
  if (watermark.revision === revision) {
    return { ...NO_COUNTS, outcome: 'duplicate', ...scopedMarker(watermark.characterScoped) };
  }
  if (watermark.characterScoped === true && claimCount > 0 && !carried) {
    return { ...NO_COUNTS, outcome: 'unscoped-refused' };
  }
  return null;
}

async function applyClaimSet(
  ctx: MutationCtx,
  mapId: string,
  desired: Map<string, DesiredClaim>,
): Promise<ReconcileCounts> {
  const existing = await ctx.db
    .query('mapAccess')
    .withIndex('by_map', (q) => q.eq('mapId', mapId))
    .collect();
  const byUser = indexClaimsByUser(existing);
  const counts = { ...NO_COUNTS };

  for (const [userId, claim] of desired) {
    const rows = byUser.get(userId) ?? [];
    byUser.delete(userId);
    const delta = await applyDesiredUserClaim(ctx, mapId, userId, claim, rows);
    counts.inserted += delta.inserted;
    counts.updated += delta.updated;
    counts.deleted += delta.deleted;
    counts.unchanged += delta.unchanged;
    if (claim.characters !== undefined) {
      await deleteTrackingOutsideCharacters(ctx, mapId, userId, claim.characters);
    }
  }

  const revokedUserIds = [...byUser.keys()];
  counts.deleted += await deleteClaimRows(ctx, byUser.values());
  if (desired.size === 0) {
    await deleteAllTrackingForMap(ctx, mapId);
  } else {
    for (const userId of revokedUserIds) {
      await deleteTrackingForUser(ctx, mapId, userId);
    }
  }
  return counts;
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
      v.literal('unscoped-refused'),
    ),
    characterScoped: v.optional(v.literal(true)),
  }),
  handler: async (ctx, { mapId, revision, claims }): Promise<ReconcileResult> => {
    const watermark = await ctx.db
      .query('mapAccessProjectionWatermarks')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .unique();
    const carried = claimsCarryCharacters(claims);
    const refused = refusedOutcome(watermark, revision, claims.length, carried);
    if (refused !== null) return refused;

    const counts = await applyClaimSet(ctx, mapId, toDesiredClaims(claims));
    const characterScoped = watermark?.characterScoped === true || carried ? true : undefined;
    if (watermark === null) {
      await ctx.db.insert('mapAccessProjectionWatermarks', { mapId, revision, characterScoped });
    } else {
      await ctx.db.patch(watermark._id, {
        revision, characterScoped,
        ...(carried ? { scopingPending: undefined } : {}),
      });
    }
    return { ...counts, outcome: 'applied', ...scopedMarker(carried) };
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

export const freezeMapTrackingForScoping = internalMutation({
  args: { mapId: v.string() },
  returns: v.array(v.object({ userId: v.string(), characterId: v.number() })),
  handler: async (ctx, { mapId }) => {
    const watermark = await ctx.db.query('mapAccessProjectionWatermarks')
      .withIndex('by_map', (q) => q.eq('mapId', mapId)).unique();
    if (watermark === null) {
      await ctx.db.insert('mapAccessProjectionWatermarks', { mapId, revision: 0, scopingPending: true });
    } else if (watermark.characterScoped !== true) {
      await ctx.db.patch(watermark._id, { scopingPending: true });
    }
    return (await readMapTracking(ctx, mapId))
      .map(({ userId, characterId }) => ({ userId, characterId }));
  },
});
