import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { tryMapAccessForUser } from './lib/mapAccess';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingOptIn';
import { readMapTracking, requireMapTrackingSpace } from './lib/mapTrackingCapacity';
import { deleteTrackingRow } from './mapTrackingTeardown';

export interface MergeUserStateResult {
  readonly trackingMoved: number;
  readonly trackingDropped: number;
  readonly deleted: number;
}

async function moveTrackingRow(
  ctx: MutationCtx,
  row: Doc<'mapTracking'>,
  survivorUserId: string,
): Promise<'moved' | 'duplicate' | 'dropped'> {
  const survivorRows = await ctx.db
    .query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', row.mapId).eq('userId', survivorUserId))
    .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP);
  if (survivorRows.some((survivorRow) => survivorRow.characterId === row.characterId)) {
    await ctx.db.delete(row._id);
    return 'duplicate';
  }
  if (survivorRows.length >= TRACKED_CHARACTERS_PER_MAP_USER_CAP) {
    await deleteTrackingRow(ctx, row);
    return 'dropped';
  }
  await ctx.db.patch(row._id, { userId: survivorUserId });
  return 'moved';
}

export const mergeUserState = internalMutation({
  args: { sourceUserId: v.string(), survivorUserId: v.string() },
  returns: v.object({
    trackingMoved: v.number(),
    trackingDropped: v.number(),
    deleted: v.number(),
  }),
  handler: async (ctx, { sourceUserId, survivorUserId }): Promise<MergeUserStateResult> => {
    const counts = { trackingMoved: 0, trackingDropped: 0, deleted: 0 };
    const tracking = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) => q.eq('userId', sourceUserId))
      .collect();
    for (const row of tracking) {
      const outcome = await moveTrackingRow(ctx, row, survivorUserId);
      if (outcome === 'moved') counts.trackingMoved += 1;
      else if (outcome === 'dropped') counts.trackingDropped += 1;
      else counts.deleted += 1;
    }
    const claims = await ctx.db
      .query('mapAccess')
      .withIndex('by_user', (q) => q.eq('userId', sourceUserId))
      .collect();
    for (const claim of claims) {
      await ctx.db.delete(claim._id);
    }
    const drained = await ctx.runMutation(internal.characterLocationPurge.purgeForUser, {
      userId: sourceUserId,
      characterId: null,
    });
    counts.deleted += claims.length + drained.deletedLocations + drained.deletedTracking;
    return counts;
  },
});

const MERGE_TRACKING_LIMIT = 1000;
const trackingSelectionValidator = v.object({
  mapId: v.string(), characterId: v.number(), lastProcessedTransitionAt: v.optional(v.number()),
});

export const snapshotMergeTracking = internalQuery({
  args: { sourceUserId: v.string() },
  returns: v.object({ selections: v.array(trackingSelectionValidator) }),
  handler: async (ctx, { sourceUserId }) => {
    const rows = await ctx.db.query('mapTracking')
      .withIndex('by_user_character', (q) => q.eq('userId', sourceUserId))
      .take(MERGE_TRACKING_LIMIT + 1);
    if (rows.length > MERGE_TRACKING_LIMIT) {
      throw new ConvexError('Too many tracking selections to safely snapshot this merge');
    }
    const selections = await Promise.all(rows.map(async ({ mapId, characterId }) => {
      const stamp = await ctx.db.query('mapJumpBookkeeping')
        .withIndex('by_map_character', (q) => q.eq('mapId', mapId).eq('characterId', characterId))
        .unique();
      return { mapId, characterId,
        ...(stamp === null ? {} : { lastProcessedTransitionAt: stamp.lastProcessedTransitionAt }),
      };
    }));
    return { selections };
  },
});

export const restoreMergeTracking = internalMutation({
  args: {
    operationId: v.string(),
    survivorUserId: v.string(),
    selections: v.array(trackingSelectionValidator),
  },
  returns: v.object({ restored: v.number(), skipped: v.number(), alreadyApplied: v.boolean() }),
  handler: async (ctx, { operationId, survivorUserId, selections }) => {
    if (selections.length > MERGE_TRACKING_LIMIT) {
      throw new ConvexError('Too many tracking selections to safely restore this merge');
    }
    const receipt = await ctx.db.query('accountMergeTrackingReceipts')
      .withIndex('by_operation', (q) => q.eq('operationId', operationId)).unique();
    if (receipt !== null) return { restored: 0, skipped: 0, alreadyApplied: true };

    // SQL has already checked current character ownership. Re-check map access
    // here so a concurrent claim revocation conflicts with this transaction.
    const byMap = new Map<string, typeof selections>();
    for (const selection of selections) {
      const rows = byMap.get(selection.mapId) ?? [];
      rows.push(selection);
      byMap.set(selection.mapId, rows);
    }
    let restored = 0;
    let skipped = 0;
    for (const [mapId, characterIds] of byMap) {
      if (await tryMapAccessForUser(ctx, mapId, survivorUserId, 'view') === null) {
        skipped += characterIds.length;
        continue;
      }
      const existing = await ctx.db.query('mapTracking')
        .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', survivorUserId))
        .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP);
      const tracked = new Set(existing.map((row) => row.characterId));
      let count = existing.length;
      let mapCount: number | undefined;
      for (const { characterId, lastProcessedTransitionAt } of characterIds) {
        if (tracked.has(characterId)) {
          skipped += 1;
        } else {
          if (count >= TRACKED_CHARACTERS_PER_MAP_USER_CAP) {
            skipped += 1;
            continue;
          }
          // Check capacity only for inserts; fail atomically so recovery can retry.
          mapCount ??= (await readMapTracking(ctx, mapId)).length;
          requireMapTrackingSpace(mapCount);
          await ctx.db.insert('mapTracking', { mapId, userId: survivorUserId, characterId });
          mapCount += 1;
          tracked.add(characterId);
          count += 1;
          restored += 1;
        }
        if (lastProcessedTransitionAt !== undefined) {
          await restoreTransitionStamp(ctx, mapId, characterId, lastProcessedTransitionAt);
        }
      }
    }
    // Keep this receipt independently of source/destination teardown. A lost
    // response must never make a later retry undo the user's subsequent opt-out.
    await ctx.db.insert('accountMergeTrackingReceipts', { operationId });
    return { restored, skipped, alreadyApplied: false };
  },
});

async function restoreTransitionStamp(
  ctx: MutationCtx, mapId: string, characterId: number, lastProcessedTransitionAt: number,
): Promise<void> {
  const stamp = await ctx.db.query('mapJumpBookkeeping')
    .withIndex('by_map_character', (q) => q.eq('mapId', mapId).eq('characterId', characterId))
    .unique();
  if (stamp === null) {
    await ctx.db.insert('mapJumpBookkeeping', { mapId, characterId, lastProcessedTransitionAt });
  } else if (stamp.lastProcessedTransitionAt < lastProcessedTransitionAt) {
    await ctx.db.patch(stamp._id, { lastProcessedTransitionAt });
  }
}
