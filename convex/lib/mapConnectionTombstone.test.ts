// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';
import type { Id } from '../_generated/dataModel';
import schema from '../schema';
import { connectionInsert } from '../__tests__/connection-doc.setup';
import type { Chain } from '../__tests__/convexTest.setup';
import { modules } from '../__tests__/modules.setup';
import { setRemovedPurgeAfter } from './mapConnectionTombstone';

const MAP = 'map-tombstone';
const DELETED_AT = 1_000;
const PURGE_AFTER = 2_000;
const REARMED = 9_000;

function insertConnection(
  t: Chain,
  tombstone: { readonly deletedAt: number | null; readonly purgeAfter: number | null },
): Promise<Id<'mapConnections'>> {
  return t.run((ctx) => ctx.db.insert('mapConnections', connectionInsert({
    mapId: MAP,
    fromSystemId: 31_000_001,
    toSystemId: 31_000_002,
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
    lifeStage: null,
    lifeStageObservedAt: null,
    ...tombstone,
  })));
}

/** Runs the re-stamp in one transaction and reports what it returned and wrote. */
function restamp(t: Chain, id: Id<'mapConnections'>, purgeAfter: number) {
  return t.run(async (ctx) => {
    const written = async () =>
      (await ctx.meta.getTransactionMetrics()).documentsWritten.used;
    const row = await ctx.db.get('mapConnections', id);
    if (row === null) throw new Error('connection missing');
    const before = await written();
    const patched = await setRemovedPurgeAfter(ctx, row, purgeAfter);
    return { patched, writes: (await written()) - before };
  });
}

function readTombstone(t: Chain, id: Id<'mapConnections'>) {
  return t.run(async (ctx) => (await ctx.db.get('mapConnections', id))?.tombstone);
}

test('a removed row with a different purgeAfter is patched and keeps its deletedAt', async () => {
  const t = convexTest(schema, modules);
  const id = await insertConnection(t, { deletedAt: DELETED_AT, purgeAfter: PURGE_AFTER });

  expect(await restamp(t, id, REARMED)).toEqual({ patched: true, writes: 1 });
  expect(await readTombstone(t, id)).toStrictEqual({
    kind: 'removed',
    deletedAt: DELETED_AT,
    purgeAfter: REARMED,
  });
});

test('a removed row kept forever (null purgeAfter) gains the expiry', async () => {
  const t = convexTest(schema, modules);
  const id = await insertConnection(t, { deletedAt: DELETED_AT, purgeAfter: null });

  expect(await restamp(t, id, REARMED)).toEqual({ patched: true, writes: 1 });
  expect(await readTombstone(t, id)).toStrictEqual({
    kind: 'removed',
    deletedAt: DELETED_AT,
    purgeAfter: REARMED,
  });
});

test('a removed row already due at that purgeAfter is not written', async () => {
  const t = convexTest(schema, modules);
  const id = await insertConnection(t, { deletedAt: DELETED_AT, purgeAfter: PURGE_AFTER });

  expect(await restamp(t, id, PURGE_AFTER)).toEqual({ patched: false, writes: 0 });
  expect(await readTombstone(t, id)).toStrictEqual({
    kind: 'removed',
    deletedAt: DELETED_AT,
    purgeAfter: PURGE_AFTER,
  });
});

test('a live row is left live and unwritten', async () => {
  const t = convexTest(schema, modules);
  const id = await insertConnection(t, { deletedAt: null, purgeAfter: null });

  expect(await restamp(t, id, REARMED)).toEqual({ patched: false, writes: 0 });
  expect(await readTombstone(t, id)).toStrictEqual({ kind: 'live' });
});
