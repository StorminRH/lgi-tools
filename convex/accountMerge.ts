import { ConvexError, v, type Infer } from 'convex/values';
import { MERGE_RECEIPT_BATCH_SIZE, MERGE_RECEIPT_RETENTION_MS } from '@/data/location-tracking/constants';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx } from './_generated/server';
import { characterTrackable, requireMapTrackingOpen, tryMapAccessForUser } from './lib/mapAccess';
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
    let restored = 0;
    let skipped = 0;
    for (const [mapId, mapSelections] of groupSelectionsByMap(selections)) {
      const counts = await restoreMapSelections(ctx, mapId, survivorUserId, mapSelections);
      restored += counts.restored;
      skipped += counts.skipped;
    }
    // Keep this receipt independently of source/destination teardown. A lost
    // response must never make a later retry undo the user's subsequent opt-out.
    await ctx.db.insert('accountMergeTrackingReceipts', { operationId });
    return { restored, skipped, alreadyApplied: false };
  },
});

const receiptCandidateValidator = v.object({
  receiptId: v.id('accountMergeTrackingReceipts'),
  operationId: v.string(),
});

export const listExpiredTrackingReceipts = internalQuery({
  args: { cutoff: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    receipts: v.array(receiptCandidateValidator),
    cursor: v.string(),
    done: v.boolean(),
  }),
  handler: async (ctx, { cutoff, cursor }) => {
    const page = await ctx.db.query('accountMergeTrackingReceipts')
      .withIndex('by_creation_time', (q) => q.lt('_creationTime', cutoff))
      .paginate({ cursor, numItems: MERGE_RECEIPT_BATCH_SIZE });
    return {
      receipts: page.page.map((row) => ({ receiptId: row._id, operationId: row.operationId })),
      cursor: page.continueCursor,
      done: page.isDone,
    };
  },
});

export const deleteExpiredTrackingReceipts = internalMutation({
  args: { cutoff: v.number(), receipts: v.array(receiptCandidateValidator) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { cutoff, receipts }) => {
    if (receipts.length > MERGE_RECEIPT_BATCH_SIZE) {
      throw new ConvexError('Too many tracking receipts to delete in one batch');
    }
    const expiredBefore = Math.min(cutoff, Date.now() - MERGE_RECEIPT_RETENTION_MS);
    let deleted = 0;
    for (const { receiptId, operationId } of receipts) {
      const receipt = await ctx.db.get('accountMergeTrackingReceipts', receiptId);
      if (receipt === null || receipt.operationId !== operationId || receipt._creationTime >= expiredBefore) continue;
      await ctx.db.delete('accountMergeTrackingReceipts', receiptId);
      deleted += 1;
    }
    return { deleted };
  },
});

type TrackingSelection = Infer<typeof trackingSelectionValidator>;

interface RestoreCounts {
  restored: number;
  skipped: number;
}

interface SurvivorTrackingSlots {
  readonly tracked: Set<number>;
  count: number;
  mapCount: number | undefined;
}

function groupSelectionsByMap(
  selections: readonly TrackingSelection[],
): Map<string, TrackingSelection[]> {
  const byMap = new Map<string, TrackingSelection[]>();
  for (const selection of selections) {
    const rows = byMap.get(selection.mapId) ?? [];
    rows.push(selection);
    byMap.set(selection.mapId, rows);
  }
  return byMap;
}

async function restoreMapSelections(
  ctx: MutationCtx,
  mapId: string,
  survivorUserId: string,
  selections: readonly TrackingSelection[],
): Promise<RestoreCounts> {
  await requireMapTrackingOpen(ctx, mapId);
  const principal = await tryMapAccessForUser(ctx, mapId, survivorUserId, 'view');
  if (principal === null) {
    return { restored: 0, skipped: selections.length };
  }
  const existing = await ctx.db.query('mapTracking')
    .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', survivorUserId))
    .take(TRACKED_CHARACTERS_PER_MAP_USER_CAP);
  const slots: SurvivorTrackingSlots = {
    tracked: new Set(existing.map((row) => row.characterId)),
    count: existing.length,
    mapCount: undefined,
  };
  const counts: RestoreCounts = { restored: 0, skipped: 0 };
  for (const { characterId, lastProcessedTransitionAt } of selections) {
    const outcome = characterTrackable(principal, characterId)
      ? await restoreTrackingRow(ctx, mapId, survivorUserId, characterId, slots)
      : 'full';
    if (outcome === 'full') {
      counts.skipped += 1;
      continue;
    }
    if (outcome === 'inserted') counts.restored += 1;
    else counts.skipped += 1;
    if (lastProcessedTransitionAt !== undefined) {
      await restoreTransitionStamp(ctx, mapId, characterId, lastProcessedTransitionAt);
    }
  }
  return counts;
}

async function restoreTrackingRow(
  ctx: MutationCtx,
  mapId: string,
  survivorUserId: string,
  characterId: number,
  slots: SurvivorTrackingSlots,
): Promise<'present' | 'full' | 'inserted'> {
  if (slots.tracked.has(characterId)) return 'present';
  if (slots.count >= TRACKED_CHARACTERS_PER_MAP_USER_CAP) return 'full';
  // Fail atomically without recording a receipt so recovery can retry.
  slots.mapCount ??= (await readMapTracking(ctx, mapId)).length;
  requireMapTrackingSpace(slots.mapCount);
  await ctx.db.insert('mapTracking', { mapId, userId: survivorUserId, characterId });
  slots.mapCount += 1;
  slots.tracked.add(characterId);
  slots.count += 1;
  return 'inserted';
}

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
