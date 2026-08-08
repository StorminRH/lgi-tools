// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { api, internal } from './_generated/api';
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
      }),
    ]);
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
  });

  it('reserves resolved wormhole removal for the OW6 shared collapse core', async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await apply(t, [signature('WHL-001', { group: 'Wormhole' })]);
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query('mapConnections').collect())[0]!;
      await ctx.db.patch(connection._id, { toSystemId: AMARR });
    });

    await expect(asEditor(t).mutation(api.mapScan.removeSignatures, {
      mapId: MAP,
      systemId: JITA,
      signatureIds: ['WHL-001'],
    })).rejects.toThrow('RESOLVED_CONNECTION_REQUIRES_COLLAPSE');
    expect((await readState(t)).connections[0]?.deletedAt).toBeNull();
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
