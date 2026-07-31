// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConvexError } from 'convex/values';
import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { MAP_ROLES } from '@/data/maps/access-contract';
import { api, internal } from './_generated/api';
import schema from './schema';
import {
  MAP_FIXTURE_PAGE_SIZE,
  SIGNATURE_ACTIVITY_STALE_MS,
} from './mapFixtures';
import { SIGNATURE_TOMBSTONE_DELETE_CAP } from './lib/mapSignatureCleanup';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const MAP_A = 'map-a';
const MAP_B = 'map-b';
const USER_EDITOR = 'user_editor';
const USER_VIEWER = 'user_viewer';
const USER_NONE = 'user_none';

function tFresh() {
  return convexTest(schema, modules);
}

async function seedClaim(
  t: ReturnType<typeof tFresh>,
  mapId: string,
  userId: string,
  roles: Array<'viewer' | 'editor' | 'owner'>,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId, userId, roles });
  });
}

async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError) {
      const data = error.data as { code?: string };
      return data.code ?? null;
    }
    // convex-test may wrap application errors; inspect nested data when present.
    if (
      typeof error === 'object' &&
      error !== null &&
      'data' in error &&
      typeof (error as { data: unknown }).data === 'object' &&
      (error as { data: { code?: string } }).data !== null
    ) {
      return (error as { data: { code?: string } }).data.code ?? null;
    }
    throw error;
  }
}

describe('mapFixtures schema census', () => {
  it('registers every chain table and required index', () => {
    const tables = schema.tables;
    expect(Object.keys(tables)).toEqual(
      expect.arrayContaining([
        'mapAccess',
        'mapSystems',
        'mapConnections',
        'mapSignatures',
        'mapNotes',
        'mapSignatureActivity',
      ]),
    );

    expect(tables.mapAccess.indexes.map((index) => index.indexDescriptor)).toEqual(
      expect.arrayContaining(['by_map', 'by_map_user', 'by_user']),
    );
    expect(tables.mapSystems.indexes.map((index) => index.indexDescriptor)).toEqual(
      expect.arrayContaining(['by_map', 'by_map_system']),
    );
    expect(
      tables.mapConnections.indexes.map((index) => index.indexDescriptor),
    ).toEqual(expect.arrayContaining(['by_map']));
    expect(
      tables.mapSignatures.indexes.map((index) => index.indexDescriptor),
    ).toEqual(
      expect.arrayContaining(['by_map', 'by_map_signature', 'by_purge_after']),
    );
    expect(tables.mapNotes.indexes.map((index) => index.indexDescriptor)).toEqual(
      expect.arrayContaining(['by_map', 'by_map_target']),
    );
    expect(
      tables.mapSignatureActivity.indexes.map((index) => index.indexDescriptor),
    ).toEqual(expect.arrayContaining(['by_map', 'by_map_signature']));
    expect(MAP_ROLES).toEqual(['viewer', 'editor', 'owner']);
  });

  it('keeps repeated system upserts singular', async () => {
    const t = tFresh();
    await seedClaim(t, MAP_A, USER_EDITOR, ['editor']);
    const asEditor = t.withIdentity({ subject: USER_EDITOR });

    const first = await asEditor.mutation(api.mapFixtures.upsertSystem, {
      mapId: MAP_A,
      systemId: 30_000_142,
    });
    const second = await asEditor.mutation(api.mapFixtures.upsertSystem, {
      mapId: MAP_A,
      systemId: 30_000_142,
    });
    expect(second).toBe(first);

    const rows = await t.run((ctx) =>
      ctx.db
        .query('mapSystems')
        .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.systemId).toBe(30_000_142);
  });
});

describe('mapFixtures round-trips connection and signature state', () => {
  it('round-trips connection and signature state', async () => {
    const t = tFresh();
    await seedClaim(t, MAP_A, USER_EDITOR, ['editor']);
    const asEditor = t.withIdentity({ subject: USER_EDITOR });

    const fromId = await asEditor.mutation(api.mapFixtures.upsertSystem, {
      mapId: MAP_A,
      systemId: 1,
    });
    const toId = await asEditor.mutation(api.mapFixtures.upsertSystem, {
      mapId: MAP_A,
      systemId: 2,
    });

    const connectionId = await t.mutation(internal.mapFixtures.insertConnectionFixture, {
      mapId: MAP_A,
      fromSystemId: 1,
      toSystemId: 2,
      wormholeTypeCode: 'B274',
      massState: 'reduced',
      shipSize: 'L',
      eolAt: 1_700_000_000_000,
    });
    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    expect(connection).toMatchObject({
      mapId: MAP_A,
      fromSystemId: 1,
      toSystemId: 2,
      wormholeTypeCode: 'B274',
      massState: 'reduced',
      shipSize: 'L',
      eolAt: 1_700_000_000_000,
    });
    expect(connection).not.toHaveProperty('name');
    expect(connection).not.toHaveProperty('whClassId');
    expect(connection).not.toHaveProperty('totalMass');

    await expect(
      t.mutation(internal.mapFixtures.insertConnectionFixture, {
        mapId: MAP_A,
        fromSystemId: 1,
        toSystemId: 1,
        wormholeTypeCode: null,
        massState: 'stable',
        shipSize: null,
        eolAt: null,
      }),
    ).rejects.toThrow(/distinct/);

    await expect(
      t.mutation(internal.mapFixtures.insertConnectionFixture, {
        mapId: MAP_A,
        fromSystemId: 1,
        toSystemId: 99,
        wormholeTypeCode: 'B274',
        massState: 'stable',
        shipSize: null,
        eolAt: null,
      }),
    ).rejects.toThrow(/same map/);

    const inserted = await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      knowledge: {
        group: 'wormhole',
        typeName: null,
        wormholeTypeCode: null,
      },
    });
    expect(inserted.kind).toBe('inserted');

    const enriched = await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      knowledge: {
        group: 'wormhole',
        typeName: 'Wormhole B274',
        wormholeTypeCode: 'B274',
      },
    });
    expect(enriched.kind).toBe('enriched');

    const unchanged = await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      knowledge: {
        group: 'wormhole',
        typeName: 'Wormhole B274',
        wormholeTypeCode: 'B274',
      },
    });
    expect(unchanged.kind).toBe('unchanged');

    const conflict = await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      knowledge: {
        group: 'wormhole',
        typeName: 'Wormhole C247',
        wormholeTypeCode: 'C247',
      },
    });
    expect(conflict.kind).toBe('conflict');

    const signature = await t.run((ctx) =>
      ctx.db
        .query('mapSignatures')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique(),
    );
    expect(signature).toMatchObject({
      group: 'wormhole',
      typeName: 'Wormhole B274',
      wormholeTypeCode: 'B274',
      deletedAt: null,
      purgeAfter: null,
    });

    const mapNote = await t.mutation(internal.mapFixtures.insertNoteFixture, {
      mapId: MAP_A,
      targetKind: 'map',
      targetId: MAP_A,
      body: 'map note',
    });
    const systemNote = await t.mutation(internal.mapFixtures.insertNoteFixture, {
      mapId: MAP_A,
      targetKind: 'system',
      targetId: fromId,
      body: 'system note',
    });
    const signatureNote = await t.mutation(internal.mapFixtures.insertNoteFixture, {
      mapId: MAP_A,
      targetKind: 'signature',
      targetId: signature!._id,
      body: 'signature note',
    });
    expect(mapNote).toBeTruthy();
    expect(systemNote).toBeTruthy();
    expect(signatureNote).toBeTruthy();
    expect(toId).toBeTruthy();

    await expect(
      t.mutation(internal.mapFixtures.insertNoteFixture, {
        mapId: MAP_A,
        targetKind: 'map',
        targetId: MAP_B,
        body: 'bad',
      }),
    ).rejects.toThrow(/equal mapId/);

    await expect(
      t.mutation(internal.mapFixtures.insertNoteFixture, {
        mapId: MAP_A,
        targetKind: 'system',
        targetId: toId,
        body: 'cross',
      }),
    ).resolves.toBeTruthy();

    // Cross-map system target: seed a B system id string into an A note.
    const bSystem = await t.run(async (ctx) =>
      ctx.db.insert('mapSystems', { mapId: MAP_B, systemId: 9 }),
    );
    await expect(
      t.mutation(internal.mapFixtures.insertNoteFixture, {
        mapId: MAP_A,
        targetKind: 'system',
        targetId: bSystem,
        body: 'cross-map',
      }),
    ).rejects.toThrow(/same map/);

    const deletedAt = 1_700_000_100_000;
    const purgeAfter = deletedAt + 60_000;
    await t.mutation(internal.mapFixtures.setSignatureTombstone, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      deletedAt,
      purgeAfter,
    });
    const tombstoned = await t.run((ctx) =>
      ctx.db
        .query('mapSignatures')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique(),
    );
    expect(tombstoned).toMatchObject({ deletedAt, purgeAfter });

    await t.mutation(internal.mapFixtures.setSignatureTombstone, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      deletedAt: null,
      purgeAfter: null,
    });
    const restored = await t.run((ctx) =>
      ctx.db
        .query('mapSignatures')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique(),
    );
    expect(restored).toMatchObject({
      group: 'wormhole',
      typeName: 'Wormhole B274',
      wormholeTypeCode: 'B274',
      deletedAt: null,
      purgeAfter: null,
    });
  });
});

describe('mapFixtures gates every public fixture and isolates maps', () => {
  it('gates every public fixture and isolates maps', async () => {
    const t = tFresh();
    await seedClaim(t, MAP_A, USER_EDITOR, ['editor']);
    await seedClaim(t, MAP_A, USER_VIEWER, ['viewer']);
    await seedClaim(t, MAP_B, USER_EDITOR, ['editor']);

    expect(
      await errorCode(
        t.query(api.mapFixtures.readMapCollection, {
          mapId: MAP_A,
          collection: 'systems',
          cursor: null,
        }),
      ),
    ).toBe('UNAUTHENTICATED');
    expect(
      await errorCode(
        t.mutation(api.mapFixtures.upsertSystem, { mapId: MAP_A, systemId: 1 }),
      ),
    ).toBe('UNAUTHENTICATED');

    const asNone = t.withIdentity({ subject: USER_NONE });
    expect(
      await errorCode(
        asNone.query(api.mapFixtures.readMapCollection, {
          mapId: MAP_A,
          collection: 'systems',
          cursor: null,
        }),
      ),
    ).toBe('FORBIDDEN');

    const asViewer = t.withIdentity({ subject: USER_VIEWER });
    expect(
      await errorCode(
        asViewer.mutation(api.mapFixtures.upsertSystem, { mapId: MAP_A, systemId: 1 }),
      ),
    ).toBe('FORBIDDEN');

    const asEditor = t.withIdentity({ subject: USER_EDITOR });
    for (let i = 1; i <= MAP_FIXTURE_PAGE_SIZE + 1; i += 1) {
      await asEditor.mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_A,
        systemId: i,
      });
      await asEditor.mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_B,
        systemId: 100 + i,
      });
    }

    for (let i = 1; i <= MAP_FIXTURE_PAGE_SIZE + 1; i += 1) {
      await t.mutation(internal.mapFixtures.insertConnectionFixture, {
        mapId: MAP_A,
        fromSystemId: 1,
        toSystemId: Math.min(i + 1, MAP_FIXTURE_PAGE_SIZE + 1),
        wormholeTypeCode: null,
        massState: 'stable',
        shipSize: null,
        eolAt: null,
      });
      await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
        mapId: MAP_A,
        systemId: 1,
        signatureId: `SIG-${i}`,
        knowledge: { group: null, typeName: null, wormholeTypeCode: null },
      });
      await t.mutation(internal.mapFixtures.insertNoteFixture, {
        mapId: MAP_A,
        targetKind: 'map',
        targetId: MAP_A,
        body: `note-${i}`,
      });
    }

    const firstSystems = await asEditor.query(api.mapFixtures.readMapCollection, {
      mapId: MAP_A,
      collection: 'systems',
      cursor: null,
    });
    expect(firstSystems.page).toHaveLength(MAP_FIXTURE_PAGE_SIZE);
    expect(firstSystems.isDone).toBe(false);
    expect(firstSystems.page.every((row) => row.mapId === MAP_A)).toBe(true);
    expect(firstSystems.page.some((row) => row.systemId >= 100)).toBe(false);

    for (const collection of ['connections', 'signatures', 'notes'] as const) {
      const first = await asEditor.query(api.mapFixtures.readMapCollection, {
        mapId: MAP_A,
        collection,
        cursor: null,
      });
      expect(first.page).toHaveLength(MAP_FIXTURE_PAGE_SIZE);
      expect(first.isDone).toBe(false);
      expect(first.page.every((row) => row.mapId === MAP_A)).toBe(true);
    }

    const systemIds = new Set(firstSystems.page.map((row) => row.systemId));
    let systemsCursor = firstSystems.continueCursor;
    let systemsDone = firstSystems.isDone;
    while (!systemsDone) {
      const next = await asEditor.query(api.mapFixtures.readMapCollection, {
        mapId: MAP_A,
        collection: 'systems',
        cursor: systemsCursor,
      });
      for (const row of next.page) systemIds.add(row.systemId);
      systemsCursor = next.continueCursor;
      systemsDone = next.isDone;
    }
    expect([...systemIds].sort((a, b) => a - b)).toEqual(
      Array.from({ length: MAP_FIXTURE_PAGE_SIZE + 1 }, (_, i) => i + 1),
    );
  });
});

describe('mapFixtures keeps bookkeeping off payload documents', () => {
  it('keeps bookkeeping off payload documents', async () => {
    const t = tFresh();
    await seedClaim(t, MAP_A, USER_EDITOR, ['editor']);
    const asEditor = t.withIdentity({ subject: USER_EDITOR });
    await asEditor.mutation(api.mapFixtures.upsertSystem, {
      mapId: MAP_A,
      systemId: 1,
    });

    await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      knowledge: {
        group: 'wormhole',
        typeName: null,
        wormholeTypeCode: null,
      },
    });

    const before = await t.run((ctx) =>
      ctx.db
        .query('mapSignatures')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique(),
    );
    expect(before).not.toBeNull();

    const t0 = 1_700_000_000_000;
    const firstSeen = await t.mutation(internal.mapFixtures.recordSignatureSeen, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      observedAt: t0,
    });
    // Insert already created activity; first explicit record may patch or no-op.
    expect(['inserted', 'patched', 'unchanged']).toContain(firstSeen.kind);

    const activityAfterInsert = await t.run((ctx) =>
      ctx.db
        .query('mapSignatureActivity')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique(),
    );
    expect(activityAfterInsert).not.toBeNull();
    const baselineLastSeen = activityAfterInsert!.lastSeenAt;

    const subThreshold = await t.mutation(internal.mapFixtures.recordSignatureSeen, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      observedAt: baselineLastSeen + SIGNATURE_ACTIVITY_STALE_MS - 1,
    });
    expect(subThreshold).toEqual({ kind: 'unchanged' });

    const afterSub = await t.run(async (ctx) => {
      const signature = await ctx.db
        .query('mapSignatures')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique();
      const activity = await ctx.db
        .query('mapSignatureActivity')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique();
      return { signature, activity };
    });
    expect(afterSub.signature).toEqual(before);
    expect(afterSub.activity?.lastSeenAt).toBe(baselineLastSeen);

    const elapsedAt = baselineLastSeen + SIGNATURE_ACTIVITY_STALE_MS;
    const elapsed = await t.mutation(internal.mapFixtures.recordSignatureSeen, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      observedAt: elapsedAt,
    });
    expect(elapsed).toEqual({ kind: 'patched' });

    const afterElapsed = await t.run(async (ctx) => {
      const signature = await ctx.db
        .query('mapSignatures')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique();
      const activity = await ctx.db
        .query('mapSignatureActivity')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique();
      return { signature, activity };
    });
    expect(afterElapsed.signature).toEqual(before);
    expect(afterElapsed.signature?._id).toBe(before?._id);
    expect(afterElapsed.signature?._creationTime).toBe(before?._creationTime);
    expect(afterElapsed.activity?.lastSeenAt).toBe(elapsedAt);

    const deletedAt = elapsedAt + 1;
    const purgeAfter = deletedAt + 10_000;
    await t.mutation(internal.mapFixtures.setSignatureTombstone, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      deletedAt,
      purgeAfter,
    });
    const activityGone = await t.run((ctx) =>
      ctx.db
        .query('mapSignatureActivity')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique(),
    );
    expect(activityGone).toBeNull();

    const whileTombstoned = await t.mutation(
      internal.mapFixtures.upsertSignatureObservation,
      {
        mapId: MAP_A,
        systemId: 1,
        signatureId: 'ABC-123',
        knowledge: {
          group: 'wormhole',
          typeName: 'Wormhole B274',
          wormholeTypeCode: 'B274',
        },
      },
    );
    expect(whileTombstoned.kind).toBe('tombstoned');

    await t.mutation(internal.mapFixtures.setSignatureTombstone, {
      mapId: MAP_A,
      systemId: 1,
      signatureId: 'ABC-123',
      deletedAt: null,
      purgeAfter: null,
    });
    const restored = await t.run((ctx) =>
      ctx.db
        .query('mapSignatures')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ABC-123'),
        )
        .unique(),
    );
    expect(restored).toMatchObject({
      group: 'wormhole',
      typeName: null,
      wormholeTypeCode: null,
      deletedAt: null,
      purgeAfter: null,
    });
    expect(restored?._id).toBe(before?._id);

    // Bounded cleanup: 129 expired + one active survivor.
    const now = 2_000_000_000_000;
    await t.run(async (ctx) => {
      for (let i = 0; i < SIGNATURE_TOMBSTONE_DELETE_CAP + 1; i += 1) {
        await ctx.db.insert('mapSignatures', {
          mapId: MAP_A,
          systemId: 1,
          signatureId: `OLD-${i}`,
          group: null,
          typeName: null,
          wormholeTypeCode: null,
          deletedAt: now - 100_000 - i,
          purgeAfter: now - 1_000 - i,
        });
      }
      await ctx.db.insert('mapSignatures', {
        mapId: MAP_A,
        systemId: 1,
        signatureId: 'ACTIVE',
        group: null,
        typeName: null,
        wormholeTypeCode: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });

    const firstPurge = await t.mutation(
      internal.mapFixtures.purgeExpiredSignatureTombstones,
      { now },
    );
    expect(firstPurge).toEqual({
      deletedCount: SIGNATURE_TOMBSTONE_DELETE_CAP,
      hasMore: true,
    });

    // Exactly 128 remaining expired → hasMore false.
    await t.run(async (ctx) => {
      const remaining = await ctx.db
        .query('mapSignatures')
        .withIndex('by_purge_after', (q) =>
          q.gt('purgeAfter', null).lte('purgeAfter', now),
        )
        .collect();
      // Drain to exactly 128 for the next assertion when more than one remained.
      while (remaining.length > SIGNATURE_TOMBSTONE_DELETE_CAP) {
        const extra = remaining.pop();
        if (extra) await ctx.db.delete(extra._id);
      }
    });

    // Ensure exactly 128 expired remain for the false case.
    await t.run(async (ctx) => {
      const expired = await ctx.db
        .query('mapSignatures')
        .withIndex('by_purge_after', (q) =>
          q.gt('purgeAfter', null).lte('purgeAfter', now),
        )
        .collect();
      for (const row of expired) await ctx.db.delete(row._id);
      for (let i = 0; i < SIGNATURE_TOMBSTONE_DELETE_CAP; i += 1) {
        await ctx.db.insert('mapSignatures', {
          mapId: MAP_A,
          systemId: 1,
          signatureId: `EXACT-${i}`,
          group: null,
          typeName: null,
          wormholeTypeCode: null,
          deletedAt: now - 50_000,
          purgeAfter: now - 10,
        });
      }
    });

    const exactPurge = await t.mutation(
      internal.mapFixtures.purgeExpiredSignatureTombstones,
      { now },
    );
    expect(exactPurge).toEqual({
      deletedCount: SIGNATURE_TOMBSTONE_DELETE_CAP,
      hasMore: false,
    });

    const activeSurvives = await t.run((ctx) =>
      ctx.db
        .query('mapSignatures')
        .withIndex('by_map_signature', (q) =>
          q.eq('mapId', MAP_A).eq('systemId', 1).eq('signatureId', 'ACTIVE'),
        )
        .unique(),
    );
    expect(activeSurvives).not.toBeNull();

    const cleanupSource = readFileSync(
      join(import.meta.dirname, 'lib/mapSignatureCleanup.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(cleanupSource.match(/\.query\('mapSignatures'\)/g)).toHaveLength(1);
    expect(cleanupSource).not.toMatch(/mapSignatureActivity/);
    expect(cleanupSource).not.toMatch(/db\.get/);
  });
});
