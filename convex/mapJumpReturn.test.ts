// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';
import { modules } from './__tests__/modules.setup';

const MAP = 'return-before-signature';
const USER = 'return-editor';
const A = 31_000_001;
const B = 31_000_002;
const CHARACTER = 90_000_001;
const AT = 1_800_000_000_000;
const MASS = 10_000_000;

async function prepareReturn() {
  const t = convexTest(schema, modules);
  await t.run((ctx) => ctx.db.insert('mapAccess', {
    mapId: MAP, userId: USER, roles: ['editor'],
  }));
  await t.mutation(internal.mapFixtureTracking.seedTrackedLocationFixture, {
    mapId: MAP, userId: USER, characterId: CHARACTER,
    solarSystemId: A, shipTypeId: 587, transitionObservedAt: AT - 1,
  });
  const candidates = [];
  for (const fromSignatureId of ['AAA-111', 'BBB-222']) {
    candidates.push(await t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
      mapId: MAP, fromSystemId: A, fromSignatureId, wormholeTypeCode: 'C247',
    }));
  }
  const first = candidates[0];
  if (first === undefined) throw new Error('missing candidate');
  await t.mutation(internal.mapFixtureTracking.advanceTrackedLocationFixture, {
    mapId: MAP, userId: USER, characterId: CHARACTER,
    fromSolarSystemId: A, toSolarSystemId: B, prevFresh: true, transitionObservedAt: AT,
  });
  const outbound = await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, {
    mapId: MAP, userId: USER, characterId: CHARACTER,
    fromSolarSystemId: A, toSolarSystemId: B, transitionObservedAt: AT,
    observationKey: 'outbound', observedShipMassKg: MASS,
    decision: {
      kind: 'resolve', candidateId: first.connectionId, provenance: 'assumed',
      candidateIds: candidates.map((row) => row.connectionId),
      survivors: candidates.map((row) => row.connectionId),
    },
  });
  if (outbound.status !== 'authored') throw new Error('expected awaiting outbound jump');
  await t.mutation(internal.mapFixtureTracking.advanceTrackedLocationFixture, {
    mapId: MAP, userId: USER, characterId: CHARACTER,
    fromSolarSystemId: B, toSolarSystemId: A, prevFresh: true, transitionObservedAt: AT + 1,
  });
  const args = {
    mapId: MAP, userId: USER, characterId: CHARACTER,
    fromSolarSystemId: B, toSolarSystemId: A, transitionObservedAt: AT + 1,
    observationKey: 'return', observedShipMassKg: MASS,
    decision: { kind: 'insert' as const, candidateIds: [], survivors: [] },
  };
  return { t, args, firstId: first.connectionId, awaitingId: outbound.emission.connectionId };
}

async function evidence(t: TestConvex<typeof schema>) {
  return await t.query(internal.mapJumpEvidence.jumpEvidence, {
    mapId: MAP, userId: USER, characterId: CHARACTER,
  });
}

async function snapshot(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    systems: await ctx.db.query('mapSystems').withIndex('by_map', (q) => q.eq('mapId', MAP)).take(64),
    connections: await ctx.db.query('mapConnections').withIndex('by_map', (q) => q.eq('mapId', MAP)).take(64),
    stamps: await ctx.db.query('mapJumpBookkeeping').withIndex('by_map', (q) => q.eq('mapId', MAP)).take(64),
  }));
}

describe('return traversal before signature selection', () => {
  it('counts the return once without placing its missing origin, then transfers both jumps on selection', async () => {
    const { t, args, firstId, awaitingId } = await prepareReturn();
    const before = await snapshot(t);
    expect(before.systems.map((row) => row.systemId)).toEqual([A]);
    expect(await evidence(t)).toMatchObject({ originLive: true, candidates: [], lastProcessedTransitionAt: AT });
    expect(await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, args)).toMatchObject({
      status: 'converged', emission: { connectionId: awaitingId, toSystemId: null },
    });
    const returned = await snapshot(t);
    expect(returned.systems).toEqual(before.systems);
    expect(returned.connections.filter((row) => row._id !== awaitingId))
      .toEqual(before.connections.filter((row) => row._id !== awaitingId));
    expect(returned.connections.find((row) => row._id === awaitingId))
      .toMatchObject({ observedMassKg: MASS * 2, observationKey: 'outbound', toSystemId: null });
    expect(returned.stamps[0]?.lastProcessedTransitionAt).toBe(AT + 1);
    expect(await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, args))
      .toEqual({ status: 'converged', reason: 'processed' });
    expect(await snapshot(t)).toEqual(returned);

    await t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, {
      mapId: MAP, userId: USER, connectionId: awaitingId, targetConnectionId: firstId,
    });
    const answered = await snapshot(t);
    expect(answered.connections.some((row) => row._id === awaitingId)).toBe(false);
    expect(answered.connections.find((row) => row._id === firstId))
      .toMatchObject({ fromSystemId: A, toSystemId: B, observedMassKg: MASS * 2 });
    expect(answered.systems.some((row) => row.systemId === B)).toBe(true);
  });

  it.each(['tombstoned-origin', 'removed-awaiting', 'removed-destination', 'missing-destination'] as const)(
    'rejects a return with %s without reviving endpoints or consuming its transition',
    async (failure) => {
      const { t, args, awaitingId } = await prepareReturn();
      await t.run(async (ctx) => {
        if (failure === 'tombstoned-origin') {
          await ctx.db.insert('mapSystems', { mapId: MAP, systemId: B, deletedAt: AT, purgeAfter: AT + 100 });
        } else if (failure === 'removed-awaiting') {
          await ctx.db.patch(awaitingId, { tombstone: { kind: 'removed', deletedAt: AT, purgeAfter: null } });
        } else {
          const origin = await ctx.db.query('mapSystems').withIndex('by_map_system', (q) => q.eq('mapId', MAP).eq('systemId', A)).unique();
          if (origin === null) throw new Error('missing seeded system');
          if (failure === 'removed-destination') await ctx.db.patch(origin._id, { deletedAt: AT });
          else await ctx.db.delete(origin._id);
        }
      });
      const before = await snapshot(t);
      expect(await evidence(t)).toMatchObject({ originLive: false });
      expect(await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, args))
        .toEqual({ status: 'stale', reason: 'origin' });
      expect(await snapshot(t)).toEqual(before);
    },
  );

  it.each([{ from: B + 1, to: A }, { from: B, to: A + 2 }])(
    'does not use a different awaiting pair for $from to $to',
    async ({ from, to }) => {
      const { t, args } = await prepareReturn();
      await t.run(async (ctx) => {
        const location = await ctx.db.query('characterLocation').withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', CHARACTER)).unique();
        if (location === null) throw new Error('missing tracked location');
        await ctx.db.patch(location._id, { prevSolarSystemId: from, solarSystemId: to });
      });
      const before = await snapshot(t);
      expect(await evidence(t)).toMatchObject({ originLive: false });
      expect(await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, {
        ...args, fromSolarSystemId: from, toSolarSystemId: to,
      })).toEqual({ status: 'stale', reason: 'origin' });
      expect(await snapshot(t)).toEqual(before);
    },
  );
});
