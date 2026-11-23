// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { MAP_CONNECTION_SIGNATURE_SCAN_LIMIT } from './lib/mapConnectionLookup';
import { MAP_FIXTURE_PAGE_SIZE } from './mapFixtures';
import { SIGNATURE_PURGE_BATCH } from './mapScan';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import { connectionInsert } from './__tests__/connection-doc.setup';
import { expectConvexErrorCode, grantMapAccess, type Chain } from './__tests__/convexTest.setup';

const MAP_A = 'map-a';
const MAP_B = 'map-b';
const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';
const STRANGER = 'user-stranger';

const NOW = 1_800_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;

function asEditor(t: Chain, userId = EDITOR) {
  return t.withIdentity({ subject: userId });
}

async function seedMap(t: Chain, mapId = MAP_A, systemId = JITA): Promise<void> {
  await grantMapAccess(t, mapId, EDITOR, ['editor']);
  await grantMapAccess(t, mapId, VIEWER, ['viewer']);
  await t.mutation(internal.mapFixturePlace.placeSystemFixture, { mapId, systemId });
}

function observe(
  t: Chain,
  overrides: Partial<{
    mapId: string;
    systemId: number;
    signatureId: string;
    group: string | null;
    typeName: string | null;
    wormholeTypeCode: string | null;
    kind: 'signature' | 'anomaly';
    signalPct: number | null;
  }> = {},
) {
  return t.mutation(internal.mapFixtureSignatures.upsertSignatureObservation, {
    mapId: MAP_A,
    systemId: JITA,
    signatureId: 'ABC-123',
    group: null,
    typeName: null,
    wormholeTypeCode: null,
    ...overrides,
  });
}

function readSignature(t: Chain, signatureId = 'ABC-123') {
  return t.run(async (ctx) =>
    await ctx.db
      .query('mapSignatures')
      .withIndex('by_map_signature', (q) =>
        q.eq('mapId', MAP_A).eq('systemId', JITA).eq('signatureId', signatureId),
      )
      .unique(),
  );
}

function readActivity(t: Chain, signatureId = 'ABC-123') {
  return t.run(async (ctx) =>
    await ctx.db
      .query('mapSignatureActivity')
      .withIndex('by_map_signature', (q) =>
        q.eq('mapId', MAP_A).eq('systemId', JITA).eq('signatureId', signatureId),
      )
      .unique(),
  );
}

interface ChainRow {
  readonly _id: string;
  readonly mapId: string;
}

interface ChainPage {
  readonly page: readonly ChainRow[];
  readonly isDone: boolean;
  readonly continueCursor: string;
}

async function drain(
  t: Chain,
  collection: 'systems' | 'connections' | 'signatures' | 'notes',
  userId = EDITOR,
): Promise<{ rows: ChainRow[]; pages: number; sawNonTerminalCursor: boolean }> {
  const rows: ChainRow[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let sawNonTerminalCursor = false;

  for (;;) {
    const page: ChainPage = await t
      .withIdentity({ subject: userId })
      .query(api.mapFixtures.readMapCollection, { mapId: MAP_A, collection, cursor });
    rows.push(...page.page);
    pages += 1;
    if (page.isDone) break;
    expect(page.continueCursor).not.toBeNull();
    sawNonTerminalCursor = true;
    cursor = page.continueCursor;
  }
  return { rows, pages, sawNonTerminalCursor };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});
function readSystems(t: Chain, mapId = MAP_A) {
  return t.run(async (ctx) =>
    await ctx.db
      .query('mapSystems')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .collect(),
  );
}

function readConnections(t: Chain, mapId = MAP_A) {
  return t.run(async (ctx) =>
    await ctx.db
      .query('mapConnections')
      .withIndex('by_map', (q) => q.eq('mapId', mapId))
      .collect(),
  );
}

const JUMP = {
  mapId: MAP_A,
  fromSystemId: JITA,
  toSystemId: AMARR,
  wormholeTypeCode: 'C247',
  massState: 'stable',
  shipSize: null,
} as const;

it('placeSystemFixture and placeJumpFixture place systems and one jump atomically', async () => {
  const t = convexTest(schema, modules);
  const first = await t.mutation(internal.mapFixturePlace.placeSystemFixture, {
    mapId: MAP_A,
    systemId: JITA,
  });
  expect(
    await t.mutation(internal.mapFixturePlace.placeSystemFixture, { mapId: MAP_A, systemId: JITA }),
  ).toBe(first);
  await expectConvexErrorCode(
    t.mutation(internal.mapFixturePlace.placeSystemFixture, { mapId: MAP_A, systemId: 0 }),
    'INVALID_SYSTEM_ID',
  );

  await expectConvexErrorCode(
    t.mutation(internal.mapFixturePlace.placeJumpFixture, { ...JUMP, mapId: MAP_B }),
    'NO_ORIGIN',
  );
  expect(await readConnections(t, MAP_B)).toEqual([]);
  await expectConvexErrorCode(
    t.mutation(internal.mapFixturePlace.placeJumpFixture, { ...JUMP, toSystemId: 0.5 }),
    'INVALID_SYSTEM_ID',
  );

  await t.mutation(internal.mapFixturePlace.placeJumpFixture, JUMP);
  expect((await readSystems(t)).map((row) => row.systemId).sort()).toEqual(
    [JITA, AMARR].sort(),
  );
  const connections = await readConnections(t);
  expect(connections).toHaveLength(1);
  expect(connections[0]).toMatchObject({ fromSystemId: JITA, toSystemId: AMARR });

  await t.mutation(internal.mapFixturePlace.placeJumpFixture, { ...JUMP, wormholeTypeCode: null });
  expect(await readSystems(t)).toHaveLength(2);
  expect(await readConnections(t)).toHaveLength(2);
});

it('seedTrackedLocationFixture seeds idempotently, then advances only location evidence and sync freshness', async () => {
  const t = convexTest(schema, modules);
  const seed = {
    mapId: MAP_A,
    userId: EDITOR,
    characterId: 90_404_222,
    solarSystemId: JITA,
    shipTypeId: 28_606,
    transitionObservedAt: NOW,
  };
  const readSubject = () =>
    t.run(async (ctx) =>
      await ctx.db
        .query('locationSync')
        .withIndex('by_user', (q) => q.eq('userId', EDITOR))
        .unique(),
    );

  const first = await t.mutation(internal.mapFixtureTracking.seedTrackedLocationFixture, seed);
  expect(
    await t.mutation(internal.mapFixtureTracking.seedTrackedLocationFixture, seed),
  ).toEqual(first);

  const seeded = await t.run(async (ctx) => ({
    systems: await ctx.db.query('mapSystems').collect(),
    connections: await ctx.db.query('mapConnections').collect(),
    tracking: await ctx.db.query('mapTracking').collect(),
    locations: await ctx.db.query('characterLocation').collect(),
    bookkeeping: await ctx.db.query('mapJumpBookkeeping').collect(),
  }));
  expect(seeded.systems).toHaveLength(1);
  expect(seeded.connections).toEqual([]);
  expect(seeded.tracking).toHaveLength(1);
  expect(seeded.locations).toHaveLength(1);
  expect(seeded.bookkeeping).toEqual([]);
  expect(seeded.locations[0]).toMatchObject({
    solarSystemId: JITA,
    prevSolarSystemId: null,
    prevFresh: false,
    shipTypeId: 28_606,
    transitionObservedAt: NOW,
  });
  const seededSubject = await readSubject();
  expect(seededSubject).toMatchObject({
    userId: EDITOR,
    jobId: null,
    lastFinishedAt: NOW,
    coveredCharacterIds: [90_404_222],
  });

  const advance = {
    mapId: MAP_A,
    userId: EDITOR,
    characterId: seed.characterId,
    prevFresh: true,
  };
  await expectConvexErrorCode(
    t.mutation(internal.mapFixtureTracking.advanceTrackedLocationFixture, {
      ...advance,
      fromSolarSystemId: AMARR,
      toSolarSystemId: JITA,
      transitionObservedAt: NOW + 1,
    }),
    'FIXTURE_LOCATION_STALE',
  );

  const advanced = await t.mutation(internal.mapFixtureTracking.advanceTrackedLocationFixture, {
    ...advance,
    fromSolarSystemId: JITA,
    toSolarSystemId: AMARR,
    transitionObservedAt: NOW + 60_000,
  });
  expect(advanced).toMatchObject({
    trackingId: first.trackingId,
    locationId: first.locationId,
    fromSolarSystemId: JITA,
    toSolarSystemId: AMARR,
    transitionObservedAt: NOW + 60_000,
  });

  const after = await t.run(async (ctx) => ({
    location: await ctx.db.get(first.locationId),
    connections: await ctx.db.query('mapConnections').collect(),
    bookkeeping: await ctx.db.query('mapJumpBookkeeping').collect(),
  }));
  expect(after.location).toMatchObject({
    solarSystemId: AMARR,
    prevSolarSystemId: JITA,
    prevFresh: true,
    shipTypeId: 28_606,
    transitionObservedAt: NOW + 60_000,
  });
  expect(after.connections).toEqual([]);
  expect(after.bookkeeping).toEqual([]);
  const advancedSubject = await readSubject();
  expect(advancedSubject?._id).toBe(seededSubject?._id);
  expect(advancedSubject?.lastFinishedAt).toBe(NOW + 60_000);
  expect(advancedSubject?.coveredCharacterIds).toEqual([90_404_222]);

  await t.mutation(internal.mapFixtureTracking.advanceTrackedLocationFixture, {
    ...advance,
    fromSolarSystemId: AMARR,
    toSolarSystemId: JITA,
    transitionObservedAt: NOW + 120_000,
    feedFreshAt: NOW + 300_000,
  });
  expect((await readSubject())?.lastFinishedAt).toBe(NOW + 300_000);
});

it('seedTrackedLocationFixture refuses a character outside a scoped claim', async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.mapAccessProjection.reconcileMapClaims, {
    mapId: MAP_A,
    revision: 1,
    claims: [{ userId: EDITOR, roles: ['editor'], characters: [{ characterId: 90_404_111, name: 'Listed' }] }],
  });
  const seed = (characterId: number) =>
    t.mutation(internal.mapFixtureTracking.seedTrackedLocationFixture, {
      mapId: MAP_A, userId: EDITOR, characterId, solarSystemId: JITA, shipTypeId: null, transitionObservedAt: NOW,
    });
  await expectConvexErrorCode(seed(90_404_222), 'CHARACTER_NOT_ELIGIBLE');
  await expect(seed(90_404_111)).resolves.toMatchObject({ toSolarSystemId: JITA });
});

it('collapseJumpFixture refuses foreign or unjoined connections, rolls back while in use, then collapses idempotently', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);
  const connectionId = await t.mutation(internal.mapFixturePlace.placeJumpFixture, JUMP);
  const third = 30_002_659;
  const onward = await t.mutation(internal.mapFixturePlace.placeJumpFixture, {
    ...JUMP,
    fromSystemId: AMARR,
    toSystemId: third,
    wormholeTypeCode: null,
  });
  await grantMapAccess(t, MAP_B, EDITOR, ['editor']);
  await t.mutation(internal.mapFixturePlace.placeSystemFixture, { mapId: MAP_B, systemId: AMARR });

  await expectConvexErrorCode(
    t.mutation(internal.mapFixtureRemove.collapseJumpFixture, {
      mapId: MAP_B,
      connectionId,
      systemId: AMARR,
    }),
    'WRONG_CONNECTION',
  );
  expect(await readSystems(t, MAP_B)).toHaveLength(1);
  await expectConvexErrorCode(
    t.mutation(internal.mapFixtureRemove.collapseJumpFixture, {
      mapId: MAP_A,
      connectionId,
      systemId: third,
    }),
    'WRONG_CONNECTION',
  );
  await expectConvexErrorCode(
    t.mutation(internal.mapFixtureRemove.collapseJumpFixture, {
      mapId: MAP_A,
      connectionId,
      systemId: AMARR,
    }),
    'SYSTEM_IN_USE',
  );
  expect(await readConnections(t)).toHaveLength(2);

  expect(
    await t.mutation(internal.mapFixtureRemove.collapseJumpFixture, {
      mapId: MAP_A,
      connectionId: onward,
      systemId: third,
    }),
  ).toBe('removed');
  const collapse = { mapId: MAP_A, connectionId, systemId: AMARR };
  expect(await t.mutation(internal.mapFixtureRemove.collapseJumpFixture, collapse)).toBe('removed');
  expect((await readSystems(t)).map((row) => row.systemId)).toEqual([JITA]);
  expect(await readConnections(t)).toHaveLength(0);
  expect(await t.mutation(internal.mapFixtureRemove.collapseJumpFixture, collapse)).toBe('unchanged');
});

it('insertConnectionFixture rejects bad input before any write and stores join keys and observation state only', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);
  await t.mutation(internal.mapFixturePlace.placeSystemFixture, { mapId: MAP_A, systemId: AMARR });

  for (const { code, args } of [
    { code: 'SELF_LOOP_CONNECTION', args: { fromSystemId: JITA, toSystemId: JITA, wormholeTypeCode: null } },
    { code: 'INVALID_WORMHOLE_CODE', args: { fromSystemId: JITA, toSystemId: AMARR, wormholeTypeCode: 'nope' } },
    { code: 'UNKNOWN_ENDPOINT', args: { fromSystemId: JITA, toSystemId: 30_009_999, wormholeTypeCode: null } },
    { code: 'INVALID_SYSTEM_ID', args: { fromSystemId: JITA, toSystemId: -1, wormholeTypeCode: null } },
  ]) {
    await expectConvexErrorCode(
      t.mutation(internal.mapFixturePlace.insertConnectionFixture, {
        mapId: MAP_A,
        massState: 'stable',
        shipSize: null,
        ...args,
      }),
      code,
    );
    expect(await t.run(async (ctx) => await ctx.db.query('mapConnections').collect()), code)
      .toHaveLength(0);
  }

  await t.mutation(internal.mapFixturePlace.insertConnectionFixture, {
    ...JUMP,
    massState: 'reduced',
  });
  const [connection] = await readConnections(t);
  expect(connection).toMatchObject({
    mapId: MAP_A,
    fromSystemId: JITA,
    toSystemId: AMARR,
    from: expect.objectContaining({ typeCode: 'C247' }),
    identity: { kind: 'typed', provenance: 'human' },
    massState: 'reduced',
    shipSize: null,
    tombstone: { kind: 'live' },
  });
  expect(Object.keys(connection!).sort()).toEqual([
    '_creationTime',
    '_id',
    'from',
    'fromSystemId',
    'identity',
    'lifetime',
    'mapId',
    'massState',
    'resolution',
    'shipSize',
    'to',
    'toSystemId',
    'tombstone',
  ]);
});

it('upsertUnresolvedHole upserts one unresolved wormhole slot without inventing a destination', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);

  const inserted = await t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
    mapId: MAP_A,
    fromSystemId: JITA,
    fromSignatureId: 'ABC-123',
  });
  const unchanged = await t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
    mapId: MAP_A,
    fromSystemId: JITA,
    fromSignatureId: ' ABC-123 ',
  });
  const updated = await t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
    mapId: MAP_A,
    fromSystemId: JITA,
    fromSignatureId: 'ABC-123',
    wormholeTypeCode: 'C247',
    shipSize: 'L',
    fromDestinationHint: 'dangerous',
  });

  expect(inserted.outcome).toBe('inserted');
  expect(unchanged).toEqual({ outcome: 'unchanged', connectionId: inserted.connectionId });
  expect(updated).toEqual({ outcome: 'updated', connectionId: inserted.connectionId });
  const rows = await t.run(async (ctx) =>
    await ctx.db
      .query('mapConnections')
      .withIndex('by_map_from', (q) => q.eq('mapId', MAP_A).eq('fromSystemId', JITA))
      .collect(),
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    toSystemId: null,
    from: expect.objectContaining({
      signatureId: 'ABC-123',
      typeCode: 'C247',
      leadsTo: { kind: 'hint', hint: 'dangerous' },
    }),
    identity: { kind: 'typed', provenance: 'human' },
    shipSize: 'L',
    tombstone: { kind: 'live' },
  });
});

it('upsertUnresolvedHole preserves the fixture overflow contract for unresolved-hole lookup', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);
  await t.run(async (ctx) => {
    for (let index = 0; index <= MAP_CONNECTION_SIGNATURE_SCAN_LIMIT; index += 1) {
      await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: JITA,
        toSystemId: null,
        fromSignatureId: `WHL-${index}`,
        wormholeTypeCode: null,
        massState: 'stable',
        shipSize: null,
      }));
    }
  });

  await expectConvexErrorCode(t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
    mapId: MAP_A,
    fromSystemId: JITA,
    fromSignatureId: 'NEW-001',
  }), 'FIXTURE_MAP_TOO_LARGE');
});

it('upsertSignatureObservation rejects incoherent input, stores a null code, and merges additively', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);

  await expectConvexErrorCode(observe(t, { systemId: 30_009_999 }), 'UNKNOWN_SYSTEM');
  await expectConvexErrorCode(
    observe(t, { group: 'combat', wormholeTypeCode: 'C247' }),
    'INCOHERENT_SIGNATURE',
  );
  expect(await readSignature(t)).toBeNull();

  expect(await observe(t, { group: 'wormhole', typeName: 'Unstable Wormhole' })).toEqual({
    outcome: 'inserted',
  });
  expect(await readSignature(t)).toMatchObject({
    group: 'wormhole',
    typeName: 'Unstable Wormhole',
    wormholeTypeCode: null,
    deletedAt: null,
    purgeAfter: null,
  });

  expect(
    await observe(t, { group: 'wormhole', wormholeTypeCode: 'C247' }),
  ).toEqual({ outcome: 'enriched', patch: { wormholeTypeCode: 'C247' } });
  expect(await readSignature(t)).toMatchObject({ wormholeTypeCode: 'C247' });
  expect(
    await observe(t, { group: 'wormhole', wormholeTypeCode: 'C247' }),
  ).toEqual({ outcome: 'unchanged' });
  expect(await observe(t, { group: null, wormholeTypeCode: '   ' })).toEqual({
    outcome: 'unchanged',
  });
  expect(await readSignature(t)).toMatchObject({
    group: 'wormhole',
    wormholeTypeCode: 'C247',
  });
  expect(
    await observe(t, { group: 'wormhole', wormholeTypeCode: 'K162' }),
  ).toEqual({ outcome: 'conflict', fields: ['wormholeTypeCode'] });
  expect(await readSignature(t)).toMatchObject({ wormholeTypeCode: 'C247' });

  expect(await observe(t, { signatureId: 'DEF-456', group: 'wormhole', signalPct: null })).toEqual({
    outcome: 'inserted',
  });
  expect(
    await observe(t, { signatureId: 'DEF-456', group: 'wormhole', kind: 'signature', signalPct: 58.6 }),
  ).toEqual({ outcome: 'enriched', patch: { kind: 'signature', signalPct: 58.6 } });
  expect(
    await observe(t, { signatureId: 'DEF-456', group: 'wormhole', kind: 'signature', signalPct: 0 }),
  ).toEqual({ outcome: 'unchanged' });
  expect(await readSignature(t, 'DEF-456')).toMatchObject({ kind: 'signature', signalPct: 58.6 });
});

it('insertNoteFixture accepts map, system, and signature targets on its own map only', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);
  await observe(t, { group: 'wormhole' });
  await grantMapAccess(t, MAP_B, EDITOR, ['editor']);
  const foreign = await t.mutation(internal.mapFixturePlace.placeSystemFixture, {
    mapId: MAP_B,
    systemId: AMARR,
  });

  for (const [targetKind, targetId] of [
    ['system', foreign as string],
    ['map', MAP_B],
  ] as const) {
    await expectConvexErrorCode(
      t.mutation(internal.mapFixtureNotes.insertNoteFixture, {
        mapId: MAP_A,
        targetKind,
        targetId,
        body: 'cross-map',
      }),
      'INVALID_NOTE_TARGET',
    );
  }
  expect(await t.run(async (ctx) => await ctx.db.query('mapNotes').collect())).toHaveLength(0);

  const systemId = await t.run(async (ctx) => {
    const system = await ctx.db
      .query('mapSystems')
      .withIndex('by_map_system', (q) => q.eq('mapId', MAP_A).eq('systemId', JITA))
      .unique();
    return system!._id as string;
  });
  const signature = await readSignature(t);
  for (const [targetKind, targetId] of [
    ['map', MAP_A],
    ['system', systemId],
    ['signature', signature!._id as string],
  ] as const) {
    await t.mutation(internal.mapFixtureNotes.insertNoteFixture, {
      mapId: MAP_A,
      targetKind,
      targetId,
      body: `note on ${targetKind}`,
    });
  }

  const notes = await t.run(async (ctx) =>
    await ctx.db
      .query('mapNotes')
      .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
      .collect(),
  );
  expect(notes.map((note) => note.targetKind).sort()).toEqual(['map', 'signature', 'system']);
});

it('readMapCollection gates every collection by claim and never returns another map’s rows', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);
  await grantMapAccess(t, MAP_B, EDITOR, ['editor']);
  await t.mutation(internal.mapFixturePlace.placeSystemFixture, { mapId: MAP_B, systemId: AMARR });
  await t.run(async (ctx) => {
    await ctx.db.insert('mapConnections', connectionInsert({
      mapId: MAP_B,
      fromSystemId: JITA,
      toSystemId: AMARR,
      wormholeTypeCode: 'C247',
      massState: 'stable',
      shipSize: 'S',
    }));
    await ctx.db.insert('mapSignatures', {
      mapId: MAP_B,
      systemId: AMARR,
      signatureId: 'OTH-001',
      group: null,
      typeName: null,
      wormholeTypeCode: null,
      deletedAt: null,
      purgeAfter: null,
    });
    await ctx.db.insert('mapNotes', {
      mapId: MAP_B,
      targetKind: 'map',
      targetId: MAP_B,
      body: 'other map',
    });
  });

  const expectedRows = { systems: 1, connections: 0, signatures: 0, notes: 0 };
  for (const collection of ['systems', 'connections', 'signatures', 'notes'] as const) {
    const args = { mapId: MAP_A, collection, cursor: null };
    await expectConvexErrorCode(t.query(api.mapFixtures.readMapCollection, args), 'UNAUTHENTICATED');
    await expectConvexErrorCode(
      asEditor(t, STRANGER).query(api.mapFixtures.readMapCollection, args),
      'FORBIDDEN',
    );
    expect(
      (await asEditor(t, VIEWER).query(api.mapFixtures.readMapCollection, args)).page,
      collection,
    ).toHaveLength(expectedRows[collection]);
    const drained = await drain(t, collection);
    expect(drained.rows, collection).toHaveLength(expectedRows[collection]);
    expect(drained.rows.every((row) => row.mapId === MAP_A), collection).toBe(true);
  }
});

it('requireMapAccess unions capabilities across a multi-role claim', async () => {
  const t = convexTest(schema, modules);
  await grantMapAccess(t, MAP_A, OWNER, ['admin', 'viewer']);
  await expect(
    asEditor(t, OWNER).mutation(api.mapAuthoringHome.setHomeSystem, {
      mapId: MAP_A,
      systemId: JITA,
    }),
  ).resolves.toBeDefined();
});

it.each(['systems', 'connections', 'notes', 'signatures'] as const)(
  'readMapCollection reports a non-terminal %s cursor whose iteration yields the complete set',
  async (collection) => {
    const t = convexTest(schema, modules);
    await seedMap(t);

    const total = MAP_FIXTURE_PAGE_SIZE * 2 + 3;
    await t.run(async (ctx) => {
      for (let i = 0; i < total; i += 1) {
        if (collection === 'notes') {
          await ctx.db.insert('mapNotes', {
            mapId: MAP_A,
            targetKind: 'map',
            targetId: MAP_A,
            body: `note ${i}`,
          });
        } else if (collection === 'signatures') {
          await ctx.db.insert('mapSignatures', {
            mapId: MAP_A,
            systemId: JITA,
            signatureId: `SIG-${i}`,
            group: null,
            typeName: null,
            wormholeTypeCode: null,
            deletedAt: null,
            purgeAfter: null,
          });
        } else if (collection === 'systems') {
          await ctx.db.insert('mapSystems', {
            mapId: MAP_A,
            systemId: 40_000_000 + i,
          });
        } else {
          await ctx.db.insert('mapConnections', connectionInsert({
            mapId: MAP_A,
            fromSystemId: JITA,
            toSystemId: 40_000_000 + i,
            wormholeTypeCode: null,
            massState: 'stable',
            shipSize: null,
          }));
        }
      }
    });

    const drained = await drain(t, collection);
    expect(drained.sawNonTerminalCursor).toBe(true);
    expect(drained.pages).toBeGreaterThan(1);
    const expected =
      collection === 'systems' ? total + 1 : total;
    expect(drained.rows).toHaveLength(expected);
    expect(new Set(drained.rows.map((row) => row._id)).size).toBe(expected);
  },
);

it('recordSignatureSeen keeps bookkeeping off the payload and writes only past the threshold', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);
  const seen = (signatureId = 'ABC-123') =>
    t.mutation(internal.mapFixtureSignatures.recordSignatureSeen, {
      mapId: MAP_A,
      systemId: JITA,
      signatureId,
    });

  expect(await seen(' ABC-123 ')).toBe('unchanged');
  expect(await readActivity(t)).toBeNull();

  await observe(t, { group: 'wormhole', wormholeTypeCode: 'C247' });
  const payloadBefore = await readSignature(t);
  const activityBefore = await readActivity(t);

  vi.setSystemTime(NOW + 59_000);
  expect(await seen()).toBe('unchanged');
  expect(await readActivity(t)).toEqual(activityBefore);

  vi.setSystemTime(NOW + 61_000);
  expect(await seen()).toBe('patched');
  expect(await readSignature(t)).toEqual(payloadBefore);
  const activityAfter = await readActivity(t);
  expect(activityAfter?.lastSeenAt).toBe(NOW + 61_000);
  expect(activityAfter?._id).toBe(activityBefore?._id);
});

it('setSignatureTombstone validates the pair, drops activity, writes nothing when already in state, and restores the identical payload', async () => {
  const t = convexTest(schema, modules);
  await seedMap(t);
  await observe(t, { group: 'wormhole', typeName: 'Unstable Wormhole' });
  const before = await readSignature(t);
  expect(await readActivity(t)).not.toBeNull();
  const key = { mapId: MAP_A, systemId: JITA, signatureId: 'ABC-123' };

  for (const pair of [
    { deletedAt: NOW, purgeAfter: null },
    { deletedAt: NOW, purgeAfter: NOW - 1 },
  ]) {
    await expectConvexErrorCode(
      t.mutation(internal.mapFixtureSignatures.setSignatureTombstone, { ...key, ...pair }),
      'INVALID_TOMBSTONE',
    );
  }
  expect(await readSignature(t)).toEqual(before);

  const tombstone = { ...key, deletedAt: NOW, purgeAfter: NOW + 600_000 };
  expect(await t.mutation(internal.mapFixtureSignatures.setSignatureTombstone, tombstone)).toEqual({
    tombstoned: true,
  });
  expect(await readActivity(t)).toBeNull();
  const tombstoned = await readSignature(t);
  expect(await t.mutation(internal.mapFixtureSignatures.setSignatureTombstone, tombstone)).toEqual({
    tombstoned: true,
  });
  expect(await readSignature(t)).toEqual(tombstoned);

  expect(await observe(t, { group: 'wormhole' })).toEqual({ outcome: 'tombstoned' });
  expect(
    await t.mutation(internal.mapFixtureSignatures.recordSignatureSeen, key),
  ).toBe('unchanged');
  expect(await readActivity(t)).toBeNull();

  const restore = { ...key, deletedAt: null, purgeAfter: null };
  expect(await t.mutation(internal.mapFixtureSignatures.setSignatureTombstone, restore)).toEqual({
    tombstoned: false,
  });
  expect(await readSignature(t)).toEqual(before);
  expect(await t.mutation(internal.mapFixtureSignatures.setSignatureTombstone, restore)).toEqual({
    tombstoned: false,
  });
  expect(await readSignature(t)).toEqual(before);
});

it.each([
  { extra: 1, expectedHasMore: true, label: 'above' },
  { extra: 0, expectedHasMore: false, label: 'exactly at' },
])(
  'purgeExpiredSignatureTombstones deletes one bounded batch $label the cap, reports exact continuation, and leaves activity rows',
  async ({ extra, expectedHasMore }) => {
    const t = convexTest(schema, modules);
    const expired = SIGNATURE_PURGE_BATCH + extra;

    await t.run(async (ctx) => {
      for (let i = 0; i < expired; i += 1) {
        await ctx.db.insert('mapSignatures', {
          mapId: MAP_A,
          systemId: JITA,
          signatureId: `EXP-${i}`,
          group: null,
          typeName: null,
          wormholeTypeCode: null,
          deletedAt: NOW - 20_000,
          purgeAfter: NOW - 10_000,
        });
      }
      await ctx.db.insert('mapSignatureActivity', {
        mapId: MAP_A,
        systemId: JITA,
        signatureId: 'EXP-0',
        lastSeenAt: NOW - 30_000,
      });
      await ctx.db.insert('mapSignatures', {
        mapId: MAP_A,
        systemId: JITA,
        signatureId: 'ACTIVE',
        group: null,
        typeName: null,
        wormholeTypeCode: null,
        deletedAt: null,
        purgeAfter: null,
      });
      await ctx.db.insert('mapSignatures', {
        mapId: MAP_A,
        systemId: JITA,
        signatureId: 'PENDING',
        group: null,
        typeName: null,
        wormholeTypeCode: null,
        deletedAt: NOW,
        purgeAfter: NOW + 600_000,
      });
    });
    const activityBefore = await t.run(async (ctx) =>
      await ctx.db.query('mapSignatureActivity').collect(),
    );

    const result = await t.mutation(internal.mapScan.purgeExpiredSignatureTombstones, {});
    expect(result).toEqual({
      deletedCount: SIGNATURE_PURGE_BATCH,
      hasMore: expectedHasMore,
    });

    const survivors = await t.run(async (ctx) =>
      await ctx.db.query('mapSignatures').collect(),
    );
    expect(survivors.map((row) => row.signatureId).sort()).toEqual(
      extra === 0
        ? ['ACTIVE', 'PENDING']
        : ['ACTIVE', `EXP-${SIGNATURE_PURGE_BATCH}`, 'PENDING'].sort(),
    );
    expect(await t.run(async (ctx) => await ctx.db.query('mapSignatureActivity').collect()))
      .toEqual(activityBefore);
  },
);
