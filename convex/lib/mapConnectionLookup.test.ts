// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import type { Id } from '../_generated/dataModel';
import schema from '../schema';
import { connectionInsert, connectionTestDoc } from '../__tests__/connection-doc.setup';
import { expectConvexErrorCode } from '../__tests__/convexTest.setup';
import { modules } from '../__tests__/modules.setup';
import {
  MAP_CONNECTION_SIGNATURE_SCAN_LIMIT,
  connectionOwnsLocalSignature,
  findLocalSignatureConnection,
  findPasteConnection,
  readInboundConnections,
  readOriginConnections,
  readTouchingConnections,
} from './mapConnectionLookup';

const MAP = 'map-a';
const HERE = 30_000_142;
const THERE = 30_002_187;

function connection(
  partial: {
    readonly _id?: Id<'mapConnections'>;
    readonly fromSystemId: number;
    readonly toSystemId?: number | null;
    readonly fromSignatureId?: string | null;
    readonly toSignatureId?: string | null;
    readonly deletedAt?: number | null;
    readonly purgeAfter?: number | null;
  },
) {
  return connectionTestDoc({
    mapId: MAP,
    toSystemId: null,
    ...partial,
  });
}

describe('local signature identity', () => {
  it('owns the origin door and the inbound door on this system only', () => {
    const origin = connection({ fromSystemId: HERE, fromSignatureId: 'ABS-420' });
    const inbound = connection({
      fromSystemId: THERE,
      toSystemId: HERE,
      toSignatureId: 'WDE-796',
    });
    expect(connectionOwnsLocalSignature(origin, HERE, 'ABS-420')).toBe(true);
    expect(connectionOwnsLocalSignature(inbound, HERE, 'WDE-796')).toBe(true);
    expect(connectionOwnsLocalSignature(inbound, HERE, 'ABS-420')).toBe(false);
    expect(connectionOwnsLocalSignature(origin, THERE, 'ABS-420')).toBe(false);
  });

  it('prefers the live inbound over a leftover origin stub', () => {
    const stub = connection({
      _id: 'stub' as Id<'mapConnections'>,
      fromSystemId: HERE,
      fromSignatureId: 'WDE-796',
    });
    const inbound = connection({
      _id: 'in' as Id<'mapConnections'>,
      fromSystemId: THERE,
      toSystemId: HERE,
      toSignatureId: 'WDE-796',
    });
    expect(findPasteConnection([stub, inbound], HERE, 'WDE-796')?._id).toBe('in');
    expect(findLocalSignatureConnection([stub, inbound], HERE, 'WDE-796')?._id)
      .toBe('stub');
  });

  it('skips a resolved collapse so paste can start a new lifetime', () => {
    const corpse = connection({
      fromSystemId: HERE,
      toSystemId: THERE,
      fromSignatureId: 'HIS-001',
      deletedAt: 10,
      purgeAfter: 20,
    });
    expect(findPasteConnection([corpse], HERE, 'HIS-001')).toBeUndefined();
    expect(findLocalSignatureConnection([corpse], HERE, 'HIS-001')?._id)
      .toBe(corpse._id);
  });

  it('still revives an unresolved stub tombstone', () => {
    const stub = connection({
      fromSystemId: HERE,
      fromSignatureId: 'WHL-001',
      deletedAt: 10,
      purgeAfter: 20,
    });
    expect(findPasteConnection([stub], HERE, 'WHL-001')?._id).toBe(stub._id);
  });
});

describe('bounded door reads', () => {
  it('fail past the default bound with a direction-named error unless the caller widens it', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index <= MAP_CONNECTION_SIGNATURE_SCAN_LIMIT; index += 1) {
        await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP,
          fromSystemId: HERE,
          toSystemId: THERE,
        }));
      }
    });

    const origin = await expectConvexErrorCode(
      t.run((ctx) => readOriginConnections(ctx, MAP, HERE)),
      'MAP_CONNECTION_SCAN_LIMIT',
    );
    expect(origin.data).toEqual({
      code: 'MAP_CONNECTION_SCAN_LIMIT',
      detail: 'Map map-a exceeds the 128-connection origin scan bound.',
    });
    const inbound = await expectConvexErrorCode(
      t.run((ctx) => readInboundConnections(ctx, MAP, THERE)),
      'MAP_CONNECTION_SCAN_LIMIT',
    );
    expect(inbound.data).toEqual({
      code: 'MAP_CONNECTION_SCAN_LIMIT',
      detail: 'Map map-a exceeds the 128-connection destination scan bound.',
    });
    const touching = await t.run((ctx) => readTouchingConnections(ctx, MAP, THERE, { limit: 129 }));
    expect(touching).toHaveLength(129);
  });
});
