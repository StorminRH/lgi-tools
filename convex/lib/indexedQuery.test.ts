// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { expect, expectTypeOf, test } from 'vitest';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import schema from '../schema';
import { modules } from '../__tests__/modules.setup';
import {
  accessLease,
  CHAR_A,
  CHAR_B,
  GEN,
  locationDoc,
  OTHER,
  USER,
} from '../__tests__/characterLocation.setup';
import { deleteIndexedBatch, uniqueByUserCharacter, type UserCharacterTable } from './indexedQuery';

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

const USER_CHARACTER_TABLES = [
  'characterLocation',
  'characterLocationCovered',
  'characterLocationOnline',
  'characterLocationAccess',
] as const satisfies readonly UserCharacterTable[];
const SEEDED_PAIRS = [[USER, CHAR_A], [USER, CHAR_B], [OTHER, CHAR_A], [OTHER, CHAR_B]] as const;
const ABSENT_PAIRS = [[USER, 90_000_199], ['user-location-absent', CHAR_A]] as const;

async function seedUserCharacterRow(
  ctx: MutationCtx,
  table: UserCharacterTable,
  userId: string,
  characterId: number,
): Promise<string> {
  switch (table) {
    case 'characterLocation':
      return ctx.db.insert(table, locationDoc(userId, characterId));
    case 'characterLocationCovered':
      return ctx.db.insert(table, { userId, characterId });
    case 'characterLocationOnline':
      return ctx.db.insert(table, { userId, characterId, online: true, etagOnline: null, onlineExpiresAt: GEN });
    case 'characterLocationAccess':
      return ctx.db.insert(table, accessLease(userId, characterId));
  }
}

test('uniqueByUserCharacter returns the one row a user and character hold in each location table, and null for any other pair', async () => {
  const t = convexTest(schema, modules);
  const expected = await t.run(async (ctx) => {
    const ids: Record<string, string | null> = {};
    for (const table of USER_CHARACTER_TABLES) {
      for (const [userId, characterId] of SEEDED_PAIRS) {
        ids[`${table}/${userId}/${characterId}`] = await seedUserCharacterRow(ctx, table, userId, characterId);
      }
      for (const [userId, characterId] of ABSENT_PAIRS) {
        ids[`${table}/${userId}/${characterId}`] = null;
      }
    }
    return ids;
  });

  const found = await t.run(async (ctx) => {
    const ids: Record<string, string | null> = {};
    for (const table of USER_CHARACTER_TABLES) {
      for (const [userId, characterId] of [...SEEDED_PAIRS, ...ABSENT_PAIRS]) {
        const row = await uniqueByUserCharacter(ctx, table, userId, characterId);
        ids[`${table}/${userId}/${characterId}`] = row?._id ?? null;
      }
    }
    return ids;
  });
  expect(found).toEqual(expected);

  const lease = await t.run((ctx) => uniqueByUserCharacter(ctx, 'characterLocationAccess', USER, CHAR_B));
  expectTypeOf(lease).toEqualTypeOf<Doc<'characterLocationAccess'> | null>();
  expect(lease).toMatchObject({ userId: USER, characterId: CHAR_B, accessToken: `tok-${CHAR_B}` });
});
