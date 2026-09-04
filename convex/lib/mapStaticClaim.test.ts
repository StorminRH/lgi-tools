// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectionRemovedTombstone } from '@/data/maps/chain-contract';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import schema from '../schema';
import { modules } from '../__tests__/modules.setup';
import { connectionInsert } from '../__tests__/connection-doc.setup';
import {
  MAP_A,
  NOW,
  WH_A,
  WH_ROOT,
  asUser,
  installAuthoringTimers,
  restoreAuthoringTimers,
  seedHome,
  type Chain,
} from '../__tests__/mapAuthoring.setup';
import {
  claimStaticPlaceholder,
  deleteUnclaimedRespawn,
  respawnStaticPlaceholder,
} from './mapStaticClaim';

beforeEach(() => {
  installAuthoringTimers();
});

afterEach(() => {
  restoreAuthoringTimers();
});

async function applyC247(t: Chain) {
  await seedHome(t, WH_ROOT);
  await t.mutation(internal.mapStatics.applyStaticPlaceholders, {
    mapId: MAP_A,
    systemId: WH_ROOT,
    codes: ['C247'],
  });
}

async function livePlaceholder(t: Chain) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query('mapConnections')
      .withIndex('by_map_from', (q) => q.eq('mapId', MAP_A).eq('fromSystemId', WH_ROOT))
      .collect();
    return rows.find((row) => row.staticCode === 'C247' && row.from.signatureId === null);
  });
}

describe('claimStaticPlaceholder', () => {
  it('sig claim keeps the placeholder id and gains the sig fields', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const placeholder = await livePlaceholder(t);
    expect(placeholder).toBeDefined();
    const sigId = await t.run(async (ctx) =>
      ctx.db.insert('mapConnections', {
        ...connectionInsert({
          mapId: MAP_A,
          fromSystemId: WH_ROOT,
          toSystemId: null,
          fromSignatureId: 'ABC-123',
          fromSignalPct: 18.5,
          wormholeTypeCode: 'C247',
          typedSide: 'from',
          typeProvenance: 'human',
          firstSeenAt: NOW + 50,
          observationKey: 'obs-sig',
        }),
        seatOrderAt: NOW + 50,
      }),
    );
    const outcome = await t.run(async (ctx) => {
      const sig = await ctx.db.get(sigId);
      if (sig === null) throw new Error('missing sig row');
      return claimStaticPlaceholder(ctx, sig, 'from');
    });
    expect(outcome).toBe('claimed');
    const survivor = await t.run(async (ctx) => await ctx.db.get(placeholder!._id));
    expect(survivor).toMatchObject({
      _id: placeholder!._id,
      staticCode: 'C247',
      seatOrderAt: NOW,
      from: expect.objectContaining({
        signatureId: 'ABC-123',
        signalPct: 18.5,
        typeCode: 'C247',
      }),
      firstSeenAt: NOW + 50,
      observationKey: 'obs-sig',
      identity: { kind: 'typed', provenance: 'human' },
    });
    expect(await t.run(async (ctx) => await ctx.db.get(sigId))).toBeNull();
  });

  it('resolved claim keeps the resolved id and gains staticCode and earlier seatOrderAt', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const placeholder = await livePlaceholder(t);
    expect(placeholder).toBeDefined();
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', {
        mapId: MAP_A,
        systemId: WH_A,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    const resolvedId = await t.run(async (ctx) =>
      ctx.db.insert('mapConnections', {
        ...connectionInsert({
          mapId: MAP_A,
          fromSystemId: WH_ROOT,
          toSystemId: WH_A,
          wormholeTypeCode: 'C247',
          typedSide: 'from',
          typeProvenance: 'human',
        }),
        seatOrderAt: NOW + 80,
      }),
    );
    const outcome = await t.run(async (ctx) => {
      const resolved = await ctx.db.get(resolvedId);
      if (resolved === null) throw new Error('missing resolved row');
      return claimStaticPlaceholder(ctx, resolved, 'from');
    });
    expect(outcome).toBe('claimed');
    const survivor = await t.run(async (ctx) => await ctx.db.get(resolvedId));
    expect(survivor).toMatchObject({
      _id: resolvedId,
      staticCode: 'C247',
      seatOrderAt: NOW,
      toSystemId: WH_A,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(placeholder!._id))).toBeNull();
  });

  it('returns none when no placeholder matches the typed code', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const sigId = await t.run(async (ctx) =>
      ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: WH_ROOT,
        toSystemId: null,
        fromSignatureId: 'K162-01',
        wormholeTypeCode: 'K162',
        typedSide: 'from',
        typeProvenance: 'human',
      })),
    );
    const outcome = await t.run(async (ctx) => {
      const sig = await ctx.db.get(sigId);
      if (sig === null) throw new Error('missing sig row');
      return claimStaticPlaceholder(ctx, sig, 'from');
    });
    expect(outcome).toBe('none');
    expect(await t.run(async (ctx) => await ctx.db.get(sigId))).not.toBeNull();
    expect(await livePlaceholder(t)).toMatchObject({ from: { signatureId: null } });
  });

  it('returns none for a row that already holds staticCode', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const placeholder = await livePlaceholder(t);
    expect(placeholder).toBeDefined();
    const outcome = await t.run(async (ctx) =>
      claimStaticPlaceholder(ctx, placeholder!, 'from'),
    );
    expect(outcome).toBe('none');
    expect(await livePlaceholder(t)).toMatchObject({ _id: placeholder!._id });
  });

  it('does not re-claim a placeholder that already holds a signature', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const firstId = await t.run(async (ctx) =>
      ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: WH_ROOT,
        toSystemId: null,
        fromSignatureId: 'AAA-111',
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'human',
      })),
    );
    await t.run(async (ctx) => {
      const first = await ctx.db.get(firstId);
      if (first === null) throw new Error('missing first sig');
      await claimStaticPlaceholder(ctx, first, 'from');
    });
    const secondId = await t.run(async (ctx) =>
      ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: WH_ROOT,
        toSystemId: null,
        fromSignatureId: 'BBB-222',
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'human',
      })),
    );
    const outcome = await t.run(async (ctx) => {
      const second = await ctx.db.get(secondId);
      if (second === null) throw new Error('missing second sig');
      return claimStaticPlaceholder(ctx, second, 'from');
    });
    expect(outcome).toBe('none');
    expect(await t.run(async (ctx) => await ctx.db.get(secondId))).not.toBeNull();
  });
});

describe('respawnStaticPlaceholder', () => {
  it('respawn inherits seatOrderAt from the tombstoned static row', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const placeholder = await livePlaceholder(t);
    expect(placeholder).toBeDefined();
    const claimedId = placeholder!._id;
    await t.run(async (ctx) => {
      await ctx.db.patch(claimedId, {
        from: { ...placeholder!.from, signatureId: 'ABC-123' },
      });
      await ctx.db.patch(claimedId, connectionRemovedTombstone(NOW + 10));
    });
    const respawnId = await t.run(async (ctx) => {
      const dead = await ctx.db.get(claimedId);
      if (dead === null) throw new Error('missing tombstone');
      return respawnStaticPlaceholder(ctx, dead);
    });
    expect(respawnId).not.toBeNull();
    const respawn = await t.run(async (ctx) => await ctx.db.get(respawnId!));
    expect(respawn).toMatchObject({
      staticCode: 'C247',
      seatOrderAt: NOW,
      from: expect.objectContaining({ signatureId: null, typeCode: 'C247' }),
      toSystemId: null,
      tombstone: { kind: 'live' },
    });
  });

  it('restore removes an unclaimed respawn', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const placeholder = await livePlaceholder(t);
    expect(placeholder).toBeDefined();
    const claimedId = placeholder!._id as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.patch(claimedId, {
        from: { ...placeholder!.from, signatureId: 'ABC-123' },
      });
      await ctx.db.patch(claimedId, connectionRemovedTombstone(NOW + 10));
    });
    const respawnId = await t.run(async (ctx) => {
      const dead = await ctx.db.get(claimedId);
      if (dead === null) throw new Error('missing tombstone');
      return respawnStaticPlaceholder(ctx, dead);
    });
    expect(respawnId).not.toBeNull();
    await asUser(t).mutation(api.mapAuthoringTombstone.restoreConnection, {
      mapId: MAP_A,
      connectionId: claimedId,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(respawnId!))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(claimedId))).toMatchObject({
      tombstone: { kind: 'live' },
      staticCode: 'C247',
      from: expect.objectContaining({ signatureId: 'ABC-123' }),
    });
  });

  it('deleteUnclaimedRespawn leaves a claimed respawn in place', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const placeholder = await livePlaceholder(t);
    expect(placeholder).toBeDefined();
    const claimedId = placeholder!._id;
    await t.run(async (ctx) => {
      await ctx.db.patch(claimedId, connectionRemovedTombstone(NOW + 10));
    });
    const respawnId = await t.run(async (ctx) => {
      const dead = await ctx.db.get(claimedId);
      if (dead === null) throw new Error('missing tombstone');
      return respawnStaticPlaceholder(ctx, dead);
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(respawnId!, {
        from: {
          typeCode: 'C247',
          signatureId: 'LATER-1',
          signalPct: null,
          leadsTo: { kind: 'unset' },
        },
      });
      const dead = await ctx.db.get(claimedId);
      if (dead === null) throw new Error('missing tombstone');
      await deleteUnclaimedRespawn(ctx, dead);
    });
    expect(await t.run(async (ctx) => await ctx.db.get(respawnId!))).toMatchObject({
      from: expect.objectContaining({ signatureId: 'LATER-1' }),
    });
  });
});
