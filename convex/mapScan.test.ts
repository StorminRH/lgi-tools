// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import { doorLeadsTo } from '@/data/maps/connection-door-destinations';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { SIGNATURE_ACTIVITY_STALE_MS } from './lib/mapSignatures';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const MAP = 'map-a';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';
const CHARACTER = 1001;
const NOW = 1_800_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;
const DODIXIE = 30_002_659;
const WH_FAR = 31_000_005;

type ScanDb = TestConvex<typeof schema>;

function asEditor(t: ScanDb) {
  return t.withIdentity({ subject: EDITOR, name: 'Editor Pilot' });
}

function signature(
  signatureId: string,
  overrides: Partial<ScannedRow> = {},
): ScannedRow {
  return {
    signatureId,
    kind: 'signature',
    group: null,
    name: null,
    signalPct: 0,
    ...overrides,
  };
}

function anomaly(signatureId: string): ScannedRow {
  return signature(signatureId, {
    kind: 'anomaly',
    group: 'Combat Site',
    name: 'Frontier Command Post',
    signalPct: 100,
  });
}

async function seed(t: ScanDb): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId: MAP, userId: EDITOR, roles: ['editor'] });
    await ctx.db.insert('mapAccess', { mapId: MAP, userId: VIEWER, roles: ['viewer'] });
    await ctx.db.insert('mapSystems', {
      mapId: MAP,
      systemId: JITA,
      deletedAt: null,
      purgeAfter: null,
    });
    await ctx.db.insert('mapTracking', {
      mapId: MAP,
      userId: EDITOR,
      characterId: CHARACTER,
    });
    await ctx.db.insert('characterLocation', {
      userId: EDITOR,
      characterId: CHARACTER,
      solarSystemId: JITA,
      stationId: null,
      structureId: null,
      shipTypeId: null,
      prevSolarSystemId: null,
      prevFresh: false,
      observedAt: NOW,
      etagLocation: null,
      etagShip: null,
    });
  });
}

function apply(t: ScanDb, rows: ScannedRow[]) {
  return asEditor(t).mutation(api.mapScan.applyScan, {
    mapId: MAP,
    systemId: JITA,
    rows,
  });
}

function readState(t: ScanDb) {
  return t.run(async (ctx) => ({
    signatures: await ctx.db
      .query('mapSignatures')
      .withIndex('by_map_signature', (q) => q.eq('mapId', MAP).eq('systemId', JITA))
      .collect(),
    connections: await ctx.db
      .query('mapConnections')
      .withIndex('by_map_from', (q) => q.eq('mapId', MAP).eq('fromSystemId', JITA))
      .collect(),
    activities: await ctx.db
      .query('mapSignatureActivity')
      .withIndex('by_map_signature', (q) => q.eq('mapId', MAP).eq('systemId', JITA))
      .collect(),
  }));
}

async function readSignature(t: ScanDb, signatureId: string) {
  return await t.run(async (ctx) => await ctx.db
    .query('mapSignatures')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', MAP).eq('systemId', JITA).eq('signatureId', signatureId),
    )
    .unique());
}

describe('mapScan paste application and lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('requires edit access and the caller\'s own tracked live system', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    await expect(t.withIdentity({ subject: VIEWER }).mutation(api.mapScan.applyScan, {
      mapId: MAP,
      systemId: JITA,
      rows: [signature('ABC-001')],
    })).rejects.toThrow('FORBIDDEN');

    await t.run(async (ctx) => {
      const tracking = await ctx.db
        .query('mapTracking')
        .withIndex('by_map_user', (q) => q.eq('mapId', MAP).eq('userId', EDITOR))
        .unique();
      await ctx.db.delete(tracking!._id);
    });
    await expect(apply(t, [signature('ABC-001')])).rejects.toThrow('UNTRACKED_SCAN_SYSTEM');
    expect(await readState(t)).toMatchObject({ signatures: [], connections: [], activities: [] });
  });

  it('wormhole rows land in connections while list rows remain signatures', async () => {
    const t = convexTest(schema, modules);
    await seed(t);

    expect(await apply(t, [
      signature('WHL-001', { group: 'Wormhole', signalPct: 42.5 }),
      signature('SIG-001', { group: 'Gas Site', name: 'Barren Perimeter Reservoir' }),
    ])).toMatchObject({ inserted: 2, migrated: 0 });

    const state = await readState(t);
    expect(state.signatures).toHaveLength(1);
    expect(state.signatures[0]).toMatchObject({
      signatureId: 'SIG-001',
      kind: 'signature',
      group: 'Gas Site',
    });
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]).toMatchObject({
      fromSignatureId: 'WHL-001',
      fromSignalPct: 42.5,
      firstSeenAt: NOW,
      toSystemId: null,
    });
  });

  it('migrates one existing signature to one unresolved row and no signature row', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { signalPct: 25 })]);
    const before = await readSignature(t, 'WHL-001');

    expect(await apply(t, [
      signature('WHL-001', { group: 'Wormhole', name: 'Unstable Wormhole', signalPct: 100 }),
    ])).toMatchObject({ migrated: 1 });

    const state = await readState(t);
    expect(state.signatures).toEqual([]);
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]).toMatchObject({
      fromSignatureId: 'WHL-001',
      fromSignalPct: 100,
      firstSeenAt: before!._creationTime,
      toSystemId: null,
    });
  });

  it('identifies list rows in place and converges wormholes onto the connection row', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('SIG-001'), signature('WHL-001')]);

    await expect(
      t.withIdentity({ subject: VIEWER }).mutation(api.mapScan.identifySignature, {
        mapId: MAP,
        systemId: JITA,
        signatureId: 'SIG-001',
        group: 'Gas Site',
      }),
    ).rejects.toThrow('FORBIDDEN');

    expect(
      await asEditor(t).mutation(api.mapScan.identifySignature, {
        mapId: MAP,
        systemId: JITA,
        signatureId: 'SIG-001',
        group: 'Gas Site',
      }),
    ).toEqual({ changed: true, connectionId: null });
    expect(await readSignature(t, 'SIG-001')).toMatchObject({
      group: 'Gas Site',
    });

    const before = await readSignature(t, 'WHL-001');
    const migrated = await asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'WHL-001',
      group: 'Wormhole',
      wormholeTypeCode: 'C247',
    });
    expect(migrated.changed).toBe(true);
    expect(migrated.connectionId).not.toBeNull();
    expect(await readSignature(t, 'WHL-001')).toBeNull();
    expect((await readState(t)).connections).toEqual([
      expect.objectContaining({
        _id: migrated.connectionId,
        fromSignatureId: 'WHL-001',
        firstSeenAt: before?._creationTime,
        toSystemId: null,
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'human',
        observationKey: expect.any(String),
      }),
    ]);

    expect(
      await asEditor(t).mutation(api.mapScan.identifySignature, {
        mapId: MAP,
        systemId: JITA,
        signatureId: 'WHL-001',
        group: 'Wormhole',
        wormholeTypeCode: 'C247',
      }),
    ).toEqual({ changed: false, connectionId: migrated.connectionId });
  });

  it('projects live elimination evidence and tier-gates one atomic deduction batch', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [
      signature('AAA-111', { group: 'Wormhole' }),
      signature('BBB-222', { group: 'Wormhole' }),
    ]);

    await expect(t.query(internal.mapScan.eliminationEvidence, {
      userId: 'stranger',
      mapId: MAP,
      systemId: JITA,
    })).resolves.toEqual({ canEdit: false, signatures: [], connections: [] });
    const evidence = await t.query(internal.mapScan.eliminationEvidence, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
    });
    expect(evidence).toMatchObject({
      canEdit: true,
      signatures: [
        { signatureId: 'AAA-111', wormholeTypeCode: null, typeProvenance: null },
        { signatureId: 'BBB-222', wormholeTypeCode: null, typeProvenance: null },
      ],
      connections: [],
    });

    const applied = await t.mutation(internal.mapScan.applyEliminationDeductions, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
      deductions: [{
        signatureId: 'AAA-111',
        typeCode: 'B274',
        provenance: 'assumed',
      }],
    });
    const observationKey = applied[0]?.observationKey ?? null;
    expect(applied).toEqual([
      { signatureId: 'AAA-111', outcome: 'applied', observationKey },
    ]);
    expect(observationKey).toEqual(expect.any(String));
    const assumed = (await readState(t)).connections.find(
      (row) => row.fromSignatureId === 'AAA-111',
    );
    if (assumed === undefined) throw new Error('missing assumed deduction row');
    expect(assumed).toMatchObject({
      wormholeTypeCode: 'B274',
      typedSide: 'from',
      typeProvenance: 'assumed',
      observationKey,
    });

    expect(await t.mutation(internal.mapScan.applyEliminationDeductions, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
      deductions: [{
        signatureId: 'AAA-111',
        typeCode: 'B274',
        provenance: 'assumed',
      }],
    })).toEqual([
      { signatureId: 'AAA-111', outcome: 'unchanged', observationKey },
    ]);

    await asEditor(t).mutation(api.mapAuthoring.setConnectionWormholeType, {
      mapId: MAP,
      connectionId: assumed._id,
      value: 'H296',
    });
    expect(await t.mutation(internal.mapScan.applyEliminationDeductions, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
      deductions: [{
        signatureId: 'AAA-111',
        typeCode: 'B274',
        provenance: 'assumed',
      }],
    })).toEqual([
      { signatureId: 'AAA-111', outcome: 'protected', observationKey },
    ]);
    expect((await readState(t)).connections.find(
      (row) => row.fromSignatureId === 'AAA-111',
    )).toMatchObject({ wormholeTypeCode: 'H296', typeProvenance: 'human' });

    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['BBB-222'],
    });
    expect(await t.query(internal.mapScan.eliminationEvidence, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
    })).toMatchObject({
      signatures: [{
        signatureId: 'AAA-111',
        wormholeTypeCode: 'H296',
        typeProvenance: 'human',
        observationKey,
      }],
    });
  });

  it('links a far-side signature with mass carry and refuses stale type races', async () => {
    const linked = convexTest(schema, modules);
    await seed(linked);
    await apply(linked, [signature('KSI-162', { group: 'Wormhole', name: 'K162' })]);
    let linkedTarget = '' as Id<'mapConnections'>;
    await linked.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      linkedTarget = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    expect(await linked.mutation(internal.mapScan.applyEliminationDeductions, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
      deductions: [{
        signatureId: 'KSI-162',
        connectionId: linkedTarget,
        provenance: 'assumed',
        expectedTypeCode: null,
      }],
    })).toEqual([
      { signatureId: 'KSI-162', outcome: 'applied', observationKey: null },
    ]);
    expect(await linked.run(async (ctx) => await ctx.db
      .query('mapConnections')
      .withIndex('by_map', (q) => q.eq('mapId', MAP))
      .collect())).toEqual([
      expect.objectContaining({ _id: linkedTarget, toSignatureId: 'KSI-162' }),
    ]);
    expect(await linked.run(async (ctx) => await ctx.db.query('mapEvents').collect()))
      .toEqual([]);

    const stale = convexTest(schema, modules);
    await seed(stale);
    await apply(stale, [signature('KSI-162', { group: 'Wormhole', name: 'K162' })]);
    let stubId = '' as Id<'mapConnections'>;
    let staleTarget = '' as Id<'mapConnections'>;
    await stale.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const stub = (await ctx.db.query('mapConnections').collect())[0]!;
      stubId = stub._id;
      await ctx.db.patch(stubId, {
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
      });
      staleTarget = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    expect(await stale.mutation(internal.mapScan.applyEliminationDeductions, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
      deductions: [{
        signatureId: 'KSI-162',
        connectionId: staleTarget,
        provenance: 'assumed',
        expectedTypeCode: null,
      }],
    })).toEqual([
      { signatureId: 'KSI-162', outcome: 'stale', observationKey: null },
    ]);
    expect(await stale.run(async (ctx) => await ctx.db.get(stubId))).toMatchObject({
      wormholeTypeCode: 'B274',
      typeProvenance: 'human',
    });
    expect(
      (await stale.run(async (ctx) => await ctx.db.get(staleTarget)))?.toSignatureId,
    ).toBeUndefined();

    const carried = convexTest(schema, modules);
    await seed(carried);
    await apply(carried, [signature('KSI-162', { group: 'Wormhole', name: 'K162' })]);
    let carriedTarget = '' as Id<'mapConnections'>;
    await carried.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const stub = (await ctx.db.query('mapConnections').collect())[0]!;
      await ctx.db.patch(stub._id, {
        massState: 'stable',
        observedMassAtStateKg: 1_000_000_000,
        shipSize: 'M',
        lifeStage: 'under_1_day',
        lifeStageObservedAt: 1_500,
        deathEarliestAt: 1_000,
        deathLatestAt: 2_000,
      });
      carriedTarget = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    expect(await carried.mutation(internal.mapScan.applyEliminationDeductions, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
      deductions: [{
        signatureId: 'KSI-162',
        connectionId: carriedTarget,
        provenance: 'assumed',
        expectedTypeCode: null,
      }],
    })).toEqual([
      { signatureId: 'KSI-162', outcome: 'applied', observationKey: null },
    ]);
    expect(await carried.run(async (ctx) => await ctx.db.get(carriedTarget))).toMatchObject({
      toSignatureId: 'KSI-162',
      massState: 'stable',
      observedMassAtStateKg: 1_000_000_000,
      shipSize: 'M',
      lifeStage: 'under_1_day',
      lifeStageObservedAt: 1_500,
      deathEarliestAt: 1_000,
      deathLatestAt: 2_000,
    });
  });

  it('links a scanned stub onto a known inbound and keeps that occupied door off elimination', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('ABC-123', { group: 'Wormhole' })]);
    let stubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const stub = (await ctx.db.query('mapConnections').collect())[0];
      if (stub === undefined) {
        throw new Error('expected the pasted wormhole stub before linking');
      }
      stubId = stub._id;
      inboundId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await expect(
      t.withIdentity({ subject: VIEWER, name: 'Viewer' }).mutation(
        api.mapScan.linkStubToResolvedConnection,
        {
          mapId: MAP,
          stubConnectionId: stubId,
          resolvedConnectionId: inboundId,
        },
      ),
    ).rejects.toThrow('FORBIDDEN');
    await expect(asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: stubId,
      resolvedConnectionId: inboundId,
    })).resolves.toEqual({ outcome: 'applied' });
    expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
      toSignatureId: 'ABC-123',
    });
    expect(await t.run(async (ctx) => await ctx.db.get(stubId))).toBeNull();

    await apply(t, [
      signature('ABC-123', { group: 'Wormhole' }),
      signature('DEF-456', { group: 'Wormhole' }),
    ]);
    expect(await t.mutation(internal.mapScan.applyEliminationDeductions, {
      userId: EDITOR,
      mapId: MAP,
      systemId: JITA,
      deductions: [{
        signatureId: 'DEF-456',
        connectionId: inboundId,
        provenance: 'assumed',
        expectedTypeCode: null,
      }],
    })).toEqual([
      { signatureId: 'DEF-456', outcome: 'protected', observationKey: null },
    ]);
    expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
      toSignatureId: 'ABC-123',
    });
    expect(await t.run(async (ctx) =>
      (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.fromSignatureId === 'DEF-456' && row.toSystemId === null,
      ),
    )).toMatchObject({ fromSystemId: JITA });
  });

  it('rehomes a Leads-to join onto another stub, restores the occupant, and moves a mismatched Destination note with it', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('ABC-123', { group: 'Wormhole', name: 'K162' })]);
    let firstStubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const stub = (await ctx.db.query('mapConnections').collect())[0];
      if (stub === undefined) {
        throw new Error('expected the pasted wormhole stub before linking');
      }
      firstStubId = stub._id;
      inboundId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: 'stable',
        shipSize: 'M',
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: firstStubId,
      resolvedConnectionId: inboundId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(inboundId, { toDestinationSystemId: DODIXIE });
    });
    await apply(t, [
      signature('ABC-123', { group: 'Wormhole', name: 'K162' }),
      signature('DEF-456', { group: 'Wormhole' }),
    ]);
    const secondStubId = await t.run(async (ctx) => {
      const stub = (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.fromSignatureId === 'DEF-456' && row.toSystemId === null,
      );
      if (stub === undefined) {
        throw new Error('expected the second wormhole stub before reassigning');
      }
      return stub._id;
    });
    await expect(asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: secondStubId,
      resolvedConnectionId: inboundId,
    })).resolves.toEqual({ outcome: 'applied' });
    const rehomed = await t.run(async (ctx) => await ctx.db.get(inboundId));
    expect(rehomed).toMatchObject({
      toSignatureId: 'DEF-456',
      toSystemId: JITA,
      fromSystemId: AMARR,
      massState: 'stable',
      shipSize: 'M',
    });
    expect(rehomed?.toDestinationSystemId).toBeUndefined();
    expect(await t.run(async (ctx) => await ctx.db.get(secondStubId))).toBeNull();
    const restored = await t.run(async (ctx) =>
      (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.fromSignatureId === 'ABC-123' && row.toSystemId === null,
      ),
    );
    expect(restored).toMatchObject({
      fromSystemId: JITA,
      fromWormholeTypeCode: 'K162',
      massState: null,
      shipSize: null,
      fromDestinationSystemId: DODIXIE,
    });
    expect(restored?._id).not.toBe(firstStubId);
    expect(restored?.observationKey).toBeUndefined();
  });

  it('absorbs a unique leftover origin stub when a Leads-to pick rehomes the hallway', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('ABC-123', { group: 'Wormhole', name: 'K162' })]);
    let firstStubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const stub = (await ctx.db.query('mapConnections').collect())[0];
      if (stub === undefined) {
        throw new Error('expected the pasted wormhole stub before linking');
      }
      firstStubId = stub._id;
      inboundId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: 'stable',
        shipSize: 'M',
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: firstStubId,
      resolvedConnectionId: inboundId,
    });
    let leftoverId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      leftoverId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: null,
        fromSignatureId: 'STA-001',
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        fromWormholeTypeCode: 'B274',
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await apply(t, [
      signature('ABC-123', { group: 'Wormhole', name: 'K162' }),
      signature('DEF-456', { group: 'Wormhole' }),
    ]);
    const secondStubId = await t.run(async (ctx) => {
      const stub = (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.fromSignatureId === 'DEF-456' && row.toSystemId === null,
      );
      if (stub === undefined) {
        throw new Error('expected the second wormhole stub before reassigning');
      }
      return stub._id;
    });
    await expect(asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: secondStubId,
      resolvedConnectionId: inboundId,
    })).resolves.toEqual({ outcome: 'applied' });
    expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
      fromSignatureId: 'STA-001',
      toSignatureId: 'DEF-456',
      fromWormholeTypeCode: 'B274',
      toWormholeTypeCode: 'K162',
      massState: 'stable',
      shipSize: 'M',
    });
    expect(await t.run(async (ctx) => await ctx.db.get(leftoverId))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(secondStubId))).toBeNull();
    expect(await t.run(async (ctx) =>
      (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.fromSignatureId === 'ABC-123' && row.toSystemId === null,
      ),
    )).toMatchObject({ fromSystemId: JITA, fromWormholeTypeCode: 'K162' });
  });

  it('re-paste of a linked way-home keeps the inbound door and does not spawn a stub', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WDE-796', { group: 'Wormhole' })]);
    let stubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const stub = (await ctx.db.query('mapConnections').collect())[0];
      if (stub === undefined) {
        throw new Error('expected the pasted wormhole stub before linking');
      }
      stubId = stub._id;
      inboundId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: stubId,
      resolvedConnectionId: inboundId,
    });

    expect(await apply(t, [signature('WDE-796', { group: 'Wormhole' })])).toMatchObject({
      unchanged: 1,
      inserted: 0,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
      toSignatureId: 'WDE-796',
      toSystemId: JITA,
    });
    expect(await t.run(async (ctx) => (await ctx.db.query('mapConnections').collect())
      .filter((row) => row.toSystemId === null))).toEqual([]);
  });

  it('re-paste absorbs a leftover way-home stub onto the inbound door', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WDE-796', { group: 'Wormhole' })]);
    let stubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const stub = (await ctx.db.query('mapConnections').collect())[0];
      if (stub === undefined) {
        throw new Error('expected the pasted wormhole stub before linking');
      }
      stubId = stub._id;
      inboundId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: stubId,
      resolvedConnectionId: inboundId,
    });
    let leftoverId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      leftoverId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: null,
        fromSignatureId: 'WDE-796',
        wormholeTypeCode: 'K162',
        typedSide: 'from',
        typeProvenance: 'human',
        fromWormholeTypeCode: 'K162',
        massState: 'stable',
        shipSize: 'M',
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });

    expect(await apply(t, [signature('WDE-796', { group: 'Wormhole' })])).toMatchObject({
      updated: 1,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(leftoverId))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
      toSignatureId: 'WDE-796',
      toWormholeTypeCode: 'K162',
      massState: 'stable',
      shipSize: 'M',
    });
  });

  it('folds a unique leftover origin stub onto the resolved inbound', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('STA-001', { group: 'Wormhole', name: 'C247' })]);
    let leftoverId = '' as Id<'mapConnections'>;
    let stubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const leftover = (await ctx.db.query('mapConnections').collect())[0];
      if (leftover === undefined) {
        throw new Error('expected the origin static stub before linking');
      }
      leftoverId = leftover._id;
      await ctx.db.patch(leftover._id, {
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'human',
        fromWormholeTypeCode: 'C247',
        toWormholeTypeCode: 'K162',
        fromDestinationHint: 'unknown',
      });
      inboundId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: AMARR,
        wormholeTypeCode: null,
        fromWormholeTypeCode: null,
        toWormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
      stubId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: null,
        fromSignatureId: 'RET-001',
        wormholeTypeCode: null,
        fromWormholeTypeCode: null,
        toWormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await expect(asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: stubId,
      resolvedConnectionId: inboundId,
    })).resolves.toEqual({ outcome: 'applied' });
    const joined = await t.run(async (ctx) => await ctx.db.get(inboundId));
    expect(joined).toMatchObject({
      fromSignatureId: 'STA-001',
      toSignatureId: 'RET-001',
      fromWormholeTypeCode: 'C247',
      toWormholeTypeCode: 'K162',
      typeProvenance: 'human',
    });
    expect(joined?.fromDestinationSystemId).toBeUndefined();
    expect(doorLeadsTo(
      joined!.fromSystemId,
      joined!.toSystemId,
      'from',
      joined?.fromDestinationSystemId,
      joined?.toDestinationSystemId,
    )).toBe(AMARR);
    expect(doorLeadsTo(
      joined!.fromSystemId,
      joined!.toSystemId,
      'to',
      joined?.fromDestinationSystemId,
      joined?.toDestinationSystemId,
    )).toBe(JITA);
    expect(await t.run(async (ctx) => await ctx.db.get(leftoverId))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(stubId))).toBeNull();
  });

  it('does not downgrade a human type on the surviving inbound when the leftover is assumed', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('STA-001', { group: 'Wormhole', name: 'C247' })]);
    let leftoverId = '' as Id<'mapConnections'>;
    let stubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const leftover = (await ctx.db.query('mapConnections').collect())[0];
      if (leftover === undefined) {
        throw new Error('expected the origin static stub before linking');
      }
      leftoverId = leftover._id;
      await ctx.db.patch(leftover._id, {
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'assumed',
        fromWormholeTypeCode: 'C247',
        toWormholeTypeCode: 'K162',
      });
      inboundId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: AMARR,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        fromWormholeTypeCode: 'B274',
        toWormholeTypeCode: 'K162',
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
      stubId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: null,
        fromSignatureId: 'RET-001',
        wormholeTypeCode: null,
        fromWormholeTypeCode: null,
        toWormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await expect(asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: stubId,
      resolvedConnectionId: inboundId,
    })).resolves.toEqual({ outcome: 'applied' });
    expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
      typeProvenance: 'human',
      fromWormholeTypeCode: 'B274',
    });
    expect(await t.run(async (ctx) => await ctx.db.get(leftoverId))).toBeNull();
  });

  it('keeps a mismatched typed Leads-to on the leftover face and does not spawn that system', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('STA-001', { group: 'Wormhole', name: 'C247' })]);
    let leftoverId = '' as Id<'mapConnections'>;
    let stubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const leftover = (await ctx.db.query('mapConnections').collect())[0];
      if (leftover === undefined) {
        throw new Error('expected the origin static stub before linking');
      }
      leftoverId = leftover._id;
      await ctx.db.patch(leftover._id, {
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'human',
        fromWormholeTypeCode: 'C247',
        toWormholeTypeCode: 'K162',
        fromDestinationSystemId: DODIXIE,
      });
      inboundId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: AMARR,
        wormholeTypeCode: null,
        fromWormholeTypeCode: null,
        toWormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
      stubId = await ctx.db.insert('mapConnections', {
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: null,
        fromSignatureId: 'RET-001',
        wormholeTypeCode: null,
        fromWormholeTypeCode: null,
        toWormholeTypeCode: null,
        massState: null,
        shipSize: null,
        eolAt: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    await expect(asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: stubId,
      resolvedConnectionId: inboundId,
    })).resolves.toEqual({ outcome: 'applied' });
    const joined = await t.run(async (ctx) => await ctx.db.get(inboundId));
    expect(joined).toMatchObject({
      fromSystemId: JITA,
      toSystemId: AMARR,
      fromSignatureId: 'STA-001',
      toSignatureId: 'RET-001',
      fromDestinationSystemId: DODIXIE,
    });
    expect(doorLeadsTo(
      joined!.fromSystemId,
      joined!.toSystemId,
      'from',
      joined?.fromDestinationSystemId,
      joined?.toDestinationSystemId,
    )).toBe(DODIXIE);
    expect(doorLeadsTo(
      joined!.fromSystemId,
      joined!.toSystemId,
      'to',
      joined?.fromDestinationSystemId,
      joined?.toDestinationSystemId,
    )).toBe(JITA);
    expect(await t.run(async (ctx) =>
      await ctx.db.query('mapSystems')
        .withIndex('by_map_system', (q) => q.eq('mapId', MAP).eq('systemId', DODIXIE))
        .unique(),
    )).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(leftoverId))).toBeNull();
  });

  it('keeps a named inbound type and adopts a named stub when the inbound is K162', async () => {
    async function linkTypedStub(
      stubType: string | null,
      inboundType: { wormholeTypeCode: string | null; typedSide?: 'from' | 'to' },
    ): Promise<{ inbound: Record<string, unknown> | null }> {
      const t = convexTest(schema, modules);
      await seed(t);
      await apply(t, [signature('RET-001', { group: 'Wormhole' })]);
      let stubId = '' as Id<'mapConnections'>;
      let inboundId = '' as Id<'mapConnections'>;
      await t.run(async (ctx) => {
        await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
        const stub = (await ctx.db.query('mapConnections').collect())[0];
        if (stub === undefined) {
          throw new Error('expected the pasted wormhole stub before linking');
        }
        stubId = stub._id;
        if (stubType !== null) {
          await ctx.db.patch(stub._id, {
            wormholeTypeCode: stubType,
            typedSide: 'from',
            typeProvenance: 'human',
          });
        }
        inboundId = await ctx.db.insert('mapConnections', {
          mapId: MAP,
          fromSystemId: AMARR,
          toSystemId: JITA,
          wormholeTypeCode: inboundType.wormholeTypeCode,
          typedSide: inboundType.typedSide,
          typeProvenance: inboundType.wormholeTypeCode === null ? undefined : 'human',
          massState: null,
          shipSize: null,
          eolAt: null,
          deletedAt: null,
          purgeAfter: null,
        });
      });
      expect(await asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
        mapId: MAP,
        stubConnectionId: stubId,
        resolvedConnectionId: inboundId,
      })).toEqual({ outcome: 'applied' });
      return {
        inbound: await t.run(async (ctx) => await ctx.db.get(inboundId)),
      };
    }

    expect(await linkTypedStub('C247', {
      wormholeTypeCode: 'K162',
      typedSide: 'from',
    })).toMatchObject({
      inbound: {
        toSignatureId: 'RET-001',
        wormholeTypeCode: 'C247',
        typedSide: 'to',
        fromWormholeTypeCode: 'K162',
        toWormholeTypeCode: 'C247',
      },
    });
    expect(await linkTypedStub(null, {
      wormholeTypeCode: 'K162',
      typedSide: 'from',
    })).toMatchObject({
      inbound: {
        toSignatureId: 'RET-001',
        wormholeTypeCode: 'K162',
        typedSide: 'from',
      },
    });
    expect(await linkTypedStub(null, {
      wormholeTypeCode: 'C247',
      typedSide: 'from',
    })).toMatchObject({
      inbound: {
        toSignatureId: 'RET-001',
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        fromWormholeTypeCode: 'C247',
        toWormholeTypeCode: 'K162',
      },
    });
    expect(await linkTypedStub('C247', {
      wormholeTypeCode: 'B274',
      typedSide: 'from',
    })).toMatchObject({
      inbound: {
        toSignatureId: 'RET-001',
        wormholeTypeCode: 'B274',
        typedSide: 'from',
      },
    });
  });

  it('prefers resolved lifeStage (including timestamped Unset) and carries stub Unset onto unobserved rows', async () => {
    async function linkStub(
      signatureId: string,
      stubLife: { lifeStage: 'under_1_day' | null; lifeStageObservedAt: number },
      targetLife:
        | { lifeStage: 'expired' | null; lifeStageObservedAt: number }
        | Record<string, never>,
    ): Promise<{ t: ScanDb; targetId: Id<'mapConnections'> }> {
      const t = convexTest(schema, modules);
      await seed(t);
      await apply(t, [signature(signatureId, { group: 'Wormhole', name: 'K162' })]);
      let targetId = '' as Id<'mapConnections'>;
      await t.run(async (ctx) => {
        await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
        const stub = (await ctx.db.query('mapConnections').collect())[0];
        if (stub === undefined) {
          throw new Error('expected the pasted wormhole stub before linking');
        }
        await ctx.db.patch(stub._id, stubLife);
        targetId = await ctx.db.insert('mapConnections', {
          mapId: MAP,
          fromSystemId: AMARR,
          toSystemId: JITA,
          wormholeTypeCode: 'B274',
          typedSide: 'from',
          typeProvenance: 'human',
          massState: null,
          shipSize: null,
          eolAt: null,
          deletedAt: null,
          purgeAfter: null,
          ...targetLife,
        });
      });
      expect(await t.mutation(internal.mapScan.applyEliminationDeductions, {
        userId: EDITOR,
        mapId: MAP,
        systemId: JITA,
        deductions: [{
          signatureId,
          connectionId: targetId,
          provenance: 'assumed',
          expectedTypeCode: null,
        }],
      })).toEqual([
        { signatureId, outcome: 'applied', observationKey: null },
      ]);
      return { t, targetId };
    }

    const keepsResolved = await linkStub(
      'KSI-163',
      { lifeStage: 'under_1_day', lifeStageObservedAt: 1_500 },
      { lifeStage: 'expired', lifeStageObservedAt: 9_000 },
    );
    expect(
      await keepsResolved.t.run(async (ctx) => await ctx.db.get(keepsResolved.targetId)),
    ).toMatchObject({
      toSignatureId: 'KSI-163',
      lifeStage: 'expired',
      lifeStageObservedAt: 9_000,
    });

    const keepsUnset = await linkStub(
      'KSI-164',
      { lifeStage: 'under_1_day', lifeStageObservedAt: 1_500 },
      { lifeStage: null, lifeStageObservedAt: 9_000 },
    );
    expect(
      await keepsUnset.t.run(async (ctx) => await ctx.db.get(keepsUnset.targetId)),
    ).toMatchObject({
      toSignatureId: 'KSI-164',
      lifeStage: null,
      lifeStageObservedAt: 9_000,
    });

    const carriesStubUnset = await linkStub(
      'KSI-165',
      { lifeStage: null, lifeStageObservedAt: 1_500 },
      {},
    );
    expect(
      await carriesStubUnset.t.run(
        async (ctx) => await ctx.db.get(carriesStubUnset.targetId),
      ),
    ).toMatchObject({
      toSignatureId: 'KSI-165',
      lifeStage: null,
      lifeStageObservedAt: 1_500,
    });
  });

  it('re-paste after jump resolution enriches the same connection without duplicating it', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole', signalPct: 25 })]);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      const connection = (await ctx.db.query('mapConnections').collect())[0]!;
      await ctx.db.patch(connection._id, { toSystemId: AMARR });
    });

    expect(await apply(t, [
      signature('WHL-001', { group: 'Wormhole', signalPct: 75 }),
    ])).toMatchObject({ updated: 1 });
    const connections = (await readState(t)).connections;
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ toSystemId: AMARR, fromSignalPct: 75 });
  });

  it('unchanged re-paste writes nothing and keeps payload/activity rows byte-identical', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const rows = [
      signature('WHL-001', { group: 'Wormhole', signalPct: 58.6 }),
      anomaly('ANO-001'),
    ];
    await apply(t, rows);
    const before = await readState(t);

    expect(await apply(t, rows)).toEqual({
      inserted: 0,
      updated: 0,
      unchanged: 2,
      migrated: 0,
      conflicted: 0,
      removedConfident: 0,
      missing: [],
    });
    expect(await readState(t)).toEqual(before);
  });

  it('read set stays separated from mapChain across an unchanged re-paste', () => {
    const chainCode = readFileSync('convex/mapChain.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const scanCode = readFileSync('convex/mapScan.ts', 'utf8');

    expect(chainCode).not.toContain("'mapSignatures'");
    expect(chainCode).not.toContain("'mapSignatureActivity'");
    expect(scanCode).not.toContain("from './mapChain'");
  });

  it('debounce writes nothing at 59s and only activity after 61s', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const rows = [signature('WHL-001', { group: 'Wormhole', signalPct: 50 })];
    await apply(t, rows);
    const initial = await readState(t);

    vi.setSystemTime(NOW + SIGNATURE_ACTIVITY_STALE_MS - 1);
    expect(await apply(t, rows)).toMatchObject({ unchanged: 1 });
    expect(await readState(t)).toEqual(initial);

    vi.setSystemTime(NOW + SIGNATURE_ACTIVITY_STALE_MS + 1);
    expect(await apply(t, rows)).toMatchObject({ unchanged: 1 });
    const elapsed = await readState(t);
    expect(elapsed.signatures).toEqual(initial.signatures);
    expect(elapsed.connections).toEqual(initial.connections);
    expect(elapsed.activities[0]).toMatchObject({
      _id: initial.activities[0]!._id,
      lastSeenAt: NOW + SIGNATURE_ACTIVITY_STALE_MS + 1,
    });
  });

  it('keeps best-seen signal knowledge when a later paste regresses', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('SIG-001', { group: 'Relic Site', signalPct: 100 })]);
    const before = await readSignature(t, 'SIG-001');

    expect(await apply(t, [
      signature('SIG-001', { group: 'Relic Site', signalPct: 0 }),
    ])).toMatchObject({ unchanged: 1 });
    expect(await readSignature(t, 'SIG-001')).toEqual(before);
  });

  it('keeps known wormhole payload while a low-information sighting advances only activity', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole', signalPct: 100 })]);
    const before = await readState(t);

    vi.setSystemTime(NOW + SIGNATURE_ACTIVITY_STALE_MS + 1);
    expect(await apply(t, [signature('WHL-001', { group: null, signalPct: 0 })]))
      .toMatchObject({ unchanged: 1 });
    const after = await readState(t);
    expect(after.connections).toEqual(before.connections);
    expect(after.activities[0]).toMatchObject({
      _id: before.activities[0]!._id,
      lastSeenAt: NOW + SIGNATURE_ACTIVITY_STALE_MS + 1,
    });
  });

  it('filtered paste creates no anomaly missing entries or removals', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('SIG-001'), anomaly('ANO-001')]);
    const before = await readState(t);

    expect(await apply(t, [signature('SIG-001')])).toMatchObject({
      removedConfident: 0,
      missing: [],
    });
    expect(await readState(t)).toEqual(before);
  });

  it('undo restores an identical signature payload inside the 24h window', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('SIG-001'), signature('SIG-002')]);
    const before = await readSignature(t, 'SIG-002');

    expect(await apply(t, [signature('SIG-001')])).toMatchObject({ missing: ['SIG-002'] });
    expect(await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-002'],
    })).toEqual({ changed: 1 });
    const removed = await readSignature(t, 'SIG-002');
    expect(removed).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });

    vi.setSystemTime(NOW + MAP_CHAIN_UNDO_WINDOW_MS - 1);
    expect(await asEditor(t).mutation(api.mapScan.restoreSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-002'],
    })).toEqual({ changed: 1 });
    expect(await readSignature(t, 'SIG-002')).toEqual(before);

    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-002'],
    });
    const removedAgain = await readSignature(t, 'SIG-002');
    vi.setSystemTime(removedAgain!.purgeAfter!);
    await expect(asEditor(t).mutation(api.mapScan.restoreSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-002'],
    })).rejects.toThrow('UNDO_WINDOW_EXPIRED');
  });

  it('solo paste then remove-missing leaves the pasted row; full re-paste restores all', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const rows = [
      signature('SIG-001'),
      signature('SIG-002'),
      signature('WHL-001', { group: 'Wormhole' }),
    ];
    await apply(t, rows);

    expect(await apply(t, [signature('WHL-001', { group: 'Wormhole' })])).toMatchObject({
      missing: ['SIG-001', 'SIG-002'],
    });
    expect(await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-001', 'SIG-002'],
    })).toEqual({ changed: 2 });

    const afterRemove = await readState(t);
    expect(afterRemove.signatures.filter((row) => row.deletedAt == null)).toEqual([]);
    expect(afterRemove.connections.filter((row) => row.deletedAt == null)).toHaveLength(1);
    expect(afterRemove.connections.find((row) => row.deletedAt == null)).toMatchObject({
      fromSignatureId: 'WHL-001',
    });

    expect(await apply(t, rows)).toMatchObject({
      updated: 2,
      unchanged: 1,
      missing: [],
    });
    const restored = await readState(t);
    expect(restored.signatures.filter((row) => row.deletedAt == null)).toHaveLength(2);
    expect(restored.connections.filter((row) => row.deletedAt == null)).toHaveLength(1);
  });

  it('list-group re-paste revives a tombstoned wormhole connection identity', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    });

    expect(await apply(t, [signature('WHL-001')])).toMatchObject({
      updated: 1,
      missing: [],
    });
    expect((await readState(t)).connections[0]).toMatchObject({
      fromSignatureId: 'WHL-001',
      deletedAt: null,
      purgeAfter: null,
    });
    expect(await readSignature(t, 'WHL-001')).toBeNull();
  });

  it('id-first: live wormhole connection absorbs a list-group paste of the same id', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole', signalPct: 10 })]);
    expect(await apply(t, [signature('WHL-001', { signalPct: 55 })])).toMatchObject({
      updated: 1,
      missing: [],
    });
    const state = await readState(t);
    expect(state.signatures).toEqual([]);
    expect(state.connections).toHaveLength(1);
    expect(state.connections[0]).toMatchObject({
      fromSignatureId: 'WHL-001',
      fromSignalPct: 55,
      deletedAt: null,
    });
  });

  it('re-paste revives tombstoned list signatures and unresolved wormholes', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [
      signature('SIG-001'),
      signature('SIG-002'),
      signature('WHL-001', { group: 'Wormhole' }),
    ]);
    expect(await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-002', 'WHL-001'],
    })).toEqual({ changed: 2 });
    expect(await readSignature(t, 'SIG-002')).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });
    expect((await readState(t)).connections[0]).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });

    expect(await apply(t, [
      signature('SIG-001'),
      signature('SIG-002'),
      signature('WHL-001', { group: 'Wormhole' }),
    ])).toMatchObject({
      inserted: 0,
      updated: 2,
      unchanged: 1,
      missing: [],
    });
    expect(await readSignature(t, 'SIG-002')).toMatchObject({
      deletedAt: null,
      purgeAfter: null,
    });
    expect((await readState(t)).connections[0]).toMatchObject({
      deletedAt: null,
      purgeAfter: null,
      fromSignatureId: 'WHL-001',
    });
  });

  it('silently removes a missing unresolved wormhole only after its ceiling', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query('mapConnections').collect())[0]!;
      await ctx.db.patch(connection._id, {
        deathEarliestAt: NOW - 1000,
        deathLatestAt: NOW,
      });
    });

    expect(await apply(t, [signature('SIG-001')])).toMatchObject({
      removedConfident: 1,
      missing: [],
    });
    expect((await readState(t)).connections[0]).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });
    const events = await t.run(async (ctx) => await ctx.db
      .query('mapEvents')
      .withIndex('by_map', (q) => q.eq('mapId', MAP))
      .collect());
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'signatures_removed',
        actor: 'Editor Pilot',
        payload: { systemId: JITA, signatureIds: ['WHL-001'] },
      }),
    ]);
  });

  it('routes confirmed resolved removal through the collapse core and undoes the branch', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: WH_FAR });
      const connection = (await ctx.db.query('mapConnections').collect())[0]!;
      await ctx.db.patch(connection._id, { toSystemId: WH_FAR });
    });

    expect(await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    })).toEqual({ changed: 1 });
    const removed = await readState(t);
    expect(removed.connections[0]).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });
    expect(removed.activities).toEqual([]);
    const farSystem = await t.run(async (ctx) => (await ctx.db
      .query('mapSystems')
      .withIndex('by_map_system', (q) => q.eq('mapId', MAP).eq('systemId', WH_FAR))
      .unique()));
    expect(farSystem).toMatchObject({ deletedAt: NOW });
    const events = await t.run(async (ctx) => await ctx.db
      .query('mapEvents')
      .withIndex('by_map', (q) => q.eq('mapId', MAP))
      .collect());
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'branch_removed',
        actor: 'Editor Pilot',
        payload: expect.objectContaining({ systemIds: [WH_FAR] }),
      }),
    ]);

    vi.setSystemTime(NOW + MAP_CHAIN_UNDO_WINDOW_MS - 1);
    expect(await asEditor(t).mutation(api.mapScan.restoreSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    })).toEqual({ changed: 1 });
    expect((await readState(t)).connections[0]).toMatchObject({
      toSystemId: WH_FAR,
      deletedAt: null,
      purgeAfter: null,
    });
    expect(await t.run(async (ctx) => (await ctx.db
      .query('mapSystems')
      .withIndex('by_map_system', (q) => q.eq('mapId', MAP).eq('systemId', WH_FAR))
      .unique()))).toMatchObject({ deletedAt: null, purgeAfter: null });
  });

  it('silently collapses a missing resolved wormhole past its ceiling', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: WH_FAR });
      const connection = (await ctx.db.query('mapConnections').collect())[0]!;
      await ctx.db.patch(connection._id, {
        toSystemId: WH_FAR,
        deathEarliestAt: NOW - 2_000,
        deathLatestAt: NOW - 1_000,
      });
    });

    expect(await apply(t, [signature('SIG-001')])).toMatchObject({
      removedConfident: 1,
      missing: [],
    });
    expect((await readState(t)).connections[0]).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });
    const events = await t.run(async (ctx) => await ctx.db
      .query('mapEvents')
      .withIndex('by_map', (q) => q.eq('mapId', MAP))
      .collect());
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'branch_removed',
        actor: 'Editor Pilot',
        payload: expect.objectContaining({ systemIds: [WH_FAR] }),
      }),
    ]);
  });

  it('removes and restores an unresolved wormhole stub inside the undo window', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    const before = (await readState(t)).connections[0]!;

    expect(await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    })).toEqual({ changed: 1 });
    expect((await readState(t)).connections[0]).toMatchObject({
      deletedAt: NOW,
      purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });

    vi.setSystemTime(NOW + MAP_CHAIN_UNDO_WINDOW_MS - 1);
    expect(await asEditor(t).mutation(api.mapScan.restoreSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    })).toEqual({ changed: 1 });
    expect((await readState(t)).connections[0]).toEqual(before);
  });

  it('paste after a resolved collapse starts a new stub without restoring the branch', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    let corpseId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: WH_FAR });
      const connection = (await ctx.db.query('mapConnections').collect())[0]!;
      corpseId = connection._id;
      await ctx.db.patch(connection._id, { toSystemId: WH_FAR });
    });
    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    });

    expect(await apply(t, [signature('WHL-001', { group: 'Wormhole' })])).toMatchObject({
      inserted: 1,
      unchanged: 0,
      missing: [],
    });
    expect(await t.run(async (ctx) => await ctx.db.get(corpseId))).toMatchObject({
      deletedAt: NOW,
      toSystemId: WH_FAR,
      fromSignatureId: 'WHL-001',
    });
    const live = await t.run(async (ctx) => (await ctx.db.query('mapConnections').collect())
      .filter((row) => row.deletedAt == null));
    expect(live).toEqual([expect.objectContaining({
      fromSignatureId: 'WHL-001',
      fromSystemId: JITA,
      toSystemId: null,
    })]);
    expect(await t.run(async (ctx) => (await ctx.db
      .query('mapSystems')
      .withIndex('by_map_system', (q) => q.eq('mapId', MAP).eq('systemId', WH_FAR))
      .unique()))).toMatchObject({ deletedAt: NOW });
  });

  it('a passed ceiling closes a stub lifetime — re-paste stays inert until purge', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query('mapConnections').collect())[0]!;
      await ctx.db.patch(connection._id, {
        deathEarliestAt: NOW - 2_000,
        deathLatestAt: NOW - 1_000,
      });
    });
    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    });

    expect(await apply(t, [signature('WHL-001', { group: 'Wormhole' })])).toMatchObject({
      unchanged: 1,
    });
    expect((await readState(t)).connections[0]).toMatchObject({ deletedAt: NOW });
  });

  it('a conflicting non-wormhole group never revives a stub tombstone', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    });

    expect(await apply(t, [signature('WHL-001', { group: 'Data Site' })])).toMatchObject({
      unchanged: 1,
    });
    expect((await readState(t)).connections[0]).toMatchObject({ deletedAt: NOW });
  });

  it('reports a refused contradiction as conflicted, keeping stored knowledge', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('SIG-001', { group: 'Data Site', name: 'Sanctum Sprawl' })]);

    expect(await apply(t, [signature('SIG-001', { group: 'Relic Site' })])).toMatchObject({
      conflicted: 1,
      unchanged: 0,
      missing: [],
    });
    expect(await readSignature(t, 'SIG-001')).toMatchObject({ group: 'Data Site' });
  });

  it('removal and restore stay available beyond the whole-system scan bound', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 257; i += 1) {
        await ctx.db.insert('mapSignatures', {
          mapId: MAP,
          systemId: JITA,
          signatureId: `AAA-${String(i).padStart(3, '0')}`,
          group: null,
          typeName: null,
          wormholeTypeCode: null,
          deletedAt: null,
          purgeAfter: null,
        });
      }
    });

    await expect(apply(t, [signature('SIG-001')])).rejects.toThrow('MAP_SIGNATURE_SCAN_LIMIT');
    expect(await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['AAA-000'],
    })).toEqual({ changed: 1 });
    expect(await asEditor(t).mutation(api.mapScan.restoreSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['AAA-000'],
    })).toEqual({ changed: 1 });
    expect(await readSignature(t, 'AAA-000')).toMatchObject({ deletedAt: null });
  });

  it('confirmed list removals ledger one restorable event and their undo another', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('SIG-001'), signature('WHL-001', { group: 'Wormhole' })]);

    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-001', 'WHL-001'],
    });
    await asEditor(t).mutation(api.mapScan.restoreSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-001', 'WHL-001'],
    });
    const events = await t.run(async (ctx) => await ctx.db
      .query('mapEvents')
      .withIndex('by_map', (q) => q.eq('mapId', MAP))
      .collect());
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'signatures_removed',
        actor: 'Editor Pilot',
        payload: { systemId: JITA, signatureIds: ['SIG-001', 'WHL-001'] },
      }),
      expect.objectContaining({
        kind: 'signatures_restored',
        actor: 'Editor Pilot',
        payload: { systemId: JITA, signatureIds: ['SIG-001', 'WHL-001'] },
      }),
    ]);
  });

  it('an independent stub removed beside a branch collapse never rides its undo', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [
      signature('WHL-001', { group: 'Wormhole' }),
      signature('WHL-002', { group: 'Wormhole' }),
    ]);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: WH_FAR });
      const resolved = (await ctx.db.query('mapConnections').collect())
        .find((row) => row.fromSignatureId === 'WHL-002')!;
      await ctx.db.patch(resolved._id, { toSystemId: WH_FAR });
    });

    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-002', 'WHL-001'],
    });
    const removed = await readState(t);
    const stubStamp = removed.connections.find((row) => row.fromSignatureId === 'WHL-001')!;
    const branchStamp = removed.connections.find((row) => row.fromSignatureId === 'WHL-002')!;
    expect(stubStamp.deletedAt).not.toBeNull();
    expect(branchStamp.deletedAt).not.toBeNull();
    expect(stubStamp.deletedAt).not.toBe(branchStamp.deletedAt);

    await asEditor(t).mutation(api.mapScan.restoreSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-002'],
    });
    const restored = await readState(t);
    expect(restored.connections.find((row) => row.fromSignatureId === 'WHL-002'))
      .toMatchObject({ deletedAt: null });
    expect(restored.connections.find((row) => row.fromSignatureId === 'WHL-001'))
      .toMatchObject({ deletedAt: stubStamp.deletedAt });
  });

  it('pages active signatures behind live map access', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('SIG-001'), anomaly('ANO-001')]);
    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['ANO-001'],
    });

    const page = await t.withIdentity({ subject: VIEWER }).query(api.mapScan.watchMapSignatures, {
      mapId: MAP,
      paginationOpts: { cursor: null, numItems: 1000 },
    });
    expect(page.page.map((row) => row.signatureId)).toEqual(['SIG-001']);
    const denied = await t.withIdentity({ subject: 'stranger' }).query(
      api.mapScan.watchMapSignatures,
      { mapId: MAP, paginationOpts: { cursor: null, numItems: 10 } },
    );
    expect(denied).toEqual({ page: [], isDone: true, continueCursor: '' });
  });

  it('purges expired tombstones through the production internal mutation and cron registry', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('SIG-001')]);
    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['SIG-001'],
    });

    vi.setSystemTime(NOW + MAP_CHAIN_UNDO_WINDOW_MS - 1);
    expect(await t.mutation(internal.mapScan.purgeExpiredSignatureTombstones, {})).toEqual({
      deletedCount: 0,
      hasMore: false,
    });
    vi.setSystemTime(NOW + MAP_CHAIN_UNDO_WINDOW_MS);
    expect(await t.mutation(internal.mapScan.purgeExpiredSignatureTombstones, {})).toEqual({
      deletedCount: 1,
      hasMore: false,
    });
    expect(await readSignature(t, 'SIG-001')).toBeNull();

    const cronSource = readFileSync('convex/crons.ts', 'utf8');
    expect(cronSource).toContain("'map signature purge'");
    expect(cronSource).toContain('internal.mapScan.purgeExpiredSignatureTombstones');
  });
});
