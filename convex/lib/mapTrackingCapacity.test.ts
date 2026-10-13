// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import schema from '../schema';
import { modules } from '../__tests__/modules.setup';
import { readUserMapTracking, TRACKED_CHARACTERS_PER_MAP_USER_CAP } from './mapTrackingCapacity';

const MAP = 'map-user-tracking';
const USER = 'user-tracking';

test('readUserMapTracking reads one account on one map oldest first, one row past the cap, without throwing', async () => {
  const t = convexTest(schema, modules);
  const pastBreach = TRACKED_CHARACTERS_PER_MAP_USER_CAP + 2;
  const read = await t.run(async (ctx) => {
    await ctx.db.insert('mapTracking', { mapId: MAP, userId: 'user-other', characterId: 1 });
    await ctx.db.insert('mapTracking', { mapId: 'map-other', userId: USER, characterId: 2 });
    // Descending character ids, so creation order is the only thing that sorts them.
    for (let index = 0; index < pastBreach; index += 1) {
      await ctx.db.insert('mapTracking', { mapId: MAP, userId: USER, characterId: 9_000 - index });
    }
    return await readUserMapTracking(ctx, MAP, USER);
  });

  expect(read.map((row) => ({ mapId: row.mapId, userId: row.userId, characterId: row.characterId })))
    .toEqual(Array.from({ length: 33 }, (_, index) => ({
      mapId: MAP, userId: USER, characterId: 9_000 - index,
    })));
});
