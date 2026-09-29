// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingOptIn';
import schema from './schema';

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
