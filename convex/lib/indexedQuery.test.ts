// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import type { MutationCtx } from '../_generated/server';
import schema from '../schema';
import { modules } from '../__tests__/modules.setup';
import { deleteIndexedBatch } from './indexedQuery';

const MAP = 'map-batch';
const OTHER_MAP = 'map-kept';

function bookkeeping(mapId: string, characterId: number) {
  return { mapId, characterId, lastProcessedTransitionAt: characterId };
}

function mapBookkeeping(ctx: MutationCtx, mapId: string) {
  return ctx.db
    .query('mapJumpBookkeeping')
    .withIndex('by_map_character', (q) => q.eq('mapId', mapId));
}

test('deleteIndexedBatch removes one batch in index order, one row at a time, and reports what remains', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const characterId of [3, 1, 4, 2]) {
      await ctx.db.insert('mapJumpBookkeeping', bookkeeping(MAP, characterId));
    }
    await ctx.db.insert('mapJumpBookkeeping', bookkeeping(OTHER_MAP, 1));
  });

  const first = await t.run(async (ctx) => {
    const removed: number[] = [];
    let inFlight = 0;
    let mostInFlight = 0;
    const result = await deleteIndexedBatch(mapBookkeeping(ctx, MAP), 3, async (row) => {
      inFlight += 1;
      mostInFlight = Math.max(mostInFlight, inFlight);
      await ctx.db.delete('mapJumpBookkeeping', row._id);
      removed.push(row.characterId);
      inFlight -= 1;
    });
    return { result, removed, mostInFlight };
  });
  expect(first).toEqual({ result: { deleted: 3, hasMore: true }, removed: [1, 2, 3], mostInFlight: 1 });

  const last = await t.run(async (ctx) => {
    const removed: number[] = [];
    const result = await deleteIndexedBatch(mapBookkeeping(ctx, MAP), 1, async (row) => {
      await ctx.db.delete('mapJumpBookkeeping', row._id);
      removed.push(row.characterId);
    });
    return { result, removed };
  });
  expect(last).toEqual({ result: { deleted: 1, hasMore: false }, removed: [4] });

  const left = await t.run((ctx) => ctx.db.query('mapJumpBookkeeping').collect());
  expect(left.map((row) => [row.mapId, row.characterId])).toEqual([[OTHER_MAP, 1]]);
});

test('deleteIndexedBatch with a zero limit removes nothing and still reports waiting rows', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert('mapJumpBookkeeping', bookkeeping(MAP, 1));
  });

  const results = await t.run(async (ctx) => {
    const removed: number[] = [];
    const remove = async (row: { characterId: number }) => {
      removed.push(row.characterId);
    };
    return {
      waiting: await deleteIndexedBatch(mapBookkeeping(ctx, MAP), 0, remove),
      empty: await deleteIndexedBatch(mapBookkeeping(ctx, OTHER_MAP), 0, remove),
      removed,
    };
  });
  expect(results).toEqual({
    waiting: { deleted: 0, hasMore: true },
    empty: { deleted: 0, hasMore: false },
    removed: [],
  });
  expect(await t.run((ctx) => ctx.db.query('mapJumpBookkeeping').collect())).toHaveLength(1);
});
