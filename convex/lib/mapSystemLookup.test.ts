// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import type { ConvexError, Value } from 'convex/values';
import { expect, test } from 'vitest';
import schema from '../schema';
import { expectConvexErrorCode, type Chain } from '../__tests__/convexTest.setup';
import { modules } from '../__tests__/modules.setup';
import { findLiveSystem, requireLiveSystem } from './mapSystemLookup';

const MAP = 'map-lookup';
const LIVE = 30_000_142;
const TOMBSTONED = 30_002_187;
const MISSING = 30_002_659;

async function seed(t: Chain): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapSystems', { mapId: MAP, systemId: LIVE, deletedAt: null, purgeAfter: null });
    await ctx.db.insert('mapSystems', { mapId: MAP, systemId: TOMBSTONED, deletedAt: 10, purgeAfter: 20 });
    // The same system id live on another map must not count for this one.
    await ctx.db.insert('mapSystems', { mapId: 'map-other', systemId: MISSING, deletedAt: null, purgeAfter: null });
  });
}

test('findLiveSystem returns the live row and null for a missing or tombstoned one', async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  const found = await t.run(async (ctx) => ({
    live: await findLiveSystem(ctx, MAP, LIVE),
    tombstoned: await findLiveSystem(ctx, MAP, TOMBSTONED),
    missing: await findLiveSystem(ctx, MAP, MISSING),
  }));

  expect(found.live).toMatchObject({ mapId: MAP, systemId: LIVE, deletedAt: null });
  expect(found.tombstoned).toBeNull();
  expect(found.missing).toBeNull();
});

test('requireLiveSystem returns the live row and throws the given error, or UNKNOWN_SYSTEM, exactly as given', async () => {
  const t = convexTest(schema, modules);
  await seed(t);

  expect(await t.run((ctx) => requireLiveSystem(ctx, MAP, LIVE)))
    .toMatchObject({ mapId: MAP, systemId: LIVE });

  for (const systemId of [MISSING, TOMBSTONED]) {
    const refused = await expectConvexErrorCode(
      t.run((ctx) => requireLiveSystem(ctx, MAP, systemId)),
      'UNKNOWN_SYSTEM',
    );
    expect(refused.data).toStrictEqual({ code: 'UNKNOWN_SYSTEM' });
  }

  const error = { code: 'UNKNOWN_ORIGIN', detail: `Origin system ${TOMBSTONED} is gone.` };
  const custom = await expectConvexErrorCode(
    t.run((ctx) => requireLiveSystem(ctx, MAP, TOMBSTONED, error)),
    'UNKNOWN_ORIGIN',
  );
  expect(custom.data).toStrictEqual(error);

  // Read inside the transaction: the payload leaves t.run as JSON, which would drop
  // a `detail: undefined` key built from a caller error that has no detail.
  const payloadKeys = await t.run(async (ctx) => {
    const keysOf = (call: Promise<unknown>) => call.then(
      () => null,
      (rejection: ConvexError<Record<string, Value>>) => Object.keys(rejection.data),
    );
    return [
      await keysOf(requireLiveSystem(ctx, MAP, MISSING)),
      await keysOf(requireLiveSystem(ctx, MAP, TOMBSTONED, { code: 'UNKNOWN_ORIGIN' })),
    ];
  });
  expect(payloadKeys).toEqual([['code'], ['code']]);

  await expectConvexErrorCode(
    t.run((ctx) => requireLiveSystem(ctx, MAP, 0, { code: 'UNKNOWN_ORIGIN' })),
    'INVALID_SYSTEM_ID',
  );
});
