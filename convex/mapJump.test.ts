// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const MAP = 'map-jump';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';
const TRACKER = 'user-tracker';
const ORIGIN = 31_000_001;
const DESTINATION = 31_000_002;
const CHARACTER = 90_000_001;
const OBSERVED_AT = 1_800_000_000_000;

type Chain = TestConvex<typeof schema>;

async function grant(
  t: Chain,
  userId: string,
  roles: ('viewer' | 'editor' | 'admin')[],
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId: MAP, userId, roles });
  });
}

async function seedTrackedTransition(
  t: Chain,
  input: {
    readonly characterId?: number;
    readonly trackingUserId?: string;
    readonly fromSystemId?: number;
    readonly toSystemId?: number;
    readonly transitionObservedAt?: number;
    readonly placeOrigin?: boolean;
  } = {},
): Promise<void> {
  const characterId = input.characterId ?? CHARACTER;
  const trackingUserId = input.trackingUserId ?? TRACKER;
  const fromSystemId = input.fromSystemId ?? ORIGIN;
  const toSystemId = input.toSystemId ?? DESTINATION;
  const transitionObservedAt = input.transitionObservedAt ?? OBSERVED_AT;
  if (input.placeOrigin !== false) {
    await t.mutation(internal.mapFixtures.placeSystemFixture, {
      mapId: MAP,
      systemId: fromSystemId,
    });
  }
  await t.run(async (ctx) => {
    await ctx.db.insert('mapTracking', {
      mapId: MAP,
      userId: trackingUserId,
      characterId,
    });
    await ctx.db.insert('characterLocation', {
      userId: trackingUserId,
      characterId,
      solarSystemId: toSystemId,
      stationId: null,
      structureId: null,
      shipTypeId: 587,
      prevSolarSystemId: fromSystemId,
      prevFresh: true,
      transitionObservedAt,
      observedAt: transitionObservedAt,
      etagLocation: null,
      etagShip: null,
    });
  });
}

async function seedCandidate(
  t: Chain,
  signatureId: string,
  wormholeTypeCode: string | null = null,
): Promise<Id<'mapConnections'>> {
  const result = await t.mutation(internal.mapFixtures.upsertUnresolvedHole, {
    mapId: MAP,
    fromSystemId: ORIGIN,
    fromSignatureId: signatureId,
    wormholeTypeCode,
  });
  return result.connectionId;
}

function authorArgs(
  input: {
    readonly characterId?: number;
    readonly fromSolarSystemId?: number;
    readonly toSolarSystemId?: number;
    readonly transitionObservedAt?: number;
    readonly observedShipMassKg?: number | null;
    readonly observationKey?: string;
    readonly decision:
      | {
          readonly kind: 'resolve';
          readonly candidateId: Id<'mapConnections'>;
          readonly provenance: 'jump-verified' | 'assumed';
          readonly candidateIds: Id<'mapConnections'>[];
          readonly survivors: Id<'mapConnections'>[];
        }
      | {
          readonly kind: 'insert';
          readonly candidateIds: Id<'mapConnections'>[];
          readonly survivors: Id<'mapConnections'>[];
        };
  },
) {
  return {
    userId: EDITOR,
    mapId: MAP,
    characterId: input.characterId ?? CHARACTER,
    fromSolarSystemId: input.fromSolarSystemId ?? ORIGIN,
    toSolarSystemId: input.toSolarSystemId ?? DESTINATION,
    transitionObservedAt: input.transitionObservedAt ?? OBSERVED_AT,
    observedShipMassKg: input.observedShipMassKg ?? 10_000_000,
    observationKey: input.observationKey ?? 'observation-key',
    decision: input.decision,
  };
}

async function mapState(t: Chain) {
  return await t.run(async (ctx) => ({
    systems: await ctx.db
      .query('mapSystems')
      .withIndex('by_map', (q) => q.eq('mapId', MAP))
      .collect(),
    connections: await ctx.db
      .query('mapConnections')
      .withIndex('by_map', (q) => q.eq('mapId', MAP))
      .collect(),
    stamps: await ctx.db
      .query('mapJumpBookkeeping')
      .withIndex('by_map', (q) => q.eq('mapId', MAP))
      .collect(),
  }));
}

describe('automatic jump authoring', () => {
  it('returns one access-safe evidence packet and resolves a repeated doorbell exactly once', async () => {
    const t = convexTest(schema, modules);
    await grant(t, EDITOR, ['editor']);
    await grant(t, VIEWER, ['viewer']);
    await seedTrackedTransition(t);
    const candidateId = await seedCandidate(t, 'ABC', 'C247');

    const denied = await t.query(internal.mapJump.jumpEvidence, {
      userId: VIEWER,
      mapId: MAP,
      characterId: CHARACTER,
    });
    expect(denied).toEqual({
      canEdit: false,
      tracked: false,
      transition: null,
      lastProcessedTransitionAt: null,
      originLive: false,
      scannedTypeCodes: [],
      candidates: [],
    });

    const evidence = await t.query(internal.mapJump.jumpEvidence, {
      userId: EDITOR,
      mapId: MAP,
      characterId: CHARACTER,
    });
    expect(evidence).toMatchObject({
      canEdit: true,
      tracked: true,
      originLive: true,
      lastProcessedTransitionAt: null,
      transition: {
        fromSolarSystemId: ORIGIN,
        toSolarSystemId: DESTINATION,
        transitionObservedAt: OBSERVED_AT,
      },
      scannedTypeCodes: ['C247'],
      candidates: [{ id: candidateId, wormholeTypeCode: 'C247' }],
    });

    const args = authorArgs({
      decision: {
        kind: 'resolve',
        candidateId,
        provenance: 'jump-verified',
        candidateIds: [candidateId],
        survivors: [candidateId],
      },
    });
    const concurrentShaped = await Promise.all([
      t.mutation(internal.mapJump.resolveJumpAuthoring, args),
      t.mutation(internal.mapJump.resolveJumpAuthoring, args),
    ]);
    expect(concurrentShaped.map((result) => result.status).sort()).toEqual([
      'authored',
      'converged',
    ]);

    const repeated = await t.mutation(
      internal.mapJump.resolveJumpAuthoring,
      args,
    );
    expect(repeated).toEqual({ status: 'converged', reason: 'processed' });
    const state = await mapState(t);
    expect(state.systems.map((row) => row.systemId).sort()).toEqual([
      ORIGIN,
      DESTINATION,
    ]);
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]).toMatchObject({
      _id: candidateId,
      toSystemId: DESTINATION,
      destinationProvenance: 'jump-verified',
      observedMassKg: 10_000_000,
      observationKey: 'observation-key',
    });
    expect(state.connections[0]?.pendingCandidates).toBeUndefined();
    expect(state.stamps).toEqual([
      expect.objectContaining({
        mapId: MAP,
        characterId: CHARACTER,
        lastProcessedTransitionAt: OBSERVED_AT,
      }),
    ]);

    await t.run(async (ctx) => {
      const location = await ctx.db
        .query('characterLocation')
        .withIndex('by_user_character', (q) =>
          q.eq('userId', TRACKER).eq('characterId', CHARACTER),
        )
        .unique();
      if (location === null) throw new Error('seeded location missing');
      await ctx.db.patch(location._id, {
        stationId: 60_003_760,
        observedAt: OBSERVED_AT + 1_000,
      });
    });
    expect(
      await t.mutation(internal.mapJump.resolveJumpAuthoring, args),
    ).toEqual({ status: 'converged', reason: 'processed' });
    expect((await mapState(t)).connections[0]?.observedMassKg).toBe(10_000_000);

    const connectionEvidence = await t.query(
      internal.mapJump.connectionEvidence,
      { userId: EDITOR, mapId: MAP, connectionId: candidateId },
    );
    expect(connectionEvidence).toMatchObject({
      canEdit: true,
      connection: {
        connectionId: candidateId,
        fromSystemId: ORIGIN,
        toSystemId: DESTINATION,
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        destinationProvenance: 'jump-verified',
      },
    });
    await expect(
      t.query(internal.mapJump.connectionEvidence, {
        userId: VIEWER,
        mapId: MAP,
        connectionId: candidateId,
      }),
    ).resolves.toEqual({ canEdit: false, connection: null });
  });

  it('records assumed survivors, confirms them, and re-associates the destination round trip', async () => {
    const t = convexTest(schema, modules);
    await grant(t, EDITOR, ['editor']);
    await seedTrackedTransition(t);
    const firstId = await seedCandidate(t, 'AAA', 'C247');
    const secondId = await seedCandidate(t, 'BBB', null);

    await t.mutation(
      internal.mapJump.resolveJumpAuthoring,
      authorArgs({
        decision: {
          kind: 'resolve',
          candidateId: firstId,
          provenance: 'assumed',
          candidateIds: [firstId, secondId],
          survivors: [firstId, secondId],
        },
      }),
    );
    expect(await t.run(async (ctx) => await ctx.db.get(firstId))).toMatchObject({
      toSystemId: DESTINATION,
      destinationProvenance: 'assumed',
      pendingCandidates: [firstId, secondId],
    });

    const confirmed = await t.mutation(internal.mapJump.confirmJumpIdentity, {
      userId: EDITOR,
      mapId: MAP,
      connectionId: firstId,
    });
    expect(confirmed).toMatchObject({
      connectionId: firstId,
      destinationProvenance: 'confirmed',
    });
    expect(await t.run(async (ctx) => await ctx.db.get(firstId))).toMatchObject({
      destinationProvenance: 'confirmed',
    });
    expect(
      (await t.run(async (ctx) => await ctx.db.get(firstId)))?.pendingCandidates,
    ).toBeUndefined();

    await t.mutation(internal.mapJump.reassociateJumpDestination, {
      userId: EDITOR,
      mapId: MAP,
      connectionId: firstId,
      targetConnectionId: secondId,
    });
    const moved = await t.run(async (ctx) => ({
      first: await ctx.db.get(firstId),
      second: await ctx.db.get(secondId),
    }));
    expect(moved.first).toMatchObject({ toSystemId: null });
    expect(moved.first?.pendingCandidates).toBeUndefined();
    expect(moved.second).toMatchObject({
      toSystemId: DESTINATION,
      destinationProvenance: 'human',
      observedMassKg: 10_000_000,
      observationKey: 'observation-key',
    });

    await t.mutation(internal.mapJump.reassociateJumpDestination, {
      userId: EDITOR,
      mapId: MAP,
      connectionId: secondId,
      targetConnectionId: firstId,
    });
    const restored = await t.run(async (ctx) => ({
      first: await ctx.db.get(firstId),
      second: await ctx.db.get(secondId),
    }));
    expect(restored.first).toMatchObject({
      toSystemId: DESTINATION,
      destinationProvenance: 'human',
      observedMassKg: 10_000_000,
    });
    expect(restored.second).toMatchObject({ toSystemId: null });
  });

  it('auto-resolves one assumed survivor without durable prompt state', async () => {
    const t = convexTest(schema, modules);
    await grant(t, EDITOR, ['editor']);
    await seedTrackedTransition(t);
    const candidateId = await seedCandidate(t, 'AAA', null);

    await t.mutation(
      internal.mapJump.resolveJumpAuthoring,
      authorArgs({
        decision: {
          kind: 'resolve',
          candidateId,
          provenance: 'assumed',
          candidateIds: [candidateId],
          survivors: [candidateId],
        },
      }),
    );
    const resolved = await t.run(async (ctx) => await ctx.db.get(candidateId));
    expect(resolved).toMatchObject({
      toSystemId: DESTINATION,
      destinationProvenance: 'assumed',
    });
    expect(resolved?.pendingCandidates).toBeUndefined();
  });

  it('inserts without candidates and converges a reverse crossing onto the same connection', async () => {
    const t = convexTest(schema, modules);
    await grant(t, EDITOR, ['editor']);
    await seedTrackedTransition(t);
    const first = await t.mutation(
      internal.mapJump.resolveJumpAuthoring,
      authorArgs({
        observedShipMassKg: 5_000_000,
        decision: { kind: 'insert', candidateIds: [], survivors: [] },
      }),
    );
    expect(first.status).toBe('authored');

    const returnCharacter = CHARACTER + 1;
    const returnAt = OBSERVED_AT + 5_000;
    await seedTrackedTransition(t, {
      characterId: returnCharacter,
      trackingUserId: 'return-scout',
      fromSystemId: DESTINATION,
      toSystemId: ORIGIN,
      transitionObservedAt: returnAt,
    });
    const reverse = await t.mutation(
      internal.mapJump.resolveJumpAuthoring,
      authorArgs({
        characterId: returnCharacter,
        fromSolarSystemId: DESTINATION,
        toSolarSystemId: ORIGIN,
        transitionObservedAt: returnAt,
        observedShipMassKg: 7_000_000,
        observationKey: 'ignored-second-key',
        decision: { kind: 'insert', candidateIds: [], survivors: [] },
      }),
    );
    expect(reverse.status).toBe('converged');
    const state = await mapState(t);
    expect(state.systems).toHaveLength(2);
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]).toMatchObject({
      fromSystemId: ORIGIN,
      toSystemId: DESTINATION,
      observedMassKg: 12_000_000,
      observationKey: 'observation-key',
    });
    expect(state.stamps).toHaveLength(2);
  });

  it('keeps the processed stamp across untrack/retrack and rejects viewer authority', async () => {
    const t = convexTest(schema, modules);
    await grant(t, EDITOR, ['editor']);
    await grant(t, VIEWER, ['viewer']);
    await seedTrackedTransition(t);
    const args = authorArgs({
      decision: { kind: 'insert', candidateIds: [], survivors: [] },
    });
    await t.mutation(internal.mapJump.resolveJumpAuthoring, args);

    await t.run(async (ctx) => {
      const tracking = await ctx.db
        .query('mapTracking')
        .withIndex('by_map_user', (q) => q.eq('mapId', MAP).eq('userId', TRACKER))
        .unique();
      if (tracking !== null) await ctx.db.delete(tracking._id);
      await ctx.db.insert('mapTracking', {
        mapId: MAP,
        userId: TRACKER,
        characterId: CHARACTER,
      });
    });
    expect(
      await t.mutation(internal.mapJump.resolveJumpAuthoring, args),
    ).toEqual({ status: 'converged', reason: 'processed' });
    expect((await mapState(t)).connections[0]?.observedMassKg).toBe(10_000_000);

    await expect(
      t.mutation(internal.mapJump.resolveJumpAuthoring, {
        ...args,
        userId: VIEWER,
        transitionObservedAt: OBSERVED_AT + 1,
      }),
    ).rejects.toThrow('FORBIDDEN');
  });

  it('lapses off-map origins and tombstoned destinations without partial writes', async () => {
    const offMap = convexTest(schema, modules);
    await grant(offMap, EDITOR, ['editor']);
    await seedTrackedTransition(offMap, { placeOrigin: false });
    expect(
      await offMap.mutation(
        internal.mapJump.resolveJumpAuthoring,
        authorArgs({
          decision: { kind: 'insert', candidateIds: [], survivors: [] },
        }),
      ),
    ).toEqual({ status: 'stale', reason: 'origin' });
    expect(await mapState(offMap)).toEqual({
      systems: [],
      connections: [],
      stamps: [],
    });

    const tombstoned = convexTest(schema, modules);
    await grant(tombstoned, EDITOR, ['editor']);
    await seedTrackedTransition(tombstoned);
    await tombstoned.run(async (ctx) => {
      await ctx.db.insert('mapSystems', {
        mapId: MAP,
        systemId: DESTINATION,
        deletedAt: OBSERVED_AT - 1_000,
        purgeAfter: OBSERVED_AT + 60_000,
      });
    });
    expect(
      await tombstoned.mutation(
        internal.mapJump.resolveJumpAuthoring,
        authorArgs({
          decision: { kind: 'insert', candidateIds: [], survivors: [] },
        }),
      ),
    ).toEqual({ status: 'stale', reason: 'destination' });
    const state = await mapState(tombstoned);
    expect(state.systems).toHaveLength(2);
    expect(state.connections).toEqual([]);
    expect(state.stamps).toEqual([]);
  });
  it('ignores forged tracking rows that join to no location document', async () => {
    const t = convexTest(schema, modules);
    await grant(t, EDITOR, ['editor']);
    await seedTrackedTransition(t);
    // A view-only user can write a tracking row naming any characterId; a row
    // that joins to no characterLocation doc must not veto the genuine one.
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: MAP,
        userId: 'user-forger',
        characterId: CHARACTER,
      });
    });
    const evidence = await t.query(internal.mapJump.jumpEvidence, {
      userId: EDITOR,
      mapId: MAP,
      characterId: CHARACTER,
    });
    expect(evidence).toMatchObject({
      tracked: true,
      transition: { fromSolarSystemId: ORIGIN, toSolarSystemId: DESTINATION },
    });

    // Two JOINABLE rows are genuine ambiguity and stay fail-closed.
    await t.run(async (ctx) => {
      await ctx.db.insert('characterLocation', {
        userId: 'user-forger',
        characterId: CHARACTER,
        solarSystemId: DESTINATION,
        stationId: null,
        structureId: null,
        shipTypeId: 587,
        prevSolarSystemId: ORIGIN,
        prevFresh: true,
        transitionObservedAt: OBSERVED_AT,
        observedAt: OBSERVED_AT,
        etagLocation: null,
        etagShip: null,
      });
    });
    const ambiguous = await t.query(internal.mapJump.jumpEvidence, {
      userId: EDITOR,
      mapId: MAP,
      characterId: CHARACTER,
    });
    expect(ambiguous).toMatchObject({ tracked: false, transition: null });
  });
});
