// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import type { MutationCtx } from '../_generated/server';
import schema from '../schema';
import { CHAR_A, CHAR_B, locationDoc, OTHER, USER } from '../__tests__/characterLocation.setup';
import { expectConvexErrorCode } from '../__tests__/convexTest.setup';
import { modules } from '../__tests__/modules.setup';
import { TRACKED_CHARACTERS_PER_MAP_CAP } from './mapTrackingCapacity';
import { trackedPilotSystemsByMap } from './mapTrackedPilots';

const MAP_A = 'map-tracked-a';
const MAP_B = 'map-tracked-b';
const JITA = 30_000_142;
const AMARR = 30_002_187;
const DODIXIE = 30_002_659;

async function queriesUsed(ctx: MutationCtx): Promise<number> {
  return (await ctx.meta.getTransactionMetrics()).databaseQueries.used;
}

function ascending(systemIds: ReadonlySet<number>): number[] {
  return [...systemIds].sort((left, right) => left - right);
}

test('trackedPilotSystemsByMap reads each map once, on first use, for the life of the memo', async () => {
  const t = convexTest(schema, modules);
  const movingPilot = await t.run(async (ctx) => {
    await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: USER, characterId: CHAR_A });
    await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: OTHER, characterId: CHAR_B });
    await ctx.db.insert('mapTracking', { mapId: MAP_B, userId: USER, characterId: CHAR_A });
    await ctx.db.insert('characterLocation', { ...locationDoc(OTHER, CHAR_B), solarSystemId: AMARR });
    return ctx.db.insert('characterLocation', { ...locationDoc(USER, CHAR_A), solarSystemId: JITA });
  });

  const run = await t.run(async (ctx) => {
    const beforeFactory = await queriesUsed(ctx);
    const tracked = trackedPilotSystemsByMap(ctx);
    const afterFactory = await queriesUsed(ctx);
    const firstA = await tracked(MAP_A);
    const afterFirstA = await queriesUsed(ctx);

    await ctx.db.patch('characterLocation', movingPilot, { solarSystemId: DODIXIE });
    const beforeSecondA = await queriesUsed(ctx);
    const secondA = await tracked(MAP_A);
    const afterSecondA = await queriesUsed(ctx);
    const mapB = await tracked(MAP_B);
    const afterMapB = await queriesUsed(ctx);
    const freshA = await trackedPilotSystemsByMap(ctx)(MAP_A);

    return {
      factoryReads: afterFactory - beforeFactory,
      firstReads: afterFirstA - afterFactory,
      secondReads: afterSecondA - beforeSecondA,
      mapBReads: afterMapB - afterSecondA,
      firstA: ascending(firstA),
      secondA: ascending(secondA),
      mapB: ascending(mapB),
      freshA: ascending(freshA),
    };
  });

  expect(run).toEqual({
    // Building the memo reads nothing; a map's first call reads its tracking
    // rows and one location per tracked pilot.
    factoryReads: 0,
    firstReads: 3,
    firstA: [JITA, AMARR],
    // The held map is not read again, so the move does not show.
    secondReads: 0,
    secondA: [JITA, AMARR],
    mapBReads: 2,
    mapB: [DODIXIE],
    // A new memo reads again and sees the move.
    freshA: [AMARR, DODIXIE],
  });
});

test('trackedPilotSystemsByMap raises the scan limit on every call and holds no failure', async () => {
  const t = convexTest(schema, modules);
  const overflowRow = await t.run(async (ctx) => {
    await ctx.db.insert('characterLocation', { ...locationDoc('pilot-0', 1), solarSystemId: JITA });
    let last = await ctx.db.insert('mapTracking', { mapId: MAP_A, userId: 'pilot-0', characterId: 1 });
    for (let index = 1; index <= TRACKED_CHARACTERS_PER_MAP_CAP; index += 1) {
      last = await ctx.db.insert('mapTracking', {
        mapId: MAP_A, userId: `pilot-${index}`, characterId: index + 1,
      });
    }
    return last;
  });

  const afterTrim = await t.run(async (ctx) => {
    const tracked = trackedPilotSystemsByMap(ctx);
    await expectConvexErrorCode(tracked(MAP_A), 'TRACKING_SCAN_LIMIT');
    await expectConvexErrorCode(tracked(MAP_A), 'TRACKING_SCAN_LIMIT');
    await ctx.db.delete('mapTracking', overflowRow);
    return [...await tracked(MAP_A)];
  });

  expect(afterTrim).toEqual([JITA]);
});
