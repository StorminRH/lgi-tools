// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { MAP_FIXTURE_PAGE_SIZE, SIGNATURE_PURGE_BATCH } from './mapFixtures';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const MAP_A = 'map-a';
const MAP_B = 'map-b';
const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';
const STRANGER = 'user-stranger';

const NOW = 1_800_000_000_000;
const JITA = 30_000_142;
const AMARR = 30_002_187;

type Chain = TestConvex<typeof schema>;

function asEditor(t: Chain, userId = EDITOR) {
  return t.withIdentity({ subject: userId });
}

async function grant(
  t: Chain,
  mapId: string,
  userId: string,
  roles: ('viewer' | 'editor' | 'owner')[],
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId, userId, roles });
  });
}

/** A map with an editor, a viewer, and one placed system — the common starting point. */
async function seedMap(t: Chain, mapId = MAP_A, systemId = JITA): Promise<void> {
  await grant(t, mapId, EDITOR, ['editor']);
  await grant(t, mapId, VIEWER, ['viewer']);
  await asEditor(t).mutation(api.mapFixtures.upsertSystem, { mapId, systemId });
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
  }> = {},
) {
  return t.mutation(internal.mapFixtures.upsertSignatureObservation, {
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

/** The fields every chain payload row shares, which is all a paging proof needs to see. */
interface ChainRow {
  readonly _id: string;
  readonly mapId: string;
}

/** One page of Convex's real pagination result, narrowed to what these proofs assert. */
interface ChainPage {
  readonly page: readonly ChainRow[];
  readonly isDone: boolean;
  readonly continueCursor: string;
}

/** Pages one collection to exhaustion the way a real caller must: one cursor, until isDone. */
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

async function expectConvexError(call: Promise<unknown>, code: string): Promise<void> {
  await expect(call).rejects.toThrow(code);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('map chain fixtures', () => {
  // ── SC-1 · DC-1 / AC-1 / V-1 ───────────────────────────────────────────────
  describe('defines every chain entity and keeps placement singular', () => {
    it('declares the exact chain table and index census', () => {
      // export() is the CLI's own schema serialization; it is not on the public type surface,
      // so the census reads it through an explicit structural cast rather than reimplementing it.
      const exported = JSON.parse((schema as unknown as { export(): string }).export()) as {
        tables: {
          tableName: string;
          indexes: { indexDescriptor: string; fields: string[] }[];
          documentType: { value?: Record<string, unknown> };
        }[];
      };
      const byName = new Map(exported.tables.map((table) => [table.tableName, table]));

      // HC-1: chain documents carry join keys and observation state only. Pinning the exact
      // stored field set is what makes a later "just cache the system name here" regression a
      // test failure rather than a silent I/O cost on every watched read.
      const expectedFields: Record<string, string[]> = {
        mapAccess: ['mapId', 'roles', 'userId'],
        mapSystems: ['mapId', 'systemId'],
        mapConnections: [
          'eolAt',
          'fromSystemId',
          'mapId',
          'massState',
          'shipSize',
          'toSystemId',
          'wormholeTypeCode',
        ],
        mapSignatures: [
          'deletedAt',
          'group',
          'mapId',
          'purgeAfter',
          'signatureId',
          'systemId',
          'typeName',
          'wormholeTypeCode',
        ],
        mapNotes: ['body', 'mapId', 'targetId', 'targetKind'],
        mapSignatureActivity: ['lastSeenAt', 'mapId', 'signatureId', 'systemId'],
      };

      for (const [tableName, fields] of Object.entries(expectedFields)) {
        const documentType = byName.get(tableName)?.documentType;
        expect(Object.keys(documentType?.value ?? {}).sort(), tableName).toEqual(fields);
      }

      const expected: Record<string, Record<string, string[]>> = {
        mapAccess: {
          by_map: ['mapId'],
          by_map_user: ['mapId', 'userId'],
          by_user: ['userId'],
        },
        mapSystems: {
          by_map: ['mapId'],
          by_map_system: ['mapId', 'systemId'],
        },
        mapConnections: { by_map: ['mapId'] },
        mapSignatures: {
          by_map: ['mapId'],
          by_map_signature: ['mapId', 'systemId', 'signatureId'],
          by_purge_after: ['purgeAfter'],
        },
        mapNotes: {
          by_map: ['mapId'],
          by_map_target: ['mapId', 'targetKind', 'targetId'],
        },
        mapSignatureActivity: {
          by_map: ['mapId'],
          by_map_signature: ['mapId', 'systemId', 'signatureId'],
        },
      };

      for (const [tableName, indexes] of Object.entries(expected)) {
        const table = byName.get(tableName);
        expect(table, `${tableName} is missing from the schema`).toBeDefined();
        const actual = Object.fromEntries(
          table!.indexes.map((index) => [
            index.indexDescriptor,
            index.fields.filter((field) => field !== '_creationTime'),
          ]),
        );
        expect(actual).toEqual(indexes);
      }
    });

    it('returns one document ID and writes one row for a repeated placement', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);

      const first = await asEditor(t).mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });
      const second = await asEditor(t).mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_A,
        systemId: JITA,
      });

      expect(second).toBe(first);
      const stored = await t.run(async (ctx) =>
        await ctx.db
          .query('mapSystems')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]!._creationTime).toBeDefined();
    });

    it('rejects a system ID that is not a positive safe integer', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await expectConvexError(
        asEditor(t).mutation(api.mapFixtures.upsertSystem, { mapId: MAP_A, systemId: 0 }),
        'INVALID_SYSTEM_ID',
      );
    });
  });

  // ── SC-2 · DC-2 / AC-2 / V-1 ───────────────────────────────────────────────
  describe('round-trips connection and signature state', () => {
    it('stores join keys and observation state only, with no codex facts', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await asEditor(t).mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_A,
        systemId: AMARR,
      });

      const eolAt = NOW + 3_600_000;
      await t.mutation(internal.mapFixtures.insertConnectionFixture, {
        mapId: MAP_A,
        fromSystemId: JITA,
        toSystemId: AMARR,
        wormholeTypeCode: 'C247',
        massState: 'reduced',
        shipSize: null,
        eolAt,
      });

      const [connection] = await t.run(async (ctx) =>
        await ctx.db
          .query('mapConnections')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );

      expect(connection).toMatchObject({
        mapId: MAP_A,
        fromSystemId: JITA,
        toSystemId: AMARR,
        wormholeTypeCode: 'C247',
        massState: 'reduced',
        shipSize: null,
        eolAt,
      });
      // Join keys and mutable observation state ONLY — no system name, class, effect, or
      // codex mass/lifetime fact may be copied into a chain document.
      expect(Object.keys(connection!).sort()).toEqual([
        '_creationTime',
        '_id',
        'eolAt',
        'fromSystemId',
        'mapId',
        'massState',
        'shipSize',
        'toSystemId',
        'wormholeTypeCode',
      ]);
    });

    it('stores an unidentified wormhole as a null code rather than a placeholder', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);

      await observe(t, { group: 'wormhole', typeName: 'Unstable Wormhole' });

      expect(await readSignature(t)).toMatchObject({
        group: 'wormhole',
        typeName: 'Unstable Wormhole',
        wormholeTypeCode: null,
        deletedAt: null,
        purgeAfter: null,
      });
    });

    it('enriches a null field, no-ops on equality, and preserves a conflict', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);

      expect(await observe(t, { group: 'wormhole' })).toEqual({ outcome: 'inserted' });

      // A later, better-resolved observation fills what was unknown.
      expect(
        await observe(t, { group: 'wormhole', wormholeTypeCode: 'C247' }),
      ).toEqual({ outcome: 'enriched', patch: { wormholeTypeCode: 'C247' } });
      expect(await readSignature(t)).toMatchObject({ wormholeTypeCode: 'C247' });

      // Repeating what the map already knows changes nothing.
      expect(
        await observe(t, { group: 'wormhole', wormholeTypeCode: 'C247' }),
      ).toEqual({ outcome: 'unchanged' });

      // A blank/unresolved value never erases stored knowledge.
      expect(await observe(t, { group: null, wormholeTypeCode: '   ' })).toEqual({
        outcome: 'unchanged',
      });
      expect(await readSignature(t)).toMatchObject({
        group: 'wormhole',
        wormholeTypeCode: 'C247',
      });

      // Two differing non-null values are a conflict for an explicit later correction path,
      // never a silent overwrite.
      expect(
        await observe(t, { group: 'wormhole', wormholeTypeCode: 'K162' }),
      ).toEqual({ outcome: 'conflict', fields: ['wormholeTypeCode'] });
      expect(await readSignature(t)).toMatchObject({ wormholeTypeCode: 'C247' });
    });

    it('accepts map, system, and signature note targets on the same map', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await observe(t, { group: 'wormhole' });

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
        await t.mutation(internal.mapFixtures.insertNoteFixture, {
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
      expect(notes.map((note) => note.targetKind).sort()).toEqual([
        'map',
        'signature',
        'system',
      ]);
    });

    it.each([
      {
        label: 'a self-loop connection',
        code: 'SELF_LOOP_CONNECTION',
        args: { fromSystemId: JITA, toSystemId: JITA, wormholeTypeCode: null },
      },
      {
        label: 'an unknown wormhole code',
        code: 'INVALID_WORMHOLE_CODE',
        args: { fromSystemId: JITA, toSystemId: AMARR, wormholeTypeCode: 'nope' },
      },
      {
        label: 'an endpoint that is not on the map',
        code: 'UNKNOWN_ENDPOINT',
        args: { fromSystemId: JITA, toSystemId: 30_009_999, wormholeTypeCode: null },
      },
      {
        label: 'a non-positive endpoint',
        code: 'INVALID_SYSTEM_ID',
        args: { fromSystemId: JITA, toSystemId: -1, wormholeTypeCode: null },
      },
      {
        label: 'a non-finite EOL timestamp',
        code: 'INVALID_TIMESTAMP',
        args: {
          fromSystemId: JITA,
          toSystemId: AMARR,
          wormholeTypeCode: null,
          eolAt: Number.POSITIVE_INFINITY,
        },
      },
    ])('rejects $label before any write', async ({ code, args }) => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await asEditor(t).mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_A,
        systemId: AMARR,
      });

      await expectConvexError(
        t.mutation(internal.mapFixtures.insertConnectionFixture, {
          mapId: MAP_A,
          massState: 'stable',
          shipSize: null,
          eolAt: null,
          ...args,
        }),
        code,
      );

      const stored = await t.run(async (ctx) => await ctx.db.query('mapConnections').collect());
      expect(stored).toHaveLength(0);
    });

    it('rejects a wormhole code without the wormhole group', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await expectConvexError(
        observe(t, { group: 'combat', wormholeTypeCode: 'C247' }),
        'INCOHERENT_SIGNATURE',
      );
      expect(await readSignature(t)).toBeNull();
    });

    it('rejects a note whose target belongs to another map', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await grant(t, MAP_B, EDITOR, ['editor']);
      const foreign = await asEditor(t).mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_B,
        systemId: AMARR,
      });

      await expectConvexError(
        t.mutation(internal.mapFixtures.insertNoteFixture, {
          mapId: MAP_A,
          targetKind: 'system',
          targetId: foreign as string,
          body: 'cross-map',
        }),
        'INVALID_NOTE_TARGET',
      );
      await expectConvexError(
        t.mutation(internal.mapFixtures.insertNoteFixture, {
          mapId: MAP_A,
          targetKind: 'map',
          targetId: MAP_B,
          body: 'wrong map',
        }),
        'INVALID_NOTE_TARGET',
      );
      expect(await t.run(async (ctx) => await ctx.db.query('mapNotes').collect())).toHaveLength(0);
    });

    it('rejects an observation for a system that is not on the map', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await expectConvexError(observe(t, { systemId: 30_009_999 }), 'UNKNOWN_SYSTEM');
    });

    it('rejects an unpaired or misordered tombstone', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await observe(t);

      for (const pair of [
        { deletedAt: NOW, purgeAfter: null },
        { deletedAt: NOW, purgeAfter: NOW - 1 },
      ]) {
        await expectConvexError(
          t.mutation(internal.mapFixtures.setSignatureTombstone, {
            mapId: MAP_A,
            systemId: JITA,
            signatureId: 'ABC-123',
            ...pair,
          }),
          'INVALID_TOMBSTONE',
        );
      }
      expect(await readSignature(t)).toMatchObject({ deletedAt: null, purgeAfter: null });
    });
  });

  // ── SC-3 · DC-3 / AC-3 / V-2 ───────────────────────────────────────────────
  describe('gates every public fixture and isolates maps', () => {
    it.each(['systems', 'connections', 'signatures', 'notes'] as const)(
      'rejects a signed-out %s read before any chain access',
      async (collection) => {
        const t = convexTest(schema, modules);
        await seedMap(t);
        await expectConvexError(
          t.query(api.mapFixtures.readMapCollection, {
            mapId: MAP_A,
            collection,
            cursor: null,
          }),
          'UNAUTHENTICATED',
        );
      },
    );

    it('rejects a signed-out mutation', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await expectConvexError(
        t.mutation(api.mapFixtures.upsertSystem, { mapId: MAP_A, systemId: AMARR }),
        'UNAUTHENTICATED',
      );
    });

    it('rejects a signed-in caller holding no claim on the map', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await expectConvexError(
        asEditor(t, STRANGER).query(api.mapFixtures.readMapCollection, {
          mapId: MAP_A,
          collection: 'systems',
          cursor: null,
        }),
        'FORBIDDEN',
      );
    });

    it('lets a viewer read but not mutate', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);

      const page = await asEditor(t, VIEWER).query(api.mapFixtures.readMapCollection, {
        mapId: MAP_A,
        collection: 'systems',
        cursor: null,
      });
      expect(page.page).toHaveLength(1);

      await expectConvexError(
        asEditor(t, VIEWER).mutation(api.mapFixtures.upsertSystem, {
          mapId: MAP_A,
          systemId: AMARR,
        }),
        'FORBIDDEN',
      );
    });

    it('unions capabilities across a multi-role claim', async () => {
      const t = convexTest(schema, modules);
      // Neon may match one user through several principals; the projected set keeps every
      // capability rather than collapsing to a display role.
      await grant(t, MAP_A, OWNER, ['owner', 'viewer']);
      await expect(
        asEditor(t, OWNER).mutation(api.mapFixtures.upsertSystem, {
          mapId: MAP_A,
          systemId: JITA,
        }),
      ).resolves.toBeDefined();
    });

    it('never returns another map’s rows', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await grant(t, MAP_B, EDITOR, ['editor']);
      await asEditor(t).mutation(api.mapFixtures.upsertSystem, {
        mapId: MAP_B,
        systemId: AMARR,
      });
      await t.run(async (ctx) => {
        await ctx.db.insert('mapConnections', {
          mapId: MAP_B,
          fromSystemId: JITA,
          toSystemId: AMARR,
          wormholeTypeCode: 'C247',
          massState: 'stable',
          shipSize: 'S',
          eolAt: null,
        });
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

      for (const collection of ['systems', 'connections', 'signatures', 'notes'] as const) {
        const page = await drain(t, collection);
        expect(page.rows.every((row) => row.mapId === MAP_A)).toBe(true);
        expect(page.rows.some((row) => row.mapId === MAP_B)).toBe(false);
      }
      expect((await drain(t, 'systems')).rows).toHaveLength(1);
      expect((await drain(t, 'connections')).rows).toHaveLength(0);
      expect((await drain(t, 'signatures')).rows).toHaveLength(0);
      expect((await drain(t, 'notes')).rows).toHaveLength(0);
    });

    it.each(['systems', 'connections', 'notes', 'signatures'] as const)(
      'reports a non-terminal %s cursor whose iteration yields the complete set',
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
                // Keep clear of seeded Jita/Amarr identities used elsewhere in this suite.
                systemId: 40_000_000 + i,
              });
            } else {
              await ctx.db.insert('mapConnections', {
                mapId: MAP_A,
                fromSystemId: JITA,
                toSystemId: 40_000_000 + i,
                wormholeTypeCode: null,
                massState: 'stable',
                shipSize: null,
                eolAt: null,
              });
            }
          }
        });

        // Each collection is paged by its own call, so a caller must drain each cursor
        // independently; a map above one page stays explicitly incomplete until it does.
        const drained = await drain(t, collection);
        expect(drained.sawNonTerminalCursor).toBe(true);
        expect(drained.pages).toBeGreaterThan(1);
        // seedMap already placed one system on MAP_A; connections/notes/signatures start empty.
        const expected =
          collection === 'systems' ? total + 1 : total;
        expect(drained.rows).toHaveLength(expected);
        expect(new Set(drained.rows.map((row) => row._id)).size).toBe(expected);
      },
    );
  });

  // ── SC-4 · DC-4 / AC-4 / V-3 ───────────────────────────────────────────────
  describe('keeps bookkeeping off payload documents', () => {
    it('performs no write for a sub-threshold sighting', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await observe(t);
      const before = await readActivity(t);

      vi.setSystemTime(NOW + 59_000);
      expect(
        await t.mutation(internal.mapFixtures.recordSignatureSeen, {
          mapId: MAP_A,
          systemId: JITA,
          signatureId: 'ABC-123',
        }),
      ).toBe('unchanged');
      expect(await readActivity(t)).toEqual(before);
    });

    it('leaves the payload document byte-identical across an elapsed sighting', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await observe(t, { group: 'wormhole', wormholeTypeCode: 'C247' });
      const payloadBefore = await readSignature(t);
      const activityBefore = await readActivity(t);

      vi.setSystemTime(NOW + 61_000);
      expect(
        await t.mutation(internal.mapFixtures.recordSignatureSeen, {
          mapId: MAP_A,
          systemId: JITA,
          signatureId: 'ABC-123',
        }),
      ).toBe('patched');

      // The watched payload — including _id and _creationTime — is untouched, so a
      // subscription to it cannot be invalidated by last-seen bookkeeping.
      expect(await readSignature(t)).toEqual(payloadBefore);
      const activityAfter = await readActivity(t);
      expect(activityAfter!.lastSeenAt).toBe(NOW + 61_000);
      expect(activityAfter!._id).toBe(activityBefore!._id);
    });

    it('restores the identical payload after a reversible tombstone', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await observe(t, { group: 'wormhole', typeName: 'Unstable Wormhole' });
      const before = await readSignature(t);
      expect(await readActivity(t)).not.toBeNull();

      await t.mutation(internal.mapFixtures.setSignatureTombstone, {
        mapId: MAP_A,
        systemId: JITA,
        signatureId: 'ABC-123',
        deletedAt: NOW,
        purgeAfter: NOW + 600_000,
      });

      // Tombstoning deletes the activity companion once, here — which is exactly what lets
      // bounded cleanup skip a per-row companion lookup later.
      expect(await readActivity(t)).toBeNull();

      // An ordinary observation must not resurrect a removed row, and writes no activity.
      expect(await observe(t, { group: 'wormhole' })).toEqual({ outcome: 'tombstoned' });
      expect(await readActivity(t)).toBeNull();

      await t.mutation(internal.mapFixtures.setSignatureTombstone, {
        mapId: MAP_A,
        systemId: JITA,
        signatureId: 'ABC-123',
        deletedAt: null,
        purgeAfter: null,
      });

      expect(await readSignature(t)).toEqual(before);
    });

    it.each([
      { extra: 1, expectedHasMore: true, label: 'above' },
      { extra: 0, expectedHasMore: false, label: 'exactly at' },
    ])(
      'deletes one bounded batch $label the cap and reports exact continuation',
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
          // Active rows and a not-yet-expired tombstone must both survive.
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

        const result = await t.mutation(internal.mapFixtures.purgeExpiredSignatureTombstones, {});
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
      },
    );

    it('leaves activity rows untouched when it purges their signatures', async () => {
      const t = convexTest(schema, modules);
      // The behavioural half of the cleanup's source contract: even with a companion row
      // present for every doomed signature, the purge must not look one up or delete one.
      await t.run(async (ctx) => {
        for (let i = 0; i < 3; i += 1) {
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
          await ctx.db.insert('mapSignatureActivity', {
            mapId: MAP_A,
            systemId: JITA,
            signatureId: `EXP-${i}`,
            lastSeenAt: NOW - 30_000,
          });
        }
      });

      const before = await t.run(async (ctx) =>
        await ctx.db.query('mapSignatureActivity').collect(),
      );
      const result = await t.mutation(internal.mapFixtures.purgeExpiredSignatureTombstones, {});
      expect(result).toEqual({ deletedCount: 3, hasMore: false });

      expect(await t.run(async (ctx) => await ctx.db.query('mapSignatures').collect())).toEqual([]);
      expect(await t.run(async (ctx) => await ctx.db.query('mapSignatureActivity').collect()))
        .toEqual(before);
    });

    it('writes nothing when a tombstone is already in its target state', async () => {
      const t = convexTest(schema, modules);
      await seedMap(t);
      await observe(t, { group: 'wormhole' });

      const tombstone = {
        mapId: MAP_A,
        systemId: JITA,
        signatureId: 'ABC-123',
        deletedAt: NOW,
        purgeAfter: NOW + 600_000,
      };
      await t.mutation(internal.mapFixtures.setSignatureTombstone, tombstone);
      const after = await readSignature(t);

      // A repeated tombstone, and a restore of an already-active row, must both be no-ops:
      // any write here fans the whole watched page back out to every subscriber.
      expect(await t.mutation(internal.mapFixtures.setSignatureTombstone, tombstone)).toEqual({
        tombstoned: true,
      });
      expect(await readSignature(t)).toEqual(after);

      await t.mutation(internal.mapFixtures.setSignatureTombstone, {
        ...tombstone,
        deletedAt: null,
        purgeAfter: null,
      });
      const restored = await readSignature(t);
      expect(
        await t.mutation(internal.mapFixtures.setSignatureTombstone, {
          ...tombstone,
          deletedAt: null,
          purgeAfter: null,
        }),
      ).toEqual({ tombstoned: false });
      expect(await readSignature(t)).toEqual(restored);
    });

    it.each([
      { label: 'a tombstoned signature', tombstone: true },
      { label: 'an unknown signature', tombstone: false },
    ])('records no activity for $label', async ({ tombstone }) => {
      const t = convexTest(schema, modules);
      await seedMap(t);

      if (tombstone) {
        await observe(t, { group: 'wormhole' });
        await t.mutation(internal.mapFixtures.setSignatureTombstone, {
          mapId: MAP_A,
          systemId: JITA,
          signatureId: 'ABC-123',
          deletedAt: NOW,
          purgeAfter: NOW + 600_000,
        });
      }

      // An unreclaimable activity row would otherwise be created here: the cleanup owner
      // deliberately never looks up a companion, so only the tombstone path deletes one.
      expect(
        await t.mutation(internal.mapFixtures.recordSignatureSeen, {
          mapId: MAP_A,
          systemId: JITA,
          signatureId: ' ABC-123 ',
        }),
      ).toBe('unchanged');
      expect(await readActivity(t)).toBeNull();
    });

  });
});
