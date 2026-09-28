// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { expect, test, vi } from 'vitest';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import type { ScannedRow } from '@/data/maps/scan-parse';
import { api, internal } from './_generated/api';
import { connectionInsert } from './__tests__/connection-doc.setup';
import { modules } from './__tests__/modules.setup';
import schema from './schema';

const MAP = 'map-identify';
const EDITOR = 'user-editor';
const CHARACTER = 1001;
const NOW = 1_800_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;

type ScanDb = TestConvex<typeof schema>;

async function createFixture(): Promise<ScanDb> {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId: MAP, userId: EDITOR, roles: ['editor'] });
    await ctx.db.insert('mapSystems', { mapId: MAP, systemId: JITA });
    await ctx.db.insert('mapTracking', { mapId: MAP, userId: EDITOR, characterId: CHARACTER });
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
  return t;
}

function asEditor(t: ScanDb) {
  return t.withIdentity({ subject: EDITOR, name: 'Editor Pilot' });
}

function signature(signatureId: string, overrides: Partial<ScannedRow> = {}): ScannedRow {
  return { signatureId, kind: 'signature', group: null, name: null, signalPct: 0, ...overrides };
}

function apply(t: ScanDb, rows: ScannedRow[]) {
  return asEditor(t).mutation(api.mapScan.applyScan, { mapId: MAP, systemId: JITA, rows });
}

async function readSignature(t: ScanDb, signatureId: string) {
  return await t.run(async (ctx) => await ctx.db
    .query('mapSignatures')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', MAP).eq('systemId', JITA).eq('signatureId', signatureId),
    )
    .unique());
}

test('ordinary identify stays available beyond the whole-system scan bound', async () => {
  const t = await createFixture();
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
  expect(
    await asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'AAA-000',
      group: 'Gas Site',
    }),
  ).toEqual({ changed: true, connectionId: null });
  expect(await readSignature(t, 'AAA-000')).toMatchObject({ group: 'Gas Site' });
  await expect(
    asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'AAA-001',
      group: 'Wormhole',
    }),
  ).rejects.toThrow('MAP_SIGNATURE_SCAN_LIMIT');
});

test('repeat ordinary identification is a no-op', async () => {
  const t = await createFixture();
  await apply(t, [signature('GAS-002')]);
  expect(
    await asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'GAS-002',
      group: 'Gas Site',
    }),
  ).toEqual({ changed: true, connectionId: null });
  expect(
    await asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'GAS-002',
      group: 'Gas Site',
    }),
  ).toEqual({ changed: false, connectionId: null });
  expect(await readSignature(t, 'GAS-002')).toMatchObject({ group: 'Gas Site' });
});

test('ordinary identify rejects an already-identified group', async () => {
  const t = await createFixture();
  await apply(t, [signature('GAS-003', { group: 'Gas Site' })]);
  await expect(
    asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'GAS-003',
      group: 'Relic Site',
    }),
  ).rejects.toThrow('SIGNATURE_ALREADY_IDENTIFIED');
  expect(await readSignature(t, 'GAS-003')).toMatchObject({ group: 'Gas Site' });
});

test('ordinary identify rejects a missing signature', async () => {
  const t = await createFixture();
  await expect(
    asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'MIS-001',
      group: 'Gas Site',
    }),
  ).rejects.toThrow('UNKNOWN_SIGNATURE');
});

test('ordinary identify rejects a tombstoned signature', async () => {
  using _now = vi.spyOn(Date, 'now').mockReturnValue(NOW);
  const t = await createFixture();
  await apply(t, [signature('TOM-001')]);
  expect(await asEditor(t).mutation(api.mapScan.removeSignatures, {
    mapId: MAP,
    systemId: JITA,
    signatureIds: ['TOM-001'],
  })).toEqual({ changed: 1 });
  await expect(
    asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'TOM-001',
      group: 'Gas Site',
    }),
  ).rejects.toThrow('UNKNOWN_SIGNATURE');
  expect(await readSignature(t, 'TOM-001')).toMatchObject({
    deletedAt: NOW,
    purgeAfter: NOW + MAP_CHAIN_UNDO_WINDOW_MS,
  });
});

test('wormhole identify associates an inbound connection', async () => {
  const t = await createFixture();
  await apply(t, [signature('INB-001')]);
  const inboundId = await t.run(async (ctx) => {
    await ctx.db.insert('mapSystems', {
      mapId: MAP,
      systemId: AMARR,
      deletedAt: null,
      purgeAfter: null,
    });
    return await ctx.db.insert('mapConnections', connectionInsert({
      mapId: MAP,
      fromSystemId: AMARR,
      toSystemId: JITA,
      toSignatureId: 'INB-001',
      wormholeTypeCode: 'B274',
      typedSide: 'from',
      typeProvenance: 'human',
      massState: null,
      shipSize: null,
      deletedAt: null,
      purgeAfter: null,
    }));
  });
  const identified = await asEditor(t).mutation(api.mapScan.identifySignature, {
    mapId: MAP,
    systemId: JITA,
    signatureId: 'INB-001',
    group: 'Wormhole',
  });
  expect(identified).toEqual({ changed: true, connectionId: inboundId });
  expect(await readSignature(t, 'INB-001')).toBeNull();
  expect(await t.run(async (ctx) => await ctx.db.get(inboundId))).toMatchObject({
    to: expect.objectContaining({ signatureId: 'INB-001' }),
    from: expect.objectContaining({ typeCode: 'B274' }),
  });
});

test('wormhole identify claims a static placeholder', async () => {
  const t = await createFixture();
  await t.mutation(internal.mapStatics.applyStaticPlaceholders, {
    mapId: MAP,
    systemId: JITA,
    codes: ['C247'],
  });
  const placeholderId = await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('mapConnections')
      .withIndex('by_map_from', (q) => q.eq('mapId', MAP).eq('fromSystemId', JITA))
      .collect();
    const placeholder = rows.find((row) => row.staticCode === 'C247');
    if (placeholder === undefined) throw new Error('missing C247 placeholder');
    return placeholder._id;
  });
  await apply(t, [signature('STA-109')]);
  const identified = await asEditor(t).mutation(api.mapScan.identifySignature, {
    mapId: MAP,
    systemId: JITA,
    signatureId: 'STA-109',
    group: 'Wormhole',
    wormholeTypeCode: 'C247',
  });
  expect(identified).toEqual({ changed: true, connectionId: placeholderId });
  expect(await readSignature(t, 'STA-109')).toBeNull();
  expect(await t.run(async (ctx) => await ctx.db.get(placeholderId))).toMatchObject({
    staticCode: 'C247',
    from: expect.objectContaining({ signatureId: 'STA-109', typeCode: 'C247' }),
    identity: { kind: 'typed', provenance: 'human' },
  });
  expect(await t.run(async (ctx) =>
    (await ctx.db.query('mapConnections').collect()).filter((row) =>
      row.from.signatureId === 'STA-109' && row._id !== placeholderId,
    ),
  )).toEqual([]);
});

test('ordinary identify on a live untracked system', async () => {
  const t = await createFixture();
  await apply(t, [signature('UNT-001')]);
  await t.run(async (ctx) => {
    const tracking = await ctx.db
      .query('mapTracking')
      .withIndex('by_map_user', (q) => q.eq('mapId', MAP).eq('userId', EDITOR))
      .unique();
    if (tracking === null) throw new Error('missing tracking');
    await ctx.db.delete(tracking._id);
  });
  expect(
    await asEditor(t).mutation(api.mapScan.identifySignature, {
      mapId: MAP,
      systemId: JITA,
      signatureId: 'UNT-001',
      group: 'Gas Site',
    }),
  ).toEqual({ changed: true, connectionId: null });
  expect(await readSignature(t, 'UNT-001')).toMatchObject({ group: 'Gas Site' });
});

