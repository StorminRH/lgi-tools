// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import schema from './schema';
import { modules } from './__tests__/modules.setup';
import { purgeTrackingForUserBatch } from './mapTrackingTeardown';

const MAP_A = 'map-a';
const MAP_B = 'map-b';
const LEAVER = 'user-leaver';
const STAYER = 'user-stayer';
const SHARED = 90_000_001;
const SOLO = 90_000_002;

test('a user tracking purge keeps jump bookkeeping only while another tracker of that map and character survives', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: LEAVER, characterId: SHARED });
    await ctx.db.insert('mapTracking', { mapId: MAP_B, userId: LEAVER, characterId: SHARED });
    await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: LEAVER, characterId: SOLO });
    await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: STAYER, characterId: SHARED });
    for (const [mapId, characterId] of [[MAP_A, SHARED], [MAP_B, SHARED], [MAP_A, SOLO]] as const) {
      await ctx.db.insert('mapJumpBookkeeping', { mapId, characterId, lastProcessedTransitionAt: 1 });
    }
  });
  const stamps = () => t.run(async (ctx) =>
    (await ctx.db.query('mapJumpBookkeeping').collect()).map((row) => `${row.mapId}:${row.characterId}`),
  );

  // The batch takes the leaver's two SHARED rows; MAP_A's stamp stays for the stayer.
  expect(await t.run((ctx) => purgeTrackingForUserBatch(ctx, LEAVER, 2))).toEqual({ deleted: 2, hasMore: true });
  expect(await stamps()).toEqual([`${MAP_A}:${SHARED}`, `${MAP_A}:${SOLO}`]);

  expect(await t.run((ctx) => purgeTrackingForUserBatch(ctx, LEAVER, 2))).toEqual({ deleted: 1, hasMore: false });
  expect(await stamps()).toEqual([`${MAP_A}:${SHARED}`]);

  expect(await t.run((ctx) => purgeTrackingForUserBatch(ctx, STAYER, 2))).toEqual({ deleted: 1, hasMore: false });
  expect(await stamps()).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query('mapTracking').collect())).toEqual([]);
});
