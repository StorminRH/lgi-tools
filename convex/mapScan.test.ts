// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_CHAIN_UNDO_WINDOW_MS, tombstoneDeletedAt } from '@/data/maps/chain-contract';
import { doorLeadsTo } from '@/data/maps/connection-door-destinations';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applyLinkDeduction } from './lib/mapScanElimination';
import { SIGNATURE_ACTIVITY_STALE_MS } from './lib/mapSignatures';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import { connectionInsert } from './__tests__/connection-doc.setup';

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
      from: expect.objectContaining({ signatureId: 'WHL-001', signalPct: 42.5 }),
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
      from: expect.objectContaining({ signatureId: 'WHL-001', signalPct: 100 }),
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
        from: expect.objectContaining({ signatureId: 'WHL-001', typeCode: 'C247' }),
        firstSeenAt: before?._creationTime,
        toSystemId: null,
        identity: { kind: 'typed' as const, provenance: 'human' },
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

  it('keeps assumed destination provenance when scan stamps a pending type', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-002', { group: 'Wormhole' })]);
    const connectionId = await t.run(async (ctx) => {
      const row = (await ctx.db.query('mapConnections').collect())[0];
      if (row === undefined) {
        throw new Error('expected the pasted wormhole stub before identify');
      }
      await ctx.db.patch(row._id, {
        resolution: {
          kind: 'pending',
          provenance: 'assumed',
          candidateIds: [row._id, row._id],
          characterId: CHARACTER,
        },
      });
      return row._id;
    });
    expect(
      await asEditor(t).mutation(api.mapScan.identifySignature, {
        mapId: MAP,
        systemId: JITA,
        signatureId: 'WHL-002',
        group: 'Wormhole',
        wormholeTypeCode: 'C247',
      }),
    ).toEqual({ changed: false, connectionId });
    expect(await t.run(async (ctx) => await ctx.db.get(connectionId))).toMatchObject({
      from: expect.objectContaining({ signatureId: 'WHL-002', typeCode: 'C247' }),
      resolution: { kind: 'destination', provenance: 'assumed' },
    });
  });

  it('clears pending on same-code re-identify after a human type stamp', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-003')]);
    const identified = await asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'WHL-003',
      group: 'Wormhole',
      wormholeTypeCode: 'C247',
    });
    expect(identified.connectionId).not.toBeNull();
    const connectionId = identified.connectionId;
    if (connectionId === null) {
      throw new Error('expected identify to migrate WHL-003 onto a hallway');
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, {
        resolution: {
          kind: 'pending',
          provenance: 'assumed',
          candidateIds: [connectionId, connectionId],
          characterId: CHARACTER,
        },
      });
    });
    expect(
      await asEditor(t).mutation(api.mapScan.identifySignature, {
        mapId: MAP,
        systemId: JITA,
        signatureId: 'WHL-003',
        group: 'Wormhole',
        wormholeTypeCode: 'C247',
      }),
    ).toEqual({ changed: false, connectionId });
    const after = await t.run(async (ctx) => await ctx.db.get(connectionId));
    expect(after?.resolution).toEqual({ kind: 'destination', provenance: 'assumed' });
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
      (row) => row.from.signatureId === 'AAA-111',
    );
    if (assumed === undefined) throw new Error('missing assumed deduction row');
    expect(assumed).toMatchObject({
      from: expect.objectContaining({ typeCode: 'B274' }),
      identity: { kind: 'typed' as const, provenance: 'assumed' },
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

    await asEditor(t).mutation(api.mapAuthoringFields.setConnectionWormholeType, {
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
      (row) => row.from.signatureId === 'AAA-111',
    )).toMatchObject({ from: expect.objectContaining({ typeCode: 'H296' }), identity: { kind: 'typed' as const, provenance: 'human' } });

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
      linkedTarget = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        deletedAt: null,
        purgeAfter: null,
      }));
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
      expect.objectContaining({ _id: linkedTarget, to: expect.objectContaining({ signatureId: 'KSI-162' }) }),
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
        from: { ...stub.from, typeCode: 'B274' },
        to: { ...stub.to, typeCode: 'K162' },
        identity: { kind: 'typed', provenance: 'human' },
      });
      staleTarget = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        deletedAt: null,
        purgeAfter: null,
      }));
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
      from: expect.objectContaining({ typeCode: 'B274' }),
      identity: { kind: 'typed' as const, provenance: 'human' },
    });
    expect(
      (await stale.run(async (ctx) => await ctx.db.get(staleTarget)))?.to.signatureId,
    ).toBeNull();

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
        lifetime: {
          kind: 'window',
          earliestAt: 1_000,
          latestAt: 2_000,
          lifeStage: 'under_1_day',
          observedAt: 1_500,
        },
      });
      carriedTarget = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        deletedAt: null,
        purgeAfter: null,
      }));
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
      to: expect.objectContaining({ signatureId: 'KSI-162' }),
      massState: 'stable',
      observedMassAtStateKg: 1_000_000_000,
      shipSize: 'M',
      lifetime: expect.objectContaining({
        kind: 'window',
        lifeStage: 'under_1_day',
        observedAt: 1_500,
        earliestAt: 1_000,
        latestAt: 2_000,
      }),
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
      inboundId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        deletedAt: null,
        purgeAfter: null,
      }));
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
      to: expect.objectContaining({ signatureId: 'ABC-123' }),
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
      to: expect.objectContaining({ signatureId: 'ABC-123' }),
    });
    expect(await t.run(async (ctx) =>
      (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.from.signatureId === 'DEF-456' && row.toSystemId === null,
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
      inboundId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: 'stable',
        shipSize: 'M',
        deletedAt: null,
        purgeAfter: null,
      }));
    });
    await asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: firstStubId,
      resolvedConnectionId: inboundId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(inboundId, {
        to: {
          ...(await ctx.db.get(inboundId))!.to,
          leadsTo: { kind: 'system', systemId: DODIXIE },
        },
      });
    });
    await apply(t, [
      signature('ABC-123', { group: 'Wormhole', name: 'K162' }),
      signature('DEF-456', { group: 'Wormhole' }),
    ]);
    const secondStubId = await t.run(async (ctx) => {
      const stub = (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.from.signatureId === 'DEF-456' && row.toSystemId === null,
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
      to: expect.objectContaining({ signatureId: 'DEF-456' }),
      toSystemId: JITA,
      fromSystemId: AMARR,
      massState: 'stable',
      shipSize: 'M',
    });
    expect(rehomed?.to.leadsTo.kind).toBe('unset');
    expect(await t.run(async (ctx) => await ctx.db.get(secondStubId))).toBeNull();
    const restored = await t.run(async (ctx) =>
      (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.from.signatureId === 'ABC-123' && row.toSystemId === null,
      ),
    );
    expect(restored).toMatchObject({
      fromSystemId: JITA,
      from: expect.objectContaining({
        typeCode: 'K162',
        leadsTo: { kind: 'system', systemId: DODIXIE },
      }),
      massState: null,
      shipSize: null,
    });
    expect(restored?._id).not.toBe(firstStubId);
    expect(restored?.observationKey).toBeUndefined();
  });

  it('clears the vacated door type and keeps the new stub leads-to', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    let stubId = '' as Id<'mapConnections'>;
    let inboundId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', { mapId: MAP, systemId: AMARR });
      inboundId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: AMARR,
        fromSignatureId: 'ABC-123',
        fromWormholeTypeCode: 'B274',
        toWormholeTypeCode: 'K162',
        typeProvenance: 'human',
        massState: 'stable',
        shipSize: 'M',
        deletedAt: null,
        purgeAfter: null,
      }));
      stubId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: null,
        fromSignatureId: 'DEF-456',
        wormholeTypeCode: 'C247',
        typedSide: 'from',
        typeProvenance: 'assumed',
        fromDestinationSystemId: DODIXIE,
        deletedAt: null,
        purgeAfter: null,
      }));
    });
    await expect(asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: stubId,
      resolvedConnectionId: inboundId,
    })).resolves.toEqual({ outcome: 'applied' });
    expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
      from: expect.objectContaining({
        signatureId: 'DEF-456',
        typeCode: 'C247',
        leadsTo: { kind: 'system', systemId: DODIXIE },
      }),
      to: expect.objectContaining({ typeCode: 'K162' }),
      massState: 'stable',
      shipSize: 'M',
    });
    expect(await t.run(async (ctx) => await ctx.db.get(stubId))).toBeNull();
    expect(await t.run(async (ctx) =>
      (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.from.signatureId === 'ABC-123' && row.toSystemId === null,
      ),
    )).toMatchObject({
      fromSystemId: JITA,
      from: expect.objectContaining({ typeCode: 'B274' }),
    });
  });

  it('applyLinkDeduction survivor carries seatOrderAt from the earlier row', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', {
        mapId: MAP,
        systemId: AMARR,
        deletedAt: null,
        purgeAfter: null,
      });
      const sourceId = await ctx.db.insert('mapConnections', {
        ...connectionInsert({
          mapId: MAP,
          fromSystemId: JITA,
          toSystemId: null,
          fromSignatureId: 'ABC-123',
          wormholeTypeCode: 'B274',
          typedSide: 'from',
          typeProvenance: 'assumed',
        }),
        seatOrderAt: 1_000,
      });
      const targetId = await ctx.db.insert('mapConnections', {
        ...connectionInsert({
          mapId: MAP,
          fromSystemId: JITA,
          toSystemId: AMARR,
          wormholeTypeCode: 'B274',
          typedSide: 'from',
          typeProvenance: 'human',
        }),
        seatOrderAt: 9_000,
      });
      return { sourceId, targetId };
    });
    await t.run(async (ctx) => {
      const source = await ctx.db.get(ids.sourceId);
      const target = await ctx.db.get(ids.targetId);
      const outcome = await applyLinkDeduction(
        ctx,
        source ?? undefined,
        target ?? undefined,
        JITA,
        'ABC-123',
        'B274',
      );
      expect(outcome.outcome).toBe('applied');
    });
    expect(await t.run(async (ctx) => await ctx.db.get(ids.targetId))).toMatchObject({
      seatOrderAt: 1_000,
      from: expect.objectContaining({ signatureId: 'ABC-123' }),
    });
    expect(await t.run(async (ctx) => await ctx.db.get(ids.sourceId))).toBeNull();
  });

  it('does not absorb a claimed static as a leftover counterpart stub', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', {
        mapId: MAP,
        systemId: WH_FAR,
        deletedAt: null,
        purgeAfter: null,
      });
      const sourceId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: null,
        fromSignatureId: 'ABC-123',
        wormholeTypeCode: null,
      }));
      const targetId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: WH_FAR,
      }));
      return { sourceId, targetId };
    });
    await t.mutation(internal.mapStatics.applyStaticPlaceholders, {
      mapId: MAP,
      systemId: WH_FAR,
      codes: ['C247'],
    });
    const claimedId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('mapConnections')
        .withIndex('by_map_from', (q) => q.eq('mapId', MAP).eq('fromSystemId', WH_FAR))
        .collect();
      const placeholder = rows.find((row) => row.staticCode === 'C247');
      if (placeholder === undefined) throw new Error('missing C247 placeholder');
      await ctx.db.patch(placeholder._id, {
        from: { ...placeholder.from, signatureId: 'STA-247' },
      });
      return placeholder._id;
    });
    await t.run(async (ctx) => {
      const source = await ctx.db.get(ids.sourceId);
      const target = await ctx.db.get(ids.targetId);
      expect((await applyLinkDeduction(
        ctx,
        source ?? undefined,
        target ?? undefined,
        JITA,
        'ABC-123',
        null,
      )).outcome).toBe('applied');
    });
    expect(await t.run(async (ctx) => await ctx.db.get(claimedId))).toMatchObject({
      staticCode: 'C247',
      from: expect.objectContaining({ signatureId: 'STA-247' }),
      toSystemId: null,
    });
    const target = await t.run(async (ctx) => await ctx.db.get(ids.targetId));
    expect(target?.staticCode).toBeUndefined();
    expect(target?.from.signatureId).toBe('ABC-123');
  });

  it('does not absorb a static placeholder as a leftover counterpart stub', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const ids = await t.run(async (ctx) => {
      await ctx.db.insert('mapSystems', {
        mapId: MAP,
        systemId: WH_FAR,
        deletedAt: null,
        purgeAfter: null,
      });
      const sourceId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: null,
        fromSignatureId: 'ABC-123',
        wormholeTypeCode: null,
      }));
      const targetId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: JITA,
        toSystemId: WH_FAR,
      }));
      return { sourceId, targetId };
    });
    await t.mutation(internal.mapStatics.applyStaticPlaceholders, {
      mapId: MAP,
      systemId: WH_FAR,
      codes: ['C247'],
    });
    const placeholderId = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query('mapConnections')
        .withIndex('by_map_from', (q) => q.eq('mapId', MAP).eq('fromSystemId', WH_FAR))
        .collect();
      const placeholder = rows.find((row) => row.staticCode === 'C247');
      if (placeholder === undefined) throw new Error('missing C247 placeholder');
      return placeholder._id;
    });
    await t.run(async (ctx) => {
      const source = await ctx.db.get(ids.sourceId);
      const target = await ctx.db.get(ids.targetId);
      const outcome = await applyLinkDeduction(
        ctx,
        source ?? undefined,
        target ?? undefined,
        JITA,
        'ABC-123',
        null,
      );
      expect(outcome.outcome).toBe('applied');
    });
    expect(await t.run(async (ctx) => await ctx.db.get(placeholderId))).toMatchObject({
      staticCode: 'C247',
      from: expect.objectContaining({ signatureId: null }),
      toSystemId: null,
    });
    const target = await t.run(async (ctx) => await ctx.db.get(ids.targetId));
    expect(target?.staticCode).toBeUndefined();
    expect(target?.from.signatureId).toBe('ABC-123');
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
      inboundId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: 'stable',
        shipSize: 'M',
        deletedAt: null,
        purgeAfter: null,
      }));
    });
    await asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
      mapId: MAP,
      stubConnectionId: firstStubId,
      resolvedConnectionId: inboundId,
    });
    let leftoverId = '' as Id<'mapConnections'>;
    await t.run(async (ctx) => {
      await ctx.db.patch(inboundId, { firstSeenAt: 1_000 });
      leftoverId = await ctx.db.insert('mapConnections', connectionInsert({
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
        firstSeenAt: 9_000,
        deletedAt: null,
        purgeAfter: null,
      }));
    });
    await apply(t, [
      signature('ABC-123', { group: 'Wormhole', name: 'K162' }),
      signature('DEF-456', { group: 'Wormhole' }),
    ]);
    const secondStubId = await t.run(async (ctx) => {
      const stub = (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.from.signatureId === 'DEF-456' && row.toSystemId === null,
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
      from: expect.objectContaining({ signatureId: 'STA-001', typeCode: 'B274' }),
      to: expect.objectContaining({ signatureId: 'DEF-456', typeCode: 'K162' }),
      firstSeenAt: 1_000,
      massState: 'stable',
      shipSize: 'M',
    });
    expect(await t.run(async (ctx) => await ctx.db.get(leftoverId))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(secondStubId))).toBeNull();
    expect(await t.run(async (ctx) =>
      (await ctx.db.query('mapConnections').collect()).find(
        (row) => row.from.signatureId === 'ABC-123' && row.toSystemId === null,
      ),
    )).toMatchObject({ fromSystemId: JITA, from: expect.objectContaining({ typeCode: 'K162' }) });
  });

  it('re-paste keeps a linked way-home, then absorbs a leftover stub onto that inbound', async () => {
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
      inboundId = await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP,
        fromSystemId: AMARR,
        toSystemId: JITA,
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        massState: null,
        shipSize: null,
        deletedAt: null,
        purgeAfter: null,
      }));
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
      to: expect.objectContaining({ signatureId: 'WDE-796' }),
      toSystemId: JITA,
    });
    expect(await t.run(async (ctx) => (await ctx.db.query('mapConnections').collect())
      .filter((row) => row.toSystemId === null))).toEqual([]);

    const leftoverId = await t.run(async (ctx) =>
      await ctx.db.insert('mapConnections', connectionInsert({
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
        deletedAt: null,
        purgeAfter: null,
      })),
    );

    expect(await apply(t, [signature('WDE-796', { group: 'Wormhole' })])).toMatchObject({
      updated: 1,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(leftoverId))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
      to: expect.objectContaining({ signatureId: 'WDE-796', typeCode: 'K162' }),
      massState: 'stable',
      shipSize: 'M',
    });
  });

  it('absorbs leftover origin stubs without downgrading human types or spawning Leads-to systems', async () => {
    async function leftoverLink(input: {
      leftover: {
        typeProvenance: 'human' | 'assumed';
        fromDestinationHint?: 'unknown';
        fromDestinationSystemId?: number;
      };
      inbound: {
        wormholeTypeCode: string | null;
        typeProvenance?: 'human';
        fromWormholeTypeCode?: string | null;
        toWormholeTypeCode?: string | null;
        typedSide?: 'from';
      };
    }) {
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
        await ctx.db.patch(leftover._id, connectionInsert({
          mapId: leftover.mapId,
          fromSystemId: leftover.fromSystemId,
          toSystemId: leftover.toSystemId,
          fromSignatureId: leftover.from.signatureId,
          wormholeTypeCode: 'C247',
          typedSide: 'from',
          fromWormholeTypeCode: 'C247',
          toWormholeTypeCode: 'K162',
          ...input.leftover,
        }));
        inboundId = await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP,
          fromSystemId: JITA,
          toSystemId: AMARR,
          massState: null,
          shipSize: null,
          deletedAt: null,
          purgeAfter: null,
          fromWormholeTypeCode: null,
          toWormholeTypeCode: null,
          ...input.inbound,
        }));
        stubId = await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP,
          fromSystemId: AMARR,
          toSystemId: null,
          fromSignatureId: 'RET-001',
          wormholeTypeCode: null,
          fromWormholeTypeCode: null,
          toWormholeTypeCode: null,
          massState: null,
          shipSize: null,
          deletedAt: null,
          purgeAfter: null,
        }));
      });
      await expect(asEditor(t).mutation(api.mapScan.linkStubToResolvedConnection, {
        mapId: MAP,
        stubConnectionId: stubId,
        resolvedConnectionId: inboundId,
      })).resolves.toEqual({ outcome: 'applied' });
      return {
        leftoverId,
        stubId,
        inboundId,
        t,
        joined: await t.run(async (ctx) => await ctx.db.get(inboundId)),
      };
    }

    const folded = await leftoverLink({
      leftover: { typeProvenance: 'human', fromDestinationHint: 'unknown' },
      inbound: { wormholeTypeCode: null },
    });
    expect(folded.joined).toMatchObject({
      from: expect.objectContaining({ signatureId: 'STA-001', typeCode: 'C247' }),
      to: expect.objectContaining({ signatureId: 'RET-001', typeCode: 'K162' }),
      identity: { kind: 'typed' as const, provenance: 'human' },
    });
    expect(folded.joined?.from.leadsTo.kind).not.toBe('system');
    expect(doorLeadsTo(
      folded.joined!.fromSystemId,
      folded.joined!.toSystemId,
      'from',
      folded.joined!.from,
    )).toBe(AMARR);
    expect(doorLeadsTo(
      folded.joined!.fromSystemId,
      folded.joined!.toSystemId,
      'to',
      folded.joined!.to,
    )).toBe(JITA);
    expect(await folded.t.run(async (ctx) => await ctx.db.get(folded.leftoverId))).toBeNull();
    expect(await folded.t.run(async (ctx) => await ctx.db.get(folded.stubId))).toBeNull();

    const keptHuman = await leftoverLink({
      leftover: { typeProvenance: 'assumed' },
      inbound: {
        wormholeTypeCode: 'B274',
        typedSide: 'from',
        typeProvenance: 'human',
        fromWormholeTypeCode: 'B274',
        toWormholeTypeCode: 'K162',
      },
    });
    expect(keptHuman.joined).toMatchObject({
      identity: { kind: 'typed' as const, provenance: 'human' },
      from: expect.objectContaining({ typeCode: 'B274' }),
    });
    expect(await keptHuman.t.run(async (ctx) => await ctx.db.get(keptHuman.leftoverId)))
      .toBeNull();

    const leadsTo = await leftoverLink({
      leftover: { typeProvenance: 'human', fromDestinationSystemId: DODIXIE },
      inbound: { wormholeTypeCode: null },
    });
    expect(leadsTo.joined).toMatchObject({
      fromSystemId: JITA,
      toSystemId: AMARR,
      from: expect.objectContaining({
        signatureId: 'STA-001',
        leadsTo: { kind: 'system', systemId: DODIXIE },
      }),
      to: expect.objectContaining({ signatureId: 'RET-001' }),
    });
    expect(doorLeadsTo(
      leadsTo.joined!.fromSystemId,
      leadsTo.joined!.toSystemId,
      'from',
      leadsTo.joined!.from,
    )).toBe(DODIXIE);
    expect(doorLeadsTo(
      leadsTo.joined!.fromSystemId,
      leadsTo.joined!.toSystemId,
      'to',
      leadsTo.joined!.to,
    )).toBe(JITA);
    expect(await leadsTo.t.run(async (ctx) =>
      await ctx.db.query('mapSystems')
        .withIndex('by_map_system', (q) => q.eq('mapId', MAP).eq('systemId', DODIXIE))
        .unique(),
    )).toBeNull();
    expect(await leadsTo.t.run(async (ctx) => await ctx.db.get(leadsTo.leftoverId))).toBeNull();
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
            from: { ...stub.from, typeCode: stubType },
            to: { ...stub.to, typeCode: stubType === 'K162' ? stub.to.typeCode : 'K162' },
            identity: { kind: 'typed', provenance: 'human' },
          });
        }
        inboundId = await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP,
          fromSystemId: AMARR,
          toSystemId: JITA,
          wormholeTypeCode: inboundType.wormholeTypeCode,
          typedSide: inboundType.typedSide,
          typeProvenance: inboundType.wormholeTypeCode === null ? undefined : 'human',
          massState: null,
          shipSize: null,
          deletedAt: null,
          purgeAfter: null,
        }));
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
        from: expect.objectContaining({ typeCode: 'K162' }),
        to: expect.objectContaining({ signatureId: 'RET-001', typeCode: 'C247' }),
      },
    });
    expect(await linkTypedStub(null, {
      wormholeTypeCode: 'K162',
      typedSide: 'from',
    })).toMatchObject({
      inbound: {
        from: expect.objectContaining({ typeCode: 'K162' }),
        to: expect.objectContaining({ signatureId: 'RET-001' }),
      },
    });
    expect(await linkTypedStub(null, {
      wormholeTypeCode: 'C247',
      typedSide: 'from',
    })).toMatchObject({
      inbound: {
        from: expect.objectContaining({ typeCode: 'C247' }),
        to: expect.objectContaining({ signatureId: 'RET-001', typeCode: 'K162' }),
      },
    });
    expect(await linkTypedStub('C247', {
      wormholeTypeCode: 'B274',
      typedSide: 'from',
    })).toMatchObject({
      inbound: {
        from: expect.objectContaining({ typeCode: 'B274' }),
        to: expect.objectContaining({ signatureId: 'RET-001' }),
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
        await ctx.db.patch(stub._id, {
          lifetime: stubLife.lifeStage == null
            ? {
                kind: 'window' as const,
                earliestAt: stubLife.lifeStageObservedAt,
                latestAt: stubLife.lifeStageObservedAt,
                lifeStage: null,
                observedAt: stubLife.lifeStageObservedAt,
              }
            : {
                kind: 'stage' as const,
                lifeStage: stubLife.lifeStage,
                observedAt: stubLife.lifeStageObservedAt,
              },
        });
        targetId = await ctx.db.insert('mapConnections', connectionInsert({
          mapId: MAP,
          fromSystemId: AMARR,
          toSystemId: JITA,
          wormholeTypeCode: 'B274',
          typedSide: 'from',
          typeProvenance: 'human',
          massState: null,
          shipSize: null,
          deletedAt: null,
          purgeAfter: null,
          ...('lifeStage' in targetLife
            ? {
                lifeStage: targetLife.lifeStage,
                lifeStageObservedAt: targetLife.lifeStageObservedAt,
                ...(targetLife.lifeStage == null
                  ? {
                      deathEarliestAt: targetLife.lifeStageObservedAt,
                      deathLatestAt: targetLife.lifeStageObservedAt,
                    }
                  : {}),
              }
            : {}),
        }));
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
      to: expect.objectContaining({ signatureId: 'KSI-163' }),
      lifetime: expect.objectContaining({ lifeStage: 'expired', observedAt: 9_000 }),
    });

    const keepsUnset = await linkStub(
      'KSI-164',
      { lifeStage: 'under_1_day', lifeStageObservedAt: 1_500 },
      { lifeStage: null, lifeStageObservedAt: 9_000 },
    );
    expect(
      await keepsUnset.t.run(async (ctx) => await ctx.db.get(keepsUnset.targetId)),
    ).toMatchObject({
      to: expect.objectContaining({ signatureId: 'KSI-164' }),
      lifetime: expect.objectContaining({ lifeStage: null, observedAt: 9_000 }),
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
      to: expect.objectContaining({ signatureId: 'KSI-165' }),
      lifetime: expect.objectContaining({ lifeStage: null, observedAt: 1_500 }),
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
    expect(connections[0]).toMatchObject({ toSystemId: AMARR, from: expect.objectContaining({ signalPct: 75 }) });
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
    const chainFiles = [
      'convex/mapChainAccess.ts',
      'convex/mapChainConnections.ts',
      'convex/mapChainEvents.ts',
      'convex/mapChainPage.ts',
      'convex/mapChainSystems.ts',
    ];
    const scanCode = readFileSync('convex/mapScan.ts', 'utf8');

    for (const path of chainFiles) {
      const chainCode = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(chainCode, path).not.toContain("'mapSignatures'");
      expect(chainCode, path).not.toContain("'mapSignatureActivity'");
    }
    expect(scanCode).not.toContain("from './mapChain");
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
      deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
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
    expect(afterRemove.signatures.filter((row) => tombstoneDeletedAt(row) == null)).toEqual([]);
    expect(afterRemove.connections.filter((row) => tombstoneDeletedAt(row) == null)).toHaveLength(1);
    expect(afterRemove.connections.find((row) => tombstoneDeletedAt(row) == null)).toMatchObject({
      from: expect.objectContaining({ signatureId: 'WHL-001' }),
    });

    expect(await apply(t, rows)).toMatchObject({
      updated: 2,
      unchanged: 1,
      missing: [],
    });
    const restored = await readState(t);
    expect(restored.signatures.filter((row) => tombstoneDeletedAt(row) == null)).toHaveLength(2);
    expect(restored.connections.filter((row) => tombstoneDeletedAt(row) == null)).toHaveLength(1);
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
      from: expect.objectContaining({ signatureId: 'WHL-001' }),
      tombstone: { kind: 'live' as const },
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
      from: expect.objectContaining({ signatureId: 'WHL-001', signalPct: 55 }),
      tombstone: { kind: 'live' as const },
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
      deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
    });
    expect((await readState(t)).connections[0]).toMatchObject({
      tombstone: { kind: 'removed' as const, deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
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
      tombstone: { kind: 'live' as const },
      from: expect.objectContaining({ signatureId: 'WHL-001' }),
    });
  });

  it('silently removes a missing unresolved wormhole only after its ceiling', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query('mapConnections').collect())[0]!;
      await ctx.db.patch(connection._id, {
        lifetime: {
          kind: 'window',
          earliestAt: NOW - 1000,
          latestAt: NOW,
          lifeStage: null,
          observedAt: null,
        },
      });
    });

    expect(await apply(t, [signature('SIG-001')])).toMatchObject({
      removedConfident: 1,
      missing: [],
    });
    expect((await readState(t)).connections[0]).toMatchObject({
      tombstone: { kind: 'removed' as const, deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
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
      tombstone: { kind: 'removed' as const, deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
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
      tombstone: { kind: 'live' as const },
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
        lifetime: {
          kind: 'window',
          earliestAt: NOW - 2_000,
          latestAt: NOW - 1_000,
          lifeStage: null,
          observedAt: null,
        },
      });
    });

    expect(await apply(t, [signature('SIG-001')])).toMatchObject({
      removedConfident: 1,
      missing: [],
    });
    expect((await readState(t)).connections[0]).toMatchObject({
      tombstone: { kind: 'removed' as const, deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
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
      tombstone: { kind: 'removed' as const, deletedAt: NOW, purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS },
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
      tombstone: { kind: 'removed' as const, deletedAt: NOW },
      toSystemId: WH_FAR,
      from: expect.objectContaining({ signatureId: 'WHL-001' }),
    });
    const live = await t.run(async (ctx) => (await ctx.db.query('mapConnections').collect())
      .filter((row) => tombstoneDeletedAt(row) == null));
    expect(live).toEqual([expect.objectContaining({
      from: expect.objectContaining({ signatureId: 'WHL-001' }),
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
        lifetime: {
          kind: 'window',
          earliestAt: NOW - 2_000,
          latestAt: NOW - 1_000,
          lifeStage: null,
          observedAt: null,
        },
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
    expect((await readState(t)).connections[0]).toMatchObject({
      tombstone: { kind: 'removed' as const, deletedAt: NOW },
    });
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
    expect((await readState(t)).connections[0]).toMatchObject({
      tombstone: { kind: 'removed' as const, deletedAt: NOW },
    });
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
        .find((row) => row.from.signatureId === 'WHL-002')!;
      await ctx.db.patch(resolved._id, { toSystemId: WH_FAR });
    });

    await asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-002', 'WHL-001'],
    });
    const removed = await readState(t);
    const stubStamp = removed.connections.find((row) => row.from.signatureId === 'WHL-001')!;
    const branchStamp = removed.connections.find((row) => row.from.signatureId === 'WHL-002')!;
    expect(tombstoneDeletedAt(stubStamp)).not.toBeNull();
    expect(tombstoneDeletedAt(branchStamp)).not.toBeNull();
    expect(tombstoneDeletedAt(stubStamp)).not.toBe(tombstoneDeletedAt(branchStamp));

    await asEditor(t).mutation(api.mapScan.restoreSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-002'],
    });
    const restored = await readState(t);
    expect(tombstoneDeletedAt(
      restored.connections.find((row) => row.from.signatureId === 'WHL-002')!,
    )).toBeNull();
    expect(tombstoneDeletedAt(
      restored.connections.find((row) => row.from.signatureId === 'WHL-001')!,
    )).toBe(tombstoneDeletedAt(stubStamp));
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
