// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectionRemovedTombstone } from '@/data/maps/chain-contract';
import { connectionTypePatch } from '@/data/maps/connection-door-types';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import schema from '../schema';
import { modules } from '../__tests__/modules.setup';
import { connectionInsert } from '../__tests__/connection-doc.setup';
import { type Chain } from '../__tests__/convexTest.setup';
import {
  MAP_A,
  NOW,
  WH_A,
  WH_ROOT,
  asUser,
  installAuthoringTimers,
  restoreAuthoringTimers,
  seedHome,
} from '../__tests__/mapAuthoring.setup';
import {
  claimStaticOrKeepId,
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
    const outcome = await t.run(async (ctx) =>
      claimStaticPlaceholder(ctx, sigId, 'from'),
    );
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
    const outcome = await t.run(async (ctx) =>
      claimStaticPlaceholder(ctx, resolvedId, 'from'),
    );
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
    const outcome = await t.run(async (ctx) =>
      claimStaticPlaceholder(ctx, sigId, 'from'),
    );
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
      claimStaticPlaceholder(ctx, placeholder!._id, 'from'),
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
    await t.run(async (ctx) =>
      claimStaticPlaceholder(ctx, firstId, 'from'),
    );
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
    const outcome = await t.run(async (ctx) =>
      claimStaticPlaceholder(ctx, secondId, 'from'),
    );
    expect(outcome).toBe('none');
    expect(await t.run(async (ctx) => await ctx.db.get(secondId))).not.toBeNull();
  });

  it('returns none when the typed door is the destination', async () => {
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
    const inboundId = await t.run(async (ctx) =>
      ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: WH_A,
        toSystemId: WH_ROOT,
        wormholeTypeCode: 'C247',
        typedSide: 'to',
        typeProvenance: 'human',
      })),
    );
    const outcome = await t.run(async (ctx) =>
      claimStaticPlaceholder(ctx, inboundId, 'to'),
    );
    expect(outcome).toBe('none');
    const inbound = await t.run(async (ctx) => ctx.db.get(inboundId));
    expect(inbound).toMatchObject({
      _id: inboundId,
      fromSystemId: WH_A,
    });
    expect(inbound?.staticCode).toBeUndefined();
    expect(await livePlaceholder(t)).toMatchObject({ _id: placeholder!._id });
  });
});

describe('claimStaticOrKeepId', () => {
  it('claims from a type patched in the same transaction and returns the placeholder id', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const placeholder = await livePlaceholder(t);
    expect(placeholder).toBeDefined();
    const sigId = await t.run(async (ctx) =>
      ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: WH_ROOT,
        toSystemId: null,
        fromSignatureId: 'ABC-123',
      })),
    );
    const survivorId = await t.run(async (ctx) => {
      const sig = await ctx.db.get(sigId);
      if (sig === null) throw new Error('missing sig row');
      // The caller passes only the id after patching; the claim must see the new type.
      await ctx.db.patch(sigId, connectionTypePatch(sig, 'from', 'C247', 'human'));
      return claimStaticOrKeepId(ctx, sigId, 'from');
    });
    expect(survivorId).toBe(placeholder!._id);
    expect(await t.run(async (ctx) => await ctx.db.get(sigId))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(placeholder!._id))).toMatchObject({
      from: expect.objectContaining({ signatureId: 'ABC-123', typeCode: 'C247' }),
    });
  });

  it('keeps the given id and claims nothing when the row no longer exists', async () => {
    const t = convexTest(schema, modules);
    await applyC247(t);
    const placeholder = await livePlaceholder(t);
    expect(placeholder).toBeDefined();
    const goneId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: WH_ROOT,
        toSystemId: null,
        fromSignatureId: 'ABC-123',
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'human',
      }));
      await ctx.db.delete(id);
      return id;
    });
    const survivorId = await t.run(async (ctx) => claimStaticOrKeepId(ctx, goneId, 'from'));
    expect(survivorId).toBe(goneId);
    expect(await livePlaceholder(t)).toMatchObject({
      _id: placeholder!._id,
      from: expect.objectContaining({ signatureId: null }),
    });
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
