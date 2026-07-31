// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { ConvexError } from 'convex/values';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import {
  MAP_FIXTURE_PAGE_SIZE,
  MAP_SIGNATURE_ACTIVITY_STALE_MS,
} from './mapFixtures';
import mapFixtureSource from './mapFixtures.ts?raw';
import { purgeExpiredSignatureTombstones as cleanupCore } from './lib/mapSignatureCleanup';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);
const MAP_A = 'map-a';
const MAP_B = 'map-b';
const EDITOR = 'editor-user';
const VIEWER = 'viewer-user';
const NOW = 1_800_000_000_000;

type Harness = TestConvex<typeof schema>;

afterEach(() => {
  vi.useRealTimers();
});

function harness(): Harness {
  return convexTest(schema, modules);
}

async function seedClaim(
  t: Harness,
  mapId: string,
  userId: string,
  roles: ('viewer' | 'editor' | 'owner')[],
): Promise<void> {
  await t.run((ctx) => ctx.db.insert('mapAccess', { mapId, userId, roles }));
}

async function seedSystem(
  t: Harness,
  mapId: string,
  systemId: number,
): Promise<Id<'mapSystems'>> {
  return t.run((ctx) => ctx.db.insert('mapSystems', { mapId, systemId }));
}

function asUser(t: Harness, userId = EDITOR) {
  return t.withIdentity({ subject: userId });
}

async function expectCode(
  promise: Promise<unknown>,
  code: 'UNAUTHENTICATED' | 'FORBIDDEN',
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ code: string }>).data).toEqual({ code });
    return;
  }
  throw new Error(`Expected ${code}.`);
}

async function readSignature(
  t: Harness,
  mapId = MAP_A,
  systemId = 31_000_001,
  signatureId = 'ABC-123',
) {
  return t.run((ctx) =>
    ctx.db
      .query('mapSignatures')
      .withIndex('by_map_signature', (q) =>
        q
          .eq('mapId', mapId)
          .eq('systemId', systemId)
          .eq('signatureId', signatureId),
      )
      .unique(),
  );
}

describe('map chain schema and fixtures', () => {
  it('keeps the indexed entity census and repeated system upsert singular', async () => {
    const t = harness();
    await seedClaim(t, MAP_A, EDITOR, ['editor']);

    const first = await asUser(t).mutation(api.mapFixtures.upsertSystem, {
      mapId: MAP_A,
      systemId: 31_000_001,
    });
    const second = await asUser(t).mutation(api.mapFixtures.upsertSystem, {
      mapId: MAP_A,
      systemId: 31_000_001,
    });
    expect(second).toBe(first);

    await t.run(async (ctx) => {
      expect(
        await ctx.db
          .query('mapAccess')
          .withIndex('by_map_user', (q) =>
            q.eq('mapId', MAP_A).eq('userId', EDITOR),
          )
          .unique(),
      ).not.toBeNull();
      expect(
        await ctx.db
          .query('mapSystems')
          .withIndex('by_map_system', (q) =>
            q.eq('mapId', MAP_A).eq('systemId', 31_000_001),
          )
          .collect(),
      ).toHaveLength(1);
      expect(
        await ctx.db
          .query('mapConnections')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      ).toEqual([]);
      expect(
        await ctx.db
          .query('mapSignatures')
          .withIndex('by_purge_after', (q) =>
            q.gt('purgeAfter', null).lte('purgeAfter', NOW),
          )
          .collect(),
      ).toEqual([]);
      expect(
        await ctx.db
          .query('mapNotes')
          .withIndex('by_map_target', (q) =>
            q.eq('mapId', MAP_A).eq('targetKind', 'map'),
          )
          .collect(),
      ).toEqual([]);
      expect(
        await ctx.db
          .query('mapSignatureActivity')
          .withIndex('by_map_signature', (q) =>
            q
              .eq('mapId', MAP_A)
              .eq('systemId', 31_000_001)
              .eq('signatureId', 'ABC-123'),
          )
          .unique(),
      ).toBeNull();
    });
  });

  it('round-trips connection and signature state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = harness();
    const systemA = await seedSystem(t, MAP_A, 31_000_001);
    await seedSystem(t, MAP_A, 31_000_002);
    const foreignSystem = await seedSystem(t, MAP_B, 31_000_003);

    const connectionId = await t.mutation(
      internal.mapFixtures.insertConnectionFixture,
      {
        mapId: MAP_A,
        fromSystemId: 31_000_001,
        toSystemId: 31_000_002,
        wormholeTypeCode: 'B274',
        massState: 'reduced',
        shipSize: 'L',
        eolAt: NOW + 3_600_000,
      },
    );
    await expect(
      t.mutation(internal.mapFixtures.insertConnectionFixture, {
        mapId: MAP_A,
        fromSystemId: 31_000_001,
        toSystemId: 31_000_003,
        wormholeTypeCode: 'B274',
        massState: 'stable',
        shipSize: null,
        eolAt: null,
      }),
    ).rejects.toThrow('same map');
    await expect(
      t.mutation(internal.mapFixtures.insertConnectionFixture, {
        mapId: MAP_A,
        fromSystemId: 31_000_001,
        toSystemId: 31_000_002,
        wormholeTypeCode: 'unknown',
        massState: 'stable',
        shipSize: null,
        eolAt: null,
      }),
    ).rejects.toThrow('canonical');
    await expect(
      t.mutation(internal.mapFixtures.insertConnectionFixture, {
        mapId: MAP_A,
        fromSystemId: 31_000_001,
        toSystemId: 31_000_002,
        wormholeTypeCode: null,
        massState: 'stable',
        shipSize: null,
        eolAt: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow('finite');
    await expect(
      t.mutation(internal.mapFixtures.insertConnectionFixture, {
        mapId: MAP_A,
        fromSystemId: 31_000_001,
        toSystemId: 31_000_001,
        wormholeTypeCode: null,
        massState: 'stable',
        shipSize: null,
        eolAt: null,
      }),
    ).rejects.toThrow('distinct');

    const inserted = await t.mutation(
      internal.mapFixtures.upsertSignatureObservation,
      {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: ' abc-123 ',
        knowledge: {
          group: 'wormhole',
          typeName: null,
          wormholeTypeCode: null,
        },
      },
    );
    expect(inserted.status).toBe('inserted');
    const enriched = await t.mutation(
      internal.mapFixtures.upsertSignatureObservation,
      {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: 'ABC-123',
        knowledge: {
          group: 'wormhole',
          typeName: 'Unstable Wormhole',
          wormholeTypeCode: 'K162',
        },
      },
    );
    expect(enriched.status).toBe('enriched');
    expect(
      await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: 'ABC-123',
        knowledge: {
          group: 'wormhole',
          typeName: 'Unstable Wormhole',
          wormholeTypeCode: 'K162',
        },
      }),
    ).toMatchObject({ status: 'unchanged' });
    expect(
      await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: 'ABC-123',
        knowledge: {
          group: 'wormhole',
          typeName: 'Conflicting Name',
          wormholeTypeCode: 'B274',
        },
      }),
    ).toMatchObject({ status: 'conflict' });

    const signature = await readSignature(t);
    expect(signature).toMatchObject({
      group: 'wormhole',
      typeName: 'Unstable Wormhole',
      wormholeTypeCode: 'K162',
      deletedAt: null,
      purgeAfter: null,
    });
    expect(signature).not.toHaveProperty('systemName');
    expect(signature).not.toHaveProperty('systemClass');
    expect(signature).not.toHaveProperty('effect');
    expect(signature).not.toHaveProperty('totalMass');

    const mapNote = await t.mutation(internal.mapFixtures.insertNoteFixture, {
      mapId: MAP_A,
      targetKind: 'map',
      targetId: MAP_A,
      body: 'Map note',
    });
    const systemNote = await t.mutation(
      internal.mapFixtures.insertNoteFixture,
      {
        mapId: MAP_A,
        targetKind: 'system',
        targetId: systemA,
        body: 'System note',
      },
    );
    const signatureNote = await t.mutation(
      internal.mapFixtures.insertNoteFixture,
      {
        mapId: MAP_A,
        targetKind: 'signature',
        targetId: inserted.signatureDocId,
        body: 'Signature note',
      },
    );
    expect([mapNote, systemNote, signatureNote]).toHaveLength(3);
    await expect(
      t.mutation(internal.mapFixtures.insertNoteFixture, {
        mapId: MAP_A,
        targetKind: 'system',
        targetId: foreignSystem,
        body: 'Cross-map note',
      }),
    ).rejects.toThrow('same map');
    await expect(
      t.mutation(internal.mapFixtures.insertNoteFixture, {
        mapId: MAP_A,
        targetKind: 'signature',
        targetId: foreignSystem,
        body: 'Wrong target kind',
      }),
    ).rejects.toThrow('same map');
    await expect(
      t.mutation(internal.mapFixtures.insertNoteFixture, {
        mapId: MAP_A,
        targetKind: 'map',
        targetId: MAP_B,
        body: 'Wrong map target',
      }),
    ).rejects.toThrow('equal its map ID');

    const connection = await t.run((ctx) => ctx.db.get(connectionId));
    expect(connection).toMatchObject({
      wormholeTypeCode: 'B274',
      massState: 'reduced',
      shipSize: 'L',
      eolAt: NOW + 3_600_000,
    });
    expect(connection).not.toHaveProperty('systemName');
    expect(connection).not.toHaveProperty('totalMass');
  });

  it('gates every public fixture and isolates maps', async () => {
    const t = harness();
    await seedClaim(t, MAP_A, VIEWER, ['viewer']);
    await seedClaim(t, MAP_A, EDITOR, ['viewer', 'editor']);

    const gateFirstHandlers = mapFixtureSource.match(
      /handler: async \(ctx, args\) => \{\s+await requireMapAccess\(ctx, args\.mapId, '(?:view|edit)'\);/g,
    );
    expect(gateFirstHandlers).toHaveLength(2);

    await expectCode(
      t.query(api.mapFixtures.readMapCollection, {
        mapId: MAP_A,
        collection: 'systems',
        cursor: null,
      }),
      'UNAUTHENTICATED',
    );
    await expectCode(
      asUser(t, VIEWER).mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_A,
        systemId: 31_000_001,
      }),
      'FORBIDDEN',
    );
    await expectCode(
      asUser(t, EDITOR).query(api.mapFixtures.readMapCollection, {
        mapId: MAP_B,
        collection: 'systems',
        cursor: null,
      }),
      'FORBIDDEN',
    );

    await t.run(async (ctx) => {
      for (let index = 0; index < MAP_FIXTURE_PAGE_SIZE + 5; index += 1) {
        await ctx.db.insert('mapSystems', {
          mapId: MAP_A,
          systemId: 31_000_000 + index,
        });
        await ctx.db.insert('mapConnections', {
          mapId: MAP_A,
          fromSystemId: 31_000_000 + index,
          toSystemId: 32_000_000 + index,
          wormholeTypeCode: null,
          massState: 'stable',
          shipSize: null,
          eolAt: null,
        });
        await ctx.db.insert('mapSignatures', {
          mapId: MAP_A,
          systemId: 31_000_000 + index,
          signatureId: `SIG-${index}`,
          group: null,
          typeName: null,
          wormholeTypeCode: null,
          deletedAt: null,
          purgeAfter: null,
        });
        await ctx.db.insert('mapNotes', {
          mapId: MAP_A,
          targetKind: 'map',
          targetId: MAP_A,
          body: `Note ${index}`,
        });
      }
      await ctx.db.insert('mapSystems', { mapId: MAP_B, systemId: 99_999_999 });
    });

    for (const collection of [
      'systems',
      'connections',
      'signatures',
      'notes',
    ] as const) {
      let cursor: string | null = null;
      let done = false;
      const rows: { mapId: string }[] = [];
      while (!done) {
        const result: {
          page: { mapId: string }[];
          continueCursor: string;
          isDone: boolean;
        } = await asUser(t).query(
          api.mapFixtures.readMapCollection,
          { mapId: MAP_A, collection, cursor },
        );
        rows.push(...result.page);
        cursor = result.continueCursor;
        done = result.isDone;
      }
      expect(rows).toHaveLength(MAP_FIXTURE_PAGE_SIZE + 5);
      expect(rows.every((row) => row.mapId === MAP_A)).toBe(true);
    }
  });

  it('keeps bookkeeping off payload documents', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = harness();
    await seedSystem(t, MAP_A, 31_000_001);
    const inserted = await t.mutation(
      internal.mapFixtures.upsertSignatureObservation,
      {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: 'ABC-123',
        knowledge: {
          group: 'wormhole',
          typeName: 'Unstable Wormhole',
          wormholeTypeCode: null,
        },
      },
    );
    const before = await readSignature(t);

    vi.setSystemTime(NOW + MAP_SIGNATURE_ACTIVITY_STALE_MS - 1);
    expect(
      await t.mutation(internal.mapFixtures.recordSignatureSeen, {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: 'ABC-123',
      }),
    ).toEqual({ status: 'unchanged' });
    expect(await readSignature(t)).toEqual(before);

    vi.setSystemTime(NOW + MAP_SIGNATURE_ACTIVITY_STALE_MS);
    expect(
      await t.mutation(internal.mapFixtures.recordSignatureSeen, {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: 'ABC-123',
      }),
    ).toEqual({ status: 'updated' });
    expect(await readSignature(t)).toEqual(before);

    await t.mutation(internal.mapFixtures.setSignatureTombstone, {
      signatureDocId: inserted.signatureDocId,
      deletedAt: NOW + 1,
      purgeAfter: NOW + 10_000,
    });
    expect(
      await t.mutation(internal.mapFixtures.upsertSignatureObservation, {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: 'ABC-123',
        knowledge: {
          group: 'wormhole',
          typeName: 'Replacement',
          wormholeTypeCode: 'B274',
        },
      }),
    ).toMatchObject({ status: 'tombstoned' });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('mapSignatureActivity')
          .withIndex('by_map_signature', (q) =>
            q
              .eq('mapId', MAP_A)
              .eq('systemId', 31_000_001)
              .eq('signatureId', 'ABC-123'),
          )
          .unique(),
      ),
    ).toBeNull();
    expect(
      await t.mutation(internal.mapFixtures.recordSignatureSeen, {
        mapId: MAP_A,
        systemId: 31_000_001,
        signatureId: 'ABC-123',
      }),
    ).toEqual({ status: 'ignored' });
    await t.mutation(internal.mapFixtures.setSignatureTombstone, {
      signatureDocId: inserted.signatureDocId,
      deletedAt: null,
      purgeAfter: null,
    });
    expect(await readSignature(t)).toEqual(before);

    await t.run(async (ctx) => {
      for (let index = 0; index < 129; index += 1) {
        await ctx.db.insert('mapSignatures', {
          mapId: MAP_A,
          systemId: 32_000_000 + index,
          signatureId: `OLD-${index}`,
          group: null,
          typeName: null,
          wormholeTypeCode: null,
          deletedAt: NOW - 2,
          purgeAfter: NOW - 1,
        });
      }
      await ctx.db.insert('mapSignatures', {
        mapId: MAP_A,
        systemId: 33_000_000,
        signatureId: 'ACTIVE',
        group: null,
        typeName: null,
        wormholeTypeCode: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });
    expect(
      await t.mutation(
        internal.mapFixtures.purgeExpiredSignatureTombstones,
        { now: NOW },
      ),
    ).toEqual({ deletedCount: 128, hasMore: true });
    expect(
      await t.mutation(
        internal.mapFixtures.purgeExpiredSignatureTombstones,
        { now: NOW },
      ),
    ).toEqual({ deletedCount: 1, hasMore: false });
    await t.run(async (ctx) => {
      for (let index = 0; index < 128; index += 1) {
        await ctx.db.insert('mapSignatures', {
          mapId: MAP_A,
          systemId: 34_000_000 + index,
          signatureId: `EXACT-${index}`,
          group: null,
          typeName: null,
          wormholeTypeCode: null,
          deletedAt: NOW - 2,
          purgeAfter: NOW - 1,
        });
      }
    });
    expect(
      await t.mutation(
        internal.mapFixtures.purgeExpiredSignatureTombstones,
        { now: NOW },
      ),
    ).toEqual({ deletedCount: 128, hasMore: false });
    expect(
      await t.run((ctx) =>
        ctx.db
          .query('mapSignatures')
          .withIndex('by_map_signature', (q) =>
            q
              .eq('mapId', MAP_A)
              .eq('systemId', 33_000_000)
              .eq('signatureId', 'ACTIVE'),
          )
          .unique(),
      ),
    ).not.toBeNull();

    const cleanupSource = cleanupCore.toString();
    expect(cleanupSource.match(/query\(['"]mapSignatures['"]\)/g)).toHaveLength(
      1,
    );
    expect(cleanupSource).not.toContain('mapSignatureActivity');
    expect(cleanupSource).not.toContain('db.get');
  });
});
