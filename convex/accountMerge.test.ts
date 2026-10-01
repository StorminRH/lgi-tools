// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MERGE_RECEIPT_BATCH_SIZE, MERGE_RECEIPT_RETENTION_MS } from '@/data/location-tracking/constants';
import { api, internal } from './_generated/api';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingOptIn';
import schema from './schema';
import { TRACKED_CHARACTERS_PER_MAP_CAP } from './lib/mapTrackingCapacity';

import { modules } from './__tests__/modules.setup';
import { accessLease, CHAR_A, CHAR_B, locationDoc } from './__tests__/characterLocation.setup';

const SOURCE = 'user-source';
const SURVIVOR = 'user-survivor';
const BYSTANDER = 'user-bystander';
const CHAR_C = 90_000_103;

async function readTracking(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query('mapTracking').collect();
    return rows
      .map((row) => ({ mapId: row.mapId, userId: row.userId, characterId: row.characterId }))
      .sort(
        (left, right) =>
          left.mapId.localeCompare(right.mapId) ||
          left.userId.localeCompare(right.userId) ||
          left.characterId - right.characterId,
      );
  });
}

describe('accountMerge.mergeUserState', () => {
  it('moves tracking intent onto the survivor, dedupes shared pairs, drops past the cap, and drains the source', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', { mapId: 'map-move', userId: SOURCE, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-move', userId: SOURCE, characterId: CHAR_B });
      await ctx.db.insert('mapTracking', { mapId: 'map-dup', userId: SOURCE, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-dup', userId: SURVIVOR, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-dup', userId: BYSTANDER, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'map-full', userId: SOURCE, characterId: CHAR_C });
      for (let index = 0; index < TRACKED_CHARACTERS_PER_MAP_USER_CAP; index += 1) {
        await ctx.db.insert('mapTracking', { mapId: 'map-full', userId: SURVIVOR, characterId: 1000 + index });
      }
      await ctx.db.insert('mapJumpBookkeeping', { mapId: 'map-dup', characterId: CHAR_A, lastProcessedTransitionAt: 1 });
      await ctx.db.insert('mapJumpBookkeeping', { mapId: 'map-full', characterId: CHAR_C, lastProcessedTransitionAt: 2 });
      await ctx.db.insert('mapAccess', { mapId: 'map-move', userId: SOURCE, roles: ['viewer'] });
      await ctx.db.insert('mapAccess', { mapId: 'map-move', userId: SURVIVOR, roles: ['admin'] });
      await ctx.db.insert('characterLocation', locationDoc(SOURCE, CHAR_A));
      await ctx.db.insert('characterLocation', locationDoc(SURVIVOR, CHAR_C));
      await ctx.db.insert('characterLocationAccess', accessLease(SOURCE, CHAR_A));
      await ctx.db.insert('characterLocationAccess', accessLease(SURVIVOR, CHAR_C));
      await ctx.db.insert('characterLocationCovered', { userId: SOURCE, characterId: CHAR_A });
      await ctx.db.insert('characterLocationOnline', {
        userId: SOURCE, characterId: CHAR_A, online: true, etagOnline: null, onlineExpiresAt: 1,
      });
    });

    const out = await t.mutation(internal.accountMerge.mergeUserState, {
      sourceUserId: SOURCE,
      survivorUserId: SURVIVOR,
    });

    expect(out).toEqual({ trackingMoved: 2, trackingDropped: 1, deleted: 3 });
    expect(await readTracking(t)).toEqual([
      { mapId: 'map-dup', userId: BYSTANDER, characterId: CHAR_A },
      { mapId: 'map-dup', userId: SURVIVOR, characterId: CHAR_A },
      ...Array.from({ length: TRACKED_CHARACTERS_PER_MAP_USER_CAP }, (_, index) => ({
        mapId: 'map-full', userId: SURVIVOR, characterId: 1000 + index,
      })),
      { mapId: 'map-move', userId: SURVIVOR, characterId: CHAR_A },
      { mapId: 'map-move', userId: SURVIVOR, characterId: CHAR_B },
    ]);
    const after = await t.run(async (ctx) => ({
      bookkeeping: (await ctx.db.query('mapJumpBookkeeping').collect()).map((row) => row.mapId),
      claims: (await ctx.db.query('mapAccess').collect()).map((row) => `${row.mapId}:${row.userId}`),
      locations: (await ctx.db.query('characterLocation').collect()).map((row) => row.userId),
      leases: (await ctx.db.query('characterLocationAccess').collect()).map((row) => row.userId),
      covered: (await ctx.db.query('characterLocationCovered').collect()).map((row) => row.userId),
      online: (await ctx.db.query('characterLocationOnline').collect()).map((row) => row.userId),
    }));
    expect(after).toEqual({
      bookkeeping: ['map-dup'],
      claims: ['map-move:user-survivor'],
      locations: [SURVIVOR],
      leases: [SURVIVOR],
      covered: [],
      online: [],
    });

    await expect(
      t.mutation(internal.accountMerge.mergeUserState, { sourceUserId: SOURCE, survivorUserId: SURVIVOR }),
    ).resolves.toEqual({ trackingMoved: 0, trackingDropped: 0, deleted: 0 });
    expect((await readTracking(t)).filter((row) => row.userId === SURVIVOR)).toHaveLength(
      TRACKED_CHARACTERS_PER_MAP_USER_CAP + 3,
    );
  });
});

describe('durable merge tracking recovery', () => {
  it('snapshots without changing source state, and refuses a truncated snapshot', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: SOURCE, characterId: CHAR_A });
    });
    await expect(t.query(internal.accountMerge.snapshotMergeTracking, { sourceUserId: SOURCE }))
      .resolves.toEqual({ selections: [{ mapId: 'map-a', characterId: CHAR_A }] });
    expect(await readTracking(t)).toHaveLength(1);
    await t.run(async (ctx) => {
      for (let i = 0; i < 1000; i += 1) {
        await ctx.db.insert('mapTracking', { mapId: `map-${i}`, userId: SOURCE, characterId: i + 1 });
      }
    });
    await expect(t.query(internal.accountMerge.snapshotMergeTracking, { sourceUserId: SOURCE }))
      .rejects.toThrow('Too many tracking selections');
  });

  it('recovers after source cleanup, deduplicates, caps and rejects missing claims', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', { mapId: 'map-a', userId: SOURCE, characterId: CHAR_A });
      await ctx.db.insert('mapAccess', { mapId: 'map-a', userId: SURVIVOR, roles: ['viewer'] });
      await ctx.db.insert('mapAccess', { mapId: 'full', userId: SURVIVOR, roles: ['viewer'] });
      for (let i = 0; i < TRACKED_CHARACTERS_PER_MAP_USER_CAP; i += 1) {
        await ctx.db.insert('mapTracking', { mapId: 'full', userId: SURVIVOR, characterId: i + 1 });
      }
    });
    const snapshot = await t.query(internal.accountMerge.snapshotMergeTracking, { sourceUserId: SOURCE });
    await t.mutation(internal.mapAccessProjection.purgeUserClaims, { userId: SOURCE });
    const result = await t.mutation(internal.accountMerge.restoreMergeTracking, {
      operationId: 'recovery', survivorUserId: SURVIVOR,
      selections: [...snapshot.selections, ...snapshot.selections,
        { mapId: 'full', characterId: CHAR_A }, { mapId: 'denied', characterId: CHAR_A }],
    });
    expect(result).toEqual({ restored: 1, skipped: 3, alreadyApplied: false });
    expect((await readTracking(t)).filter((row) => row.mapId === 'map-a'))
      .toEqual([{ mapId: 'map-a', userId: SURVIVOR, characterId: CHAR_A }]);
  });

  it('restores only the survivor\'s eligible characters on a character-scoped map', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', { mapId: 'scoped', userId: SOURCE, characterId: CHAR_A });
      await ctx.db.insert('mapTracking', { mapId: 'scoped', userId: SOURCE, characterId: CHAR_B });
      await ctx.db.insert('mapAccess', {
        mapId: 'scoped', userId: SURVIVOR, roles: ['viewer'],
        characters: [{ characterId: CHAR_B, name: 'Kept' }],
      });
    });
    const snapshot = await t.query(internal.accountMerge.snapshotMergeTracking, { sourceUserId: SOURCE });
    await t.mutation(internal.mapAccessProjection.purgeUserClaims, { userId: SOURCE });
    const result = await t.mutation(internal.accountMerge.restoreMergeTracking, {
      operationId: 'scoped-recovery', survivorUserId: SURVIVOR, selections: snapshot.selections,
    });
    expect(result).toEqual({ restored: 1, skipped: 1, alreadyApplied: false });
    expect(await readTracking(t)).toEqual([{ mapId: 'scoped', userId: SURVIVOR, characterId: CHAR_B }]);
  });

  it('does not undo an opt-out when a lost-response retry arrives, even after retargeting', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', { mapId: 'map-a', userId: SURVIVOR, roles: ['viewer'] });
      await ctx.db.insert('mapAccess', { mapId: 'map-a', userId: BYSTANDER, roles: ['viewer'] });
    });
    const args = { operationId: 'once', survivorUserId: SURVIVOR,
      selections: [{ mapId: 'map-a', characterId: CHAR_A }] };
    await t.mutation(internal.accountMerge.restoreMergeTracking, args);
    await t.withIdentity({ subject: SURVIVOR }).mutation(api.mapTrackingOptIn.setTracking, {
      mapId: 'map-a', characterId: CHAR_A, tracked: false,
    });
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .resolves.toEqual({ restored: 0, skipped: 0, alreadyApplied: true });
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, { ...args, survivorUserId: BYSTANDER }))
      .resolves.toEqual({ restored: 0, skipped: 0, alreadyApplied: true });
    expect(await readTracking(t)).toEqual([]);
  });

  it('records a no-insert recovery on a legacy oversized map', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', { mapId: 'oversized', userId: SURVIVOR, roles: ['viewer'] });
      await ctx.db.insert('mapTracking', {
        mapId: 'oversized', userId: SURVIVOR, characterId: CHAR_A,
      });
      for (let i = 0; i < TRACKED_CHARACTERS_PER_MAP_CAP; i += 1) {
        await ctx.db.insert('mapTracking', {
          mapId: 'oversized', userId: `pilot-${i}`, characterId: i + 1,
        });
      }
    });
    const args = { operationId: 'oversized-no-insert', survivorUserId: SURVIVOR,
      selections: [{ mapId: 'oversized', characterId: CHAR_A, lastProcessedTransitionAt: 100 }] };
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .resolves.toEqual({ restored: 0, skipped: 1, alreadyApplied: false });
    expect(await readTracking(t)).toHaveLength(TRACKED_CHARACTERS_PER_MAP_CAP + 1);
    const state = await t.run(async (ctx) => ({
      receipt: await ctx.db.query('accountMergeTrackingReceipts')
        .withIndex('by_operation', (q) => q.eq('operationId', args.operationId)).unique(),
      stamp: await ctx.db.query('mapJumpBookkeeping')
        .withIndex('by_map_character', (q) => q.eq('mapId', 'oversized').eq('characterId', CHAR_A)).unique(),
    }));
    expect(state.receipt?.operationId).toBe(args.operationId);
    expect(state.stamp?.lastProcessedTransitionAt).toBe(100);
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .resolves.toEqual({ restored: 0, skipped: 0, alreadyApplied: true });
  });

  it('leaves a full-map recovery retryable until capacity becomes available', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', { mapId: 'full', userId: SURVIVOR, roles: ['viewer'] });
      for (let i = 0; i < TRACKED_CHARACTERS_PER_MAP_CAP; i += 1) {
        await ctx.db.insert('mapTracking', {
          mapId: 'full', userId: `pilot-${i}`, characterId: i + 1,
        });
      }
    });
    const args = { operationId: 'full-map', survivorUserId: SURVIVOR,
      selections: [{ mapId: 'full', characterId: CHAR_A }] };
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .rejects.toThrow('TRACKING_MAP_CAP_EXCEEDED');
    expect(await t.run((ctx) => ctx.db.query('accountMergeTrackingReceipts').collect())).toEqual([]);
    await t.run(async (ctx) => {
      const row = await ctx.db.query('mapTracking').first();
      if (row !== null) await ctx.db.delete(row._id);
    });
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .resolves.toEqual({ restored: 1, skipped: 0, alreadyApplied: false });
  });

  it('rejects oversized restore atomically without recording a receipt', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, {
      operationId: 'large', survivorUserId: SURVIVOR,
      selections: Array.from({ length: 1001 }, (_, i) => ({ mapId: 'a', characterId: i + 1 })),
    })).rejects.toThrow('Too many tracking selections');
    expect(await t.run((ctx) => ctx.db.query('accountMergeTrackingReceipts').collect())).toEqual([]);
  });
});

it('preserves processed jump evidence through cleanup and never rewinds a newer stamp', async () => {
  const t = convexTest(schema, modules);
  const mapId = 'map-stamp';
  const processedAt = 1_699_999_999_000;
  await t.run(async (ctx) => {
    await ctx.db.insert('mapTracking', { mapId, userId: SOURCE, characterId: CHAR_A });
    await ctx.db.insert('mapJumpBookkeeping', { mapId, characterId: CHAR_A, lastProcessedTransitionAt: processedAt });
    await ctx.db.insert('mapAccess', { mapId, userId: SURVIVOR, roles: ['editor'] });
    await ctx.db.insert('characterLocation', {
      ...locationDoc(SURVIVOR, CHAR_A), prevSolarSystemId: 30_000_001, prevFresh: true,
    });
    await ctx.db.insert('mapSystems', { mapId, systemId: 30_000_001, deletedAt: null, purgeAfter: null });
  });
  const { selections } = await t.query(internal.accountMerge.snapshotMergeTracking, { sourceUserId: SOURCE });
  expect(selections).toEqual([{ mapId, characterId: CHAR_A, lastProcessedTransitionAt: processedAt }]);
  await t.mutation(internal.mapAccessProjection.purgeUserClaims, { userId: SOURCE });
  expect(await t.run((ctx) => ctx.db.query('mapJumpBookkeeping').collect())).toEqual([]);
  await t.mutation(internal.accountMerge.restoreMergeTracking, {
    operationId: 'stamp', survivorUserId: SURVIVOR, selections,
  });
  const evidence = await t.query(internal.mapJumpEvidence.jumpEvidence, {
    userId: SURVIVOR, mapId, characterId: CHAR_A,
  });
  expect(evidence).toMatchObject({ tracked: true, lastProcessedTransitionAt: processedAt, originLive: false });
  await t.mutation(internal.accountMerge.restoreMergeTracking, {
    operationId: 'newer-stamp', survivorUserId: SURVIVOR,
    selections: [{ mapId, characterId: CHAR_A, lastProcessedTransitionAt: processedAt + 10 }],
  });
  await t.mutation(internal.accountMerge.restoreMergeTracking, {
    operationId: 'older-stamp', survivorUserId: SURVIVOR, selections,
  });
  expect(await t.run((ctx) => ctx.db.query('mapJumpBookkeeping').collect()))
    .toEqual([expect.objectContaining({ lastProcessedTransitionAt: processedAt + 10 })]);
});

it('does not restore stamps for denied or cap-skipped tracking selections', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId: 'full', userId: SURVIVOR, roles: ['viewer'] });
    for (let i = 0; i < TRACKED_CHARACTERS_PER_MAP_USER_CAP; i += 1) {
      await ctx.db.insert('mapTracking', { mapId: 'full', userId: SURVIVOR, characterId: i + 1 });
    }
  });
  await t.mutation(internal.accountMerge.restoreMergeTracking, {
    operationId: 'skipped-stamps', survivorUserId: SURVIVOR,
    selections: ['full', 'denied'].map((mapId) => ({ mapId, characterId: CHAR_A, lastProcessedTransitionAt: 100 })),
  });
  expect(await t.run((ctx) => ctx.db.query('mapJumpBookkeeping').collect())).toEqual([]);
});


describe('merge tracking receipt retention', () => {
  const NOW = 1_800_000_000_000;
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => vi.useRealTimers());

  it('pages expired candidates past a full batch and excludes the cutoff and recent receipts', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let i = 0; i <= MERGE_RECEIPT_BATCH_SIZE; i += 1) {
        await ctx.db.insert('accountMergeTrackingReceipts', { operationId: `old-${i}` });
      }
    });
    vi.setSystemTime(NOW + MERGE_RECEIPT_RETENTION_MS);
    const recent = await t.run((ctx) => ctx.db.insert('accountMergeTrackingReceipts', { operationId: 'recent' }));
    const atCutoff = await t.query(internal.accountMerge.listExpiredTrackingReceipts, { cutoff: NOW, cursor: null });
    expect(atCutoff.receipts).toEqual([]);
    vi.setSystemTime(NOW + MERGE_RECEIPT_RETENTION_MS + 1);
    const args = { cutoff: NOW + 1, cursor: null };
    const first = await t.query(internal.accountMerge.listExpiredTrackingReceipts, args);
    expect(first.receipts).toHaveLength(MERGE_RECEIPT_BATCH_SIZE);
    expect(first.done).toBe(false);
    await t.mutation(internal.accountMerge.deleteExpiredTrackingReceipts, { cutoff: args.cutoff, receipts: first.receipts });
    const last = await t.query(internal.accountMerge.listExpiredTrackingReceipts, { ...args, cursor: first.cursor });
    expect(last.receipts).toHaveLength(1);
    expect(last.done).toBe(true);
    expect(last.receipts[0]?.operationId).toMatch(/^old-/);
    expect(await t.run((ctx) => ctx.db.get(recent))).not.toBeNull();
  });

  it('deletes only exact expired candidates and makes repeated deletion a no-op', async () => {
    const t = convexTest(schema, modules);
    const old = await t.run((ctx) => ctx.db.insert('accountMergeTrackingReceipts', { operationId: 'old' }));
    vi.setSystemTime(NOW + MERGE_RECEIPT_RETENTION_MS + 1);
    const recent = await t.run((ctx) => ctx.db.insert('accountMergeTrackingReceipts', { operationId: 'recent' }));
    const cutoff = NOW + 1;
    const badCandidates = [
      { receiptId: old, operationId: 'wrong' }, { receiptId: recent, operationId: 'recent' },
    ];
    await expect(t.mutation(internal.accountMerge.deleteExpiredTrackingReceipts, {
      cutoff: Date.now() + MERGE_RECEIPT_RETENTION_MS, receipts: badCandidates,
    })).resolves.toEqual({ deleted: 0 });
    const args = { cutoff, receipts: [{ receiptId: old, operationId: 'old' }] };
    await expect(t.mutation(internal.accountMerge.deleteExpiredTrackingReceipts, args)).resolves.toEqual({ deleted: 1 });
    await expect(t.mutation(internal.accountMerge.deleteExpiredTrackingReceipts, args)).resolves.toEqual({ deleted: 0 });
    expect(await t.run((ctx) => ctx.db.get(recent))).not.toBeNull();
    await expect(t.mutation(internal.accountMerge.deleteExpiredTrackingReceipts, {
      cutoff, receipts: Array.from({ length: MERGE_RECEIPT_BATCH_SIZE + 1 }, () => args.receipts[0]!),
    })).rejects.toThrow('Too many tracking receipts');
  });
});

describe('merge restoration during character scoping', () => {
  it('retains the merge for retry without a receipt or jump-stamp loss, and preserves later opt-out', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', { mapId: 'cutover', userId: SURVIVOR, roles: ['viewer'] });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: 'cutover', characterId: CHAR_A, lastProcessedTransitionAt: 10,
      });
    });
    await t.mutation(internal.mapAccessProjection.freezeMapTrackingForScoping, { mapId: 'cutover' });
    const args = {
      operationId: 'cutover-merge', survivorUserId: SURVIVOR,
      selections: [{ mapId: 'cutover', characterId: CHAR_A, lastProcessedTransitionAt: 20 }],
    };
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .rejects.toThrow('TRACKING_SCOPING_PENDING');
    await expect(t.run(async (ctx) => ({
      receipts: await ctx.db.query('accountMergeTrackingReceipts').collect(),
      tracking: await ctx.db.query('mapTracking').collect(),
      stamp: (await ctx.db.query('mapJumpBookkeeping').collect())[0]?.lastProcessedTransitionAt,
    }))).resolves.toEqual({ receipts: [], tracking: [], stamp: 10 });
    await t.mutation(internal.mapAccessProjection.reconcileMapClaims, {
      mapId: 'cutover', revision: 1,
      claims: [{ userId: SURVIVOR, roles: ['viewer'], characters: [{ characterId: CHAR_A, name: 'Main' }] }],
    });
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .resolves.toEqual({ restored: 1, skipped: 0, alreadyApplied: false });
    await expect(t.run(async (ctx) =>
      (await ctx.db.query('mapJumpBookkeeping').collect())[0]?.lastProcessedTransitionAt))
      .resolves.toBe(20);
    await t.withIdentity({ subject: SURVIVOR }).mutation(api.mapTrackingOptIn.setTracking, {
      mapId: 'cutover', characterId: CHAR_A, tracked: false,
    });
    await expect(t.mutation(internal.accountMerge.restoreMergeTracking, args))
      .resolves.toEqual({ restored: 0, skipped: 0, alreadyApplied: true });
    expect(await readTracking(t)).toEqual([]);
  });
});
