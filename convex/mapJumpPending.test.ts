// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { blankHallway } from '@/data/maps/connection-hallway';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { modules } from './__tests__/modules.setup';

const MAP = 'pending-jump';
const USER = 'editor';
const FROM = 31_000_001;
const TO = 31_000_002;
const AT = 1_800_000_000_000;
const MASS = 10_000_000;
type Chain = TestConvex<typeof schema>;

async function track(t: Chain, characterId: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapTracking', { mapId: MAP, userId: USER, characterId });
    await ctx.db.insert('characterLocation', {
      userId: USER,
      characterId,
      solarSystemId: TO,
      prevSolarSystemId: FROM,
      prevFresh: true,
      transitionObservedAt: AT,
      observedAt: AT,
      stationId: null,
      structureId: null,
      shipTypeId: 587,
      etagLocation: null,
      etagShip: null,
    });
  });
}

async function setup() {
  const t = convexTest(schema, modules);
  const candidates = await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId: MAP, userId: USER, roles: ['editor'] });
    await ctx.db.insert('mapSystems', { mapId: MAP, systemId: FROM, deletedAt: null, purgeAfter: null });
    const ids: Id<'mapConnections'>[] = [];
    for (const signatureId of ['AAA-001', 'BBB-002', 'CCC-003']) {
      const base = blankHallway({ mapId: MAP, fromSystemId: FROM, toSystemId: null });
      ids.push(await ctx.db.insert('mapConnections', {
        ...base,
        from: { ...base.from, signatureId, typeCode: 'C247', signalPct: 100 },
        to: { ...base.to, typeCode: 'K162' },
        identity: { kind: 'typed', provenance: 'human' },
        observationKey: `scan-${signatureId}`,
        firstSeenAt: AT - 100,
        lifetime: { kind: 'stage', lifeStage: 'under_1_day', observedAt: AT - 100 },
        shipSize: 'L',
      }));
    }
    return ids;
  });
  await track(t, 1);
  const selected = candidates[0];
  if (selected === undefined) throw new Error('missing candidate');
  const args = {
    userId: USER,
    mapId: MAP,
    characterId: 1,
    fromSolarSystemId: FROM,
    toSolarSystemId: TO,
    transitionObservedAt: AT,
    observedShipMassKg: MASS,
    observationKey: 'pending-observation',
    decision: {
      kind: 'resolve' as const,
      candidateId: selected,
      provenance: 'assumed' as const,
      candidateIds: candidates,
      survivors: candidates,
    },
  };
  return { t, candidates, args };
}

async function state(t: Chain) {
  return await t.run(async (ctx) => ({
    connections: await ctx.db.query('mapConnections').withIndex('by_map', (q) => q.eq('mapId', MAP)).take(64),
    systems: await ctx.db.query('mapSystems').withIndex('by_map', (q) => q.eq('mapId', MAP)).take(64),
  }));
}

async function pending(t: Chain, args: Awaited<ReturnType<typeof setup>>['args']) {
  const result = await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, args);
  if (result.status !== 'authored') throw new Error('expected authored pending jump');
  return result.emission.connectionId;
}

function answer(connectionId: Id<'mapConnections'>, targetConnectionId: Id<'mapConnections'>) {
  return { userId: USER, mapId: MAP, connectionId, targetConnectionId };
}

describe('ambiguous jump identity', () => {
  it('rejects field edits on an unanswered jump and preserves its selectable candidates', async () => {
    const { t, candidates, args } = await setup();
    const sourceId = await pending(t, args);
    const before = await state(t);
    await expect(t.withIdentity({ subject: USER }).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
      mapId: MAP,
      connectionId: sourceId,
      side: 'from',
      value: 'C247',
    })).rejects.toThrow('UNANSWERED_JUMP');
    expect(await state(t)).toEqual(before);
    const targetId = candidates[1];
    if (targetId === undefined) throw new Error('missing candidate');
    expect(await t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, targetId)))
      .toMatchObject({ connectionId: targetId, toSystemId: TO });
  });

  it('leaves candidates and map systems untouched and excludes the prompt from future candidates', async () => {
    const { t, candidates, args } = await setup();
    const before = await state(t);
    const result = await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, args);
    expect(result).toMatchObject({ status: 'authored', emission: { toSystemId: null, destinationProvenance: null } });
    const after = await state(t);
    expect(after.systems).toEqual(before.systems);
    expect(after.connections.filter((row) => candidates.includes(row._id))).toEqual(before.connections);
    expect(after.connections.find((row) => !candidates.includes(row._id))).toMatchObject({
      toSystemId: null,
      from: { signatureId: null, typeCode: null },
      observedMassKg: MASS,
      resolution: { kind: 'awaiting-signature', destinationSystemId: TO, characterId: 1 },
    });
    const evidence = await t.query(internal.mapJumpEvidence.jumpEvidence, { userId: USER, mapId: MAP, characterId: 1 });
    expect(evidence.candidates.map((row) => row.id)).toEqual(candidates);
    expect(await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, args)).toEqual({ status: 'converged', reason: 'processed' });
    expect(await state(t)).toEqual(after);
  });

  it.each([0, 1, 2])('commits only the chosen candidate %i and preserves scanned identity and static metadata', async (index) => {
    const { t, candidates, args } = await setup();
    const targetId = candidates[index];
    if (targetId === undefined) throw new Error('missing candidate');
    await t.run((ctx) => ctx.db.patch(targetId, { staticCode: 'C247', seatOrderAt: AT - 500 }));
    const before = await state(t);
    const sourceId = await pending(t, args);
    const emission = await t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, targetId));
    const after = await state(t);
    const original = before.connections.find((row) => row._id === targetId);
    expect(emission).toMatchObject({ connectionId: targetId, toSystemId: TO, observationKey: original?.observationKey, destinationProvenance: 'human' });
    expect(after.connections.find((row) => row._id === targetId)).toEqual({
      ...original,
      toSystemId: TO,
      resolution: { kind: 'destination', provenance: 'human' },
      observedMassKg: MASS,
    });
    expect(after.connections.some((row) => row._id === sourceId)).toBe(false);
    expect(after.connections.filter((row) => candidates.includes(row._id) && row._id !== targetId))
      .toEqual(before.connections.filter((row) => row._id !== targetId));
    expect(after.systems.some((row) => row.systemId === TO)).toBe(true);
    await expect(t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, targetId))).rejects.toThrow('UNKNOWN_CONNECTION');
    expect(await state(t)).toEqual(after);
  });

  it('retains a selectable signature when claiming a static replaces its row id', async () => {
    const { t, candidates, args } = await setup();
    const sourceId = await pending(t, args);
    const replacedId = candidates[1];
    if (replacedId === undefined) throw new Error('missing candidate');
    const claimedId = await t.run(async (ctx) => {
      const row = await ctx.db.get(replacedId);
      if (row === null) throw new Error('missing candidate');
      const { _id, _creationTime, ...fields } = row;
      const id = await ctx.db.insert('mapConnections', { ...fields, staticCode: 'C247', seatOrderAt: AT - 200 });
      await ctx.db.delete(_id);
      return id;
    });
    const emission = await t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, claimedId));
    expect(emission).toMatchObject({ connectionId: claimedId, toSystemId: TO, observationKey: 'scan-BBB-002' });
    expect((await state(t)).connections.find((row) => row._id === claimedId)).toMatchObject({ staticCode: 'C247', seatOrderAt: AT - 200 });
  });

  it('shares one pending jump across tracked characters and counts each transition once', async () => {
    const { t, args } = await setup();
    await track(t, 2);
    const sourceId = await pending(t, args);
    const second = { ...args, characterId: 2, observationKey: 'second-jump' };
    expect(await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, second))
      .toMatchObject({ status: 'converged', emission: { connectionId: sourceId, toSystemId: null } });
    await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, second);
    const after = await state(t);
    expect(after.connections.filter((row) => row.resolution.kind === 'awaiting-signature')).toHaveLength(1);
    expect(after.connections.find((row) => row._id === sourceId)?.observedMassKg).toBe(MASS * 2);
    expect(after.systems.map((row) => row.systemId)).toEqual([FROM]);
  });

  it('rebinds an unscanned candidate when typing it claims a static placeholder', async () => {
    const { t, candidates, args } = await setup();
    const targetId = candidates[1];
    if (targetId === undefined) throw new Error('missing candidate');
    const placeholderId = await t.run(async (ctx) => {
      const target = await ctx.db.get(targetId);
      if (target === null) throw new Error('missing candidate');
      await ctx.db.patch(targetId, { from: { ...target.from, signatureId: null } });
      const base = blankHallway({ mapId: MAP, fromSystemId: FROM, toSystemId: null });
      return await ctx.db.insert('mapConnections', {
        ...base,
        from: { ...base.from, typeCode: 'C247' },
        to: { ...base.to, typeCode: 'K162' },
        staticCode: 'C247',
      });
    });
    const sourceId = await pending(t, args);
    await t.withIdentity({ subject: USER }).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
      mapId: MAP,
      connectionId: targetId,
      side: 'from',
      value: 'C247',
    });
    const afterClaim = await state(t);
    expect(afterClaim.connections.some((row) => row._id === targetId)).toBe(false);
    expect(afterClaim.connections.find((row) => row._id === sourceId)?.resolution).toMatchObject({
      kind: 'awaiting-signature',
      candidates: [
        { connectionId: candidates[0], signatureId: 'AAA-001' },
        { connectionId: placeholderId, signatureId: null },
        { connectionId: candidates[2], signatureId: 'CCC-003' },
      ],
    });
    expect(await t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, placeholderId)))
      .toMatchObject({ connectionId: placeholderId, toSystemId: TO });
  });

  it('skeletons a dying pair to the same destination when deferring the jump', async () => {
    const { t, args } = await setup();
    const corpseId = await t.run(async (ctx) => ctx.db.insert('mapConnections', {
      ...blankHallway({ mapId: MAP, fromSystemId: FROM, toSystemId: TO }),
      tombstone: { kind: 'removed', deletedAt: AT - 1_000, purgeAfter: AT + 60_000 },
    }));
    await pending(t, args);
    const corpse = await t.run((ctx) => ctx.db.get(corpseId));
    expect(corpse?.tombstone.kind === 'removed' ? corpse.tombstone.purgeAfter : null)
      .not.toBe(AT + 60_000);
    expect(corpse?.tombstone.kind === 'removed' ? corpse.tombstone.purgeAfter : null)
      .toBeLessThanOrEqual(Date.now());
  });

  it('skeletons a dying pair when answering a deferred jump', async () => {
    const { t, candidates, args } = await setup();
    const sourceId = await pending(t, args);
    const targetId = candidates[1];
    if (targetId === undefined) throw new Error('missing candidate');
    const corpseId = await t.run(async (ctx) => ctx.db.insert('mapConnections', {
      ...blankHallway({ mapId: MAP, fromSystemId: FROM, toSystemId: TO }),
      tombstone: { kind: 'removed', deletedAt: AT - 1_000, purgeAfter: AT + 60_000 },
    }));
    await t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, targetId));
    const corpse = await t.run((ctx) => ctx.db.get(corpseId));
    expect(corpse?.tombstone.kind === 'removed' ? corpse.tombstone.purgeAfter : null)
      .not.toBe(AT + 60_000);
    expect(corpse?.tombstone.kind === 'removed' ? corpse.tombstone.purgeAfter : null)
      .toBeLessThanOrEqual(Date.now());
  });

  it('rejects unauthorized and non-offered answers without publishing a destination', async () => {
    const { t, candidates, args } = await setup();
    const sourceId = await pending(t, args);
    const targetId = candidates[0];
    if (targetId === undefined) throw new Error('missing candidate');
    await t.run(async (ctx) => { await ctx.db.insert('mapAccess', { mapId: MAP, userId: 'viewer', roles: ['viewer'] }); });
    const before = await state(t);
    await expect(t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, { ...answer(sourceId, targetId), userId: 'viewer' })).rejects.toThrow();
    expect(await state(t)).toEqual(before);
    const unoffered = await t.run((ctx) => ctx.db.insert('mapConnections', blankHallway({ mapId: MAP, fromSystemId: FROM, toSystemId: null })));
    const withOther = await state(t);
    await expect(t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, unoffered))).rejects.toThrow('INVALID_SIGNATURE_CHOICE');
    expect(await state(t)).toEqual(withOther);
  });

  it('does not absorb an awaiting jump as an unlabelled counterpart during elimination', async () => {
    const { t, candidates, args } = await setup();
    const sourceId = await pending(t, args);
    const resolvedId = await t.run(async (ctx) => {
      for (const id of candidates) await ctx.db.delete(id);
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: TO, deletedAt: null, purgeAfter: null });
      const stub = blankHallway({ mapId: MAP, fromSystemId: TO, toSystemId: null });
      await ctx.db.insert('mapConnections', { ...stub, from: { ...stub.from, signatureId: 'DDD-004' } });
      return await ctx.db.insert('mapConnections', blankHallway({ mapId: MAP, fromSystemId: TO, toSystemId: FROM }));
    });
    const before = await t.run((ctx) => ctx.db.get(sourceId));
    expect(await t.mutation(internal.mapScan.applyEliminationDeductions, {
      userId: USER,
      mapId: MAP,
      systemId: TO,
      deductions: [{ signatureId: 'DDD-004', connectionId: resolvedId, expectedTypeCode: null, provenance: 'assumed' }],
    })).toMatchObject([{ outcome: 'applied' }]);
    expect(await t.run((ctx) => ctx.db.get(sourceId))).toEqual(before);
  });

  it('repairs legacy pending jumps onto identified signatures while retaining both observation keys', async () => {
    const { t, candidates } = await setup();
    const sourceId = candidates[0];
    const targetId = candidates[1];
    if (sourceId === undefined || targetId === undefined) throw new Error('missing candidate');
    await t.run((ctx) => ctx.db.patch(sourceId, {
      toSystemId: TO,
      observedMassKg: MASS,
      resolution: { kind: 'pending', provenance: 'assumed', characterId: 1, candidateIds: candidates },
    }));
    const emission = await t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, targetId));
    expect(emission).toMatchObject({ connectionId: targetId, toSystemId: TO, observationKey: 'scan-BBB-002' });
    const after = await state(t);
    expect(after.connections.find((row) => row._id === sourceId)).toMatchObject({ toSystemId: null, observationKey: 'scan-AAA-001' });
    expect(after.connections.find((row) => row._id === sourceId)?.observedMassKg).toBeUndefined();
    expect(after.connections.find((row) => row._id === targetId)).toMatchObject({ toSystemId: TO, observationKey: 'scan-BBB-002', observedMassKg: MASS });
  });

  it.each(['resolved', 'deleted', 'mass'] as const)('rejects a %s candidate and preserves the pending jump', async (change) => {
    const { t, candidates, args } = await setup();
    const sourceId = await pending(t, args);
    const targetId = candidates[0];
    if (targetId === undefined) throw new Error('missing candidate');
    await t.run(async (ctx) => {
      if (change === 'resolved') await ctx.db.patch(targetId, { toSystemId: TO + 1 });
      if (change === 'deleted') await ctx.db.patch(targetId, { tombstone: { kind: 'removed', deletedAt: AT, purgeAfter: null } });
      if (change === 'mass') await ctx.db.patch(targetId, { observedMassKg: 1 });
    });
    const before = await state(t);
    await expect(t.mutation(internal.mapJumpIdentity.reassociateJumpDestination, answer(sourceId, targetId))).rejects.toThrow();
    expect(await state(t)).toEqual(before);
    expect(before.systems.map((row) => row.systemId)).toEqual([FROM]);
  });
});
