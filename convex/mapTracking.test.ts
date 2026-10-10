// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import { TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingOptIn';
import schema from './schema';
import { readTrackedPilotSystemIds } from './mapTrackingLive';
import { TRACKED_CHARACTERS_PER_MAP_CAP } from './lib/mapTrackingCapacity';

import { claimReconciler, expectConvexErrorCode, type Chain } from './__tests__/convexTest.setup';
import { modules } from './__tests__/modules.setup';

const tracking = {
  setTracking: api.mapTrackingOptIn.setTracking,
  forMap: api.mapTrackingLive.forMap,
  coverage: api.mapTrackingLive.coverage,
} as const;

const MAP_A = 'map-a';
const MAP_B = 'map-b';
const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const CHAR = 90_000_001;
const CHAR_B = 90_000_002;


function asUser(t: Chain, userId: string) {
  return t.withIdentity({ subject: userId });
}

async function readBookkeeping(t: Chain) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query('mapJumpBookkeeping').collect();
    return rows
      .map((row) => ({
        mapId: row.mapId,
        characterId: row.characterId,
        lastProcessedTransitionAt: row.lastProcessedTransitionAt,
      }))
      .sort(
        (left, right) =>
          left.mapId.localeCompare(right.mapId) || left.characterId - right.characterId,
      );
  });
}

async function readTracking(t: Chain, mapId?: string) {
  return t.run(async (ctx) => {
    const rows =
      mapId === undefined
        ? await ctx.db.query('mapTracking').collect()
        : await ctx.db
            .query('mapTracking')
            .withIndex('by_map', (q) => q.eq('mapId', mapId))
            .collect();
    return rows
      .map((row) => ({
        mapId: row.mapId,
        userId: row.userId,
        characterId: row.characterId,
      }))
      .sort(
        (left, right) =>
          left.mapId.localeCompare(right.mapId) ||
          left.userId.localeCompare(right.userId) ||
          left.characterId - right.characterId,
      );
  });
}

describe('mapTracking.setTracking', () => {
  it('opts one character into tracking per map and tears it down independently', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await reconcile(MAP_B, [{ userId: OWNER, roles: ['admin'] }]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_B,
      characterId: CHAR,
      tracked: true,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
      { mapId: MAP_B, userId: OWNER, characterId: CHAR },
    ]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_B, userId: OWNER, characterId: CHAR },
    ]);
  });

  it('is idempotent on repeated opt-in and opt-out', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    expect(await readTracking(t, MAP_A)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });
    expect(await readTracking(t, MAP_A)).toEqual([]);
  });

  it('deletes that map+character bookkeeping stamp on untrack and leaves the rest', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await reconcile(MAP_B, [{ userId: OWNER, roles: ['admin'] }]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR_B,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_B,
      characterId: CHAR,
      tracked: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR,
        lastProcessedTransitionAt: 1,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR_B,
        lastProcessedTransitionAt: 2,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_B,
        characterId: CHAR,
        lastProcessedTransitionAt: 3,
      });
    });

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: false,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR_B },
      { mapId: MAP_B, userId: OWNER, characterId: CHAR },
    ]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR_B, lastProcessedTransitionAt: 2 },
      { mapId: MAP_B, characterId: CHAR, lastProcessedTransitionAt: 3 },
    ]);
  });

  it('preserves a foreign tracker stamp when the caller has no matching row', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: true,
    });
    await t.run((ctx) => ctx.db.insert('mapJumpBookkeeping', {
      mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100,
    }));

    await asUser(t, EDITOR).mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: false,
    });

    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100 },
    ]);
    await expectConvexErrorCode(asUser(t, 'no-access').mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: false,
    }), 'FORBIDDEN');
  });

  it('retains shared bookkeeping until the last user stops tracking', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    for (const userId of [OWNER, EDITOR]) {
      await asUser(t, userId).mutation(tracking.setTracking, {
        mapId: MAP_A, characterId: CHAR, tracked: true,
      });
    }
    await t.run((ctx) => ctx.db.insert('mapJumpBookkeeping', {
      mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100,
    }));

    await asUser(t, EDITOR).mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: false,
    });
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100 },
    ]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A, characterId: CHAR, tracked: false,
    });
    expect(await readBookkeeping(t)).toEqual([]);
  });

  it('refuses opt-in beyond the per-(map, user) cap but keeps toggle-off/re-add working', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    const caller = asUser(t, OWNER);
    await t.run(async (ctx) => {
      for (let index = 0; index < TRACKED_CHARACTERS_PER_MAP_USER_CAP; index += 1) {
        await ctx.db.insert('mapTracking', {
          mapId: MAP_A,
          userId: OWNER,
          characterId: 91_000_000 + index,
        });
      }
    });

    await expectConvexErrorCode(
      caller.mutation(tracking.setTracking, {
        mapId: MAP_A,
        characterId: 92_000_000,
        tracked: true,
      }),
      'TRACKING_CAP_EXCEEDED',
    );

    await caller.mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: 91_000_000,
      tracked: true,
    });
    await caller.mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: 91_000_000,
      tracked: false,
    });
    await caller.mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: 92_000_000,
      tracked: true,
    });
  });

  it('shows all pilots beyond 256 and enforces map capacity without blocking opt-out', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await t.run(async (ctx) => {
      for (let index = 0; index < TRACKED_CHARACTERS_PER_MAP_CAP - 1; index += 1) {
        await ctx.db.insert('mapTracking', {
          mapId: MAP_A, userId: `pilot-${index}`, characterId: index + 1,
        });
      }
    });
    const caller = asUser(t, OWNER);
    const selection = { mapId: MAP_A, characterId: CHAR, tracked: true };
    await caller.mutation(tracking.setTracking, selection);
    await caller.mutation(tracking.setTracking, selection);
    const result = await caller.query(tracking.forMap, { mapId: MAP_A });
    expect(result.tracked).toHaveLength(TRACKED_CHARACTERS_PER_MAP_CAP);
    expect(result.ownTrackedCharacterIds).toEqual([CHAR]);
    const coverage = await caller.query(tracking.coverage, {
      mapId: MAP_A,
      characterIds: result.tracked.map(({ characterId }) => characterId),
    });
    expect(coverage.coverage).toHaveLength(TRACKED_CHARACTERS_PER_MAP_CAP);
    await expectConvexErrorCode(caller.mutation(tracking.setTracking, {
      ...selection, characterId: CHAR_B,
    }), 'TRACKING_MAP_CAP_EXCEEDED');
    await caller.mutation(tracking.setTracking, { ...selection, tracked: false });
    await caller.mutation(tracking.setTracking, { ...selection, characterId: CHAR_B });

    // A legacy or directly imported oversized map must fail visibly, never truncate.
    await t.run((ctx) => ctx.db.insert('mapTracking', {
      mapId: MAP_A, userId: 'legacy-overflow', characterId: CHAR,
    }));
    await expectConvexErrorCode(caller.query(tracking.forMap, { mapId: MAP_A }), 'TRACKING_SCAN_LIMIT');
    await expectConvexErrorCode(t.run((ctx) => readTrackedPilotSystemIds(ctx, MAP_A)), 'TRACKING_SCAN_LIMIT');
  });

  it('refuses setTracking without a map-access claim', async () => {
    const t = convexTest(schema, modules);
    await expectConvexErrorCode(
      asUser(t, OWNER).mutation(tracking.setTracking, {
        mapId: MAP_A,
        characterId: CHAR,
        tracked: true,
      }),
      'FORBIDDEN',
    );
  });
});

describe('mapTrackingLive.forMap', () => {
  it('keys tracked rows by character, never naming the tracking account, and discloses nothing for a forged row', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: MAP_A,
        userId: EDITOR,
        characterId: CHAR,
      });
      await ctx.db.insert('mapTracking', {
        mapId: MAP_A,
        userId: EDITOR,
        characterId: CHAR_B,
      });
      await ctx.db.insert('characterLocation', {
        userId: OWNER,
        characterId: CHAR,
        solarSystemId: 30_000_142,
        stationId: null,
        structureId: null,
        shipTypeId: 670,
        prevSolarSystemId: null,
        prevFresh: false,
        transitionObservedAt: 1_699_999_999_000,
        observedAt: 1_700_000_000_000,
        etagLocation: 'loc-1',
        etagShip: 'ship-1',
      });
    });

    const result = await asUser(t, OWNER).query(tracking.forMap, { mapId: MAP_A });

    expect(result.ownTrackedCharacterIds).toEqual([CHAR]);
    expect(result.tracked).toEqual([{
      userId: '',
      characterId: CHAR,
      location: {
        solarSystemId: 30_000_142,
        stationId: null,
        structureId: null,
        shipTypeId: 670,
        prevSolarSystemId: null,
        prevFresh: false,
        transitionObservedAt: 1_699_999_999_000,
        observedAt: 1_700_000_000_000,
      },
    }, { userId: '', characterId: CHAR_B, location: null }]);
    expect(JSON.stringify(result)).not.toContain(OWNER);
    expect(JSON.stringify(result)).not.toContain(EDITOR);
  });

  it('answers coverage per character: covered when any tracking account holds flip-only coverage', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR_B,
      tracked: true,
    });
    await asUser(t, EDITOR).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationCovered', {
        userId: OWNER,
        characterId: CHAR,
      });
    });

    const overlay = await asUser(t, OWNER).query(tracking.forMap, { mapId: MAP_A });
    expect(overlay.tracked.map((row) => row.characterId)).toEqual([CHAR, CHAR_B]);
    const result = await asUser(t, EDITOR).query(tracking.coverage, {
      mapId: MAP_A,
      characterIds: overlay.tracked.map((row) => row.characterId),
    });
    expect(result.coverage).toEqual([
      { characterId: CHAR, covered: true },
      { characterId: CHAR_B, covered: false },
    ]);
    expect(JSON.stringify(result)).not.toContain(OWNER);
    const anyRow = overlay.tracked[0];
    expect(anyRow).toBeDefined();
    if (anyRow === undefined) throw new Error('expected a tracked overlay row');
    expect('covered' in anyRow).toBe(false);
  });

  it('finds coverage held only by the thirty-third account tracking a shared character', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await t.run(async (ctx) => {
      for (let index = 0; index < 33; index += 1) {
        const userId = `tracker-${index}`;
        await ctx.db.insert('mapTracking', { mapId: MAP_A, userId, characterId: CHAR });
        if (index === 32) {
          await ctx.db.insert('characterLocationCovered', { userId, characterId: CHAR });
        }
      }
      await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: OWNER, characterId: CHAR + 2 });
      await ctx.db.insert('characterLocationCovered', { userId: OWNER, characterId: CHAR + 2 });
    });

    expect(await asUser(t, OWNER).query(tracking.coverage, {
      mapId: MAP_A, characterIds: [CHAR_B, CHAR],
    })).toEqual({ coverage: [
      { characterId: CHAR, covered: true },
      { characterId: CHAR_B, covered: false },
    ] });
    expect(await asUser(t, OWNER).query(tracking.coverage, {
      mapId: MAP_A, identities: [{ userId: 'ignored', characterId: CHAR }],
    })).toEqual({ coverage: [{ userId: '', characterId: CHAR, covered: true }] });
  });

  it('reduces parallel locations by movement time and preserves the first location on ties', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await t.run(async (ctx) => {
      for (const [index, transitionObservedAt, observedAt] of [
        [0, 100, 500], [1, 200, 300], [2, 200, 900],
      ] as const) {
        const userId = `tracker-${index}`;
        await ctx.db.insert('mapTracking', { mapId: MAP_A, userId, characterId: CHAR });
        await ctx.db.insert('characterLocation', {
          userId, characterId: CHAR, solarSystemId: 30_000_140 + index,
          stationId: null, structureId: null, shipTypeId: 670,
          prevSolarSystemId: null, prevFresh: false,
          transitionObservedAt, observedAt, etagLocation: null, etagShip: null,
        });
      }
      await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: 'without-location', characterId: CHAR });
      await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: 'without-location', characterId: CHAR_B });
    });

    expect(await asUser(t, OWNER).query(tracking.forMap, { mapId: MAP_A })).toEqual({
      ownTrackedCharacterIds: [],
      tracked: [
        { userId: '', characterId: CHAR, location: {
          solarSystemId: 30_000_141, stationId: null, structureId: null, shipTypeId: 670,
          prevSolarSystemId: null, prevFresh: false, transitionObservedAt: 200, observedAt: 300,
        } },
        { userId: '', characterId: CHAR_B, location: null },
      ],
    });
  });

  it('rejects map-wide coverage overflow for both client formats while disclosing nothing without access', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await t.run(async (ctx) => {
      for (let index = 0; index <= TRACKED_CHARACTERS_PER_MAP_CAP; index += 1) {
        await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: `tracker-${index}`, characterId: CHAR });
      }
    });
    for (const args of [
      { mapId: MAP_A, characterIds: [CHAR] },
      { mapId: MAP_A, identities: [{ userId: OWNER, characterId: CHAR }] },
    ]) {
      await expectConvexErrorCode(asUser(t, OWNER).query(tracking.coverage, args), 'TRACKING_SCAN_LIMIT');
      expect(await asUser(t, EDITOR).query(tracking.coverage, args)).toEqual({ coverage: [] });
    }
  });

  it('accepts older client identities while ignoring account identifiers and deduplicating characters', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: OWNER, characterId: CHAR });
      await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: EDITOR, characterId: CHAR_B });
      await ctx.db.insert('characterLocationCovered', { userId: OWNER, characterId: CHAR });
      await ctx.db.insert('characterLocationCovered', { userId: 'untracked-account', characterId: CHAR_B });
    });
    const caller = asUser(t, OWNER);
    const overlay = await caller.query(tracking.forMap, { mapId: MAP_A });
    const identities = overlay.tracked
      .map(({ userId, characterId }) => ({ userId, characterId }))
      .sort((left, right) => left.userId.localeCompare(right.userId) || left.characterId - right.characterId);
    const fromOldClient = await caller.query(tracking.coverage, { mapId: MAP_A, identities });
    expect(fromOldClient.coverage).toEqual([
      { userId: '', characterId: CHAR, covered: true },
      { userId: '', characterId: CHAR_B, covered: false },
    ]);
    const forged = await caller.query(tracking.coverage, {
      mapId: MAP_A,
      identities: [
        { userId: 'untracked-account', characterId: CHAR_B },
        { userId: 'unknown-account', characterId: CHAR },
        { characterId: CHAR },
      ],
    });
    expect(forged).toEqual(fromOldClient);
    expect(JSON.stringify({ overlay, forged })).not.toMatch(/user-owner|user-editor|untracked-account|unknown-account/);
    expect(await caller.query(tracking.coverage, { mapId: MAP_A, identities: [] }))
      .toEqual({ coverage: [] });
  });

  it.each(['characterIds', 'identities'] as const)('answers %s coverage as an empty list without access (subscription doctrine)', async (input) => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    const args = input === 'characterIds'
      ? { mapId: MAP_A, characterIds: [CHAR] }
      : { mapId: MAP_A, identities: [{ userId: OWNER, characterId: CHAR }] };
    const result = await asUser(t, EDITOR).query(tracking.coverage, args);
    expect(result.coverage).toEqual([]);
  });

  it.each(['characterIds', 'identities'] as const)('rejects oversized %s coverage requests before deduplication', async (input) => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    const characterIds = Array.from({ length: TRACKED_CHARACTERS_PER_MAP_CAP + 1 }, () => CHAR);
    const args = input === 'characterIds'
      ? { mapId: MAP_A, characterIds }
      : { mapId: MAP_A, identities: characterIds.map((characterId) => ({ userId: OWNER, characterId })) };
    await expectConvexErrorCode(asUser(t, OWNER).query(tracking.coverage, args), 'TRACKING_SCAN_LIMIT');
  });

  it.each([
    { mapId: MAP_A },
    { mapId: MAP_A, characterIds: [], identities: [] },
  ])('rejects coverage requests without exactly one input shape (%j)', async (args) => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await expectConvexErrorCode(asUser(t, OWNER).query(tracking.coverage, args), 'INVALID_COVERAGE_ARGS');
  });

  it('answers coverage only for characters tracked on the map', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocationCovered', {
        userId: OWNER,
        characterId: CHAR,
      });
    });

    const characterIds = [CHAR_B, CHAR];
    const untracked = await asUser(t, OWNER).query(tracking.coverage, {
      mapId: MAP_A,
      characterIds,
    });
    expect(untracked.coverage).toEqual([
      { characterId: CHAR, covered: false },
      { characterId: CHAR_B, covered: false },
    ]);

    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    const tracked = await asUser(t, OWNER).query(tracking.coverage, {
      mapId: MAP_A,
      characterIds,
    });
    expect(tracked.coverage).toEqual([
      { characterId: CHAR, covered: true },
      { characterId: CHAR_B, covered: false },
    ]);
  });

  it('returns an empty tracked list when access is revoked (subscription doctrine)', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });

    await reconcile(MAP_A, []);

    const result = await asUser(t, OWNER).query(tracking.forMap, { mapId: MAP_A });
    expect(result).toEqual({ tracked: [], ownTrackedCharacterIds: [] });
  });
});

describe('mapTracking revocation cascade', () => {
  it('deletes the revoked user\'s mapTracking rows in the same reconcile apply', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await asUser(t, EDITOR).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR_B,
      tracked: true,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR,
        lastProcessedTransitionAt: 11,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR_B,
        lastProcessedTransitionAt: 12,
      });
    });

    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);

    expect(await readTracking(t, MAP_A)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 11 },
    ]);
  });

  it('retains shared bookkeeping through one user revocation and clears it on map teardown', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [
      { userId: OWNER, roles: ['admin'] },
      { userId: EDITOR, roles: ['editor'] },
    ]);
    for (const userId of [OWNER, EDITOR]) {
      await asUser(t, userId).mutation(tracking.setTracking, {
        mapId: MAP_A, characterId: CHAR, tracked: true,
      });
    }
    await t.run((ctx) => ctx.db.insert('mapJumpBookkeeping', {
      mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100,
    }));

    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    expect(await readTracking(t)).toEqual([
      { mapId: MAP_A, userId: OWNER, characterId: CHAR },
    ]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100 },
    ]);
    await reconcile(MAP_A, []);
    expect(await readTracking(t)).toEqual([]);
    expect(await readBookkeeping(t)).toEqual([]);
  });

  it('retains shared bookkeeping through a user purge until the last tracker is purged', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const userId of [OWNER, EDITOR, 'third-user']) {
        await ctx.db.insert('mapTracking', {
          mapId: MAP_A, userId, characterId: CHAR,
        });
      }
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100,
      });
    });
    for (const userId of [OWNER, EDITOR]) {
      await t.mutation(internal.mapAccessProjection.purgeUserClaims, { userId });
      expect(await readBookkeeping(t)).toEqual([
        { mapId: MAP_A, characterId: CHAR, lastProcessedTransitionAt: 100 },
      ]);
    }
    await t.mutation(internal.mapAccessProjection.purgeUserClaims, {
      userId: 'third-user',
    });
    expect(await readTracking(t)).toEqual([]);
    expect(await readBookkeeping(t)).toEqual([]);
  });

  it('sweeps every mapTracking row on full map teardown (claims: [])', async () => {
    const t = convexTest(schema, modules);
    const reconcile = claimReconciler(t);
    await reconcile(MAP_A, [{ userId: OWNER, roles: ['admin'] }]);
    await asUser(t, OWNER).mutation(tracking.setTracking, {
      mapId: MAP_A,
      characterId: CHAR,
      tracked: true,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: MAP_A,
        userId: 'orphaned',
        characterId: CHAR_B,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR,
        lastProcessedTransitionAt: 21,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_A,
        characterId: CHAR_B,
        lastProcessedTransitionAt: 22,
      });
      await ctx.db.insert('mapJumpBookkeeping', {
        mapId: MAP_B,
        characterId: CHAR,
        lastProcessedTransitionAt: 23,
      });
    });

    await reconcile(MAP_A, []);

    expect(await readTracking(t, MAP_A)).toEqual([]);
    expect(await readBookkeeping(t)).toEqual([
      { mapId: MAP_B, characterId: CHAR, lastProcessedTransitionAt: 23 },
    ]);
  });
});
