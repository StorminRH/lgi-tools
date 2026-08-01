// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest, type TestConvex } from 'convex-test';
import type { PaginationResult } from 'convex/server';
import { ConvexError } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { MAP_CHAIN_MAX_PAGE_SIZE } from './mapChain';
import { FIXTURE_CONNECTION_SCAN_LIMIT } from './mapFixtures';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const MAP_A = 'map-a';
const MAP_B = 'map-b';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';
const STRANGER = 'user-stranger';

const JITA = 30_000_142;
const AMARR = 30_002_187;

type Chain = TestConvex<typeof schema>;

function asUser(t: Chain, userId = EDITOR) {
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

/** Places systems directly: these suites prove the READ path, so seeding stays out of the way. */
async function placeSystems(t: Chain, mapId: string, systemIds: number[]): Promise<void> {
  await t.run(async (ctx) => {
    for (const systemId of systemIds) {
      await ctx.db.insert('mapSystems', { mapId, systemId });
    }
  });
}

async function connect(
  t: Chain,
  mapId: string,
  fromSystemId: number,
  toSystemId: number,
): Promise<Id<'mapConnections'>> {
  return await t.run(async (ctx) => {
    return await ctx.db.insert('mapConnections', {
      mapId,
      fromSystemId,
      toSystemId,
      wormholeTypeCode: null,
      massState: 'stable',
      shipSize: 'M',
      eolAt: null,
    });
  });
}

/**
 * Asserts the rejection carries the exact ConvexError data code, not merely a matching message.
 *
 * Only `code` is asserted: it is the machine-readable half of the contract that clients branch on
 * (the calm no-access state keys off `FORBIDDEN`), while `detail` is operator prose some fixture
 * errors add and no consumer parses.
 */
async function expectErrorCode(call: Promise<unknown>, code: string): Promise<void> {
  try {
    await call;
    expect.unreachable(`expected ConvexError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<{ code: string }>).data.code).toBe(code);
  }
}

function page(numItems: number, cursor: string | null = null) {
  return { numItems, cursor };
}

describe('map chain read path', () => {
  // ── Gate-first authorization ───────────────────────────────────────────────
  describe('gate', () => {
    it.each(['watchMapSystems', 'watchMapConnections'] as const)(
      'rejects a signed-out caller of %s',
      async (fn) => {
        const t = convexTest(schema, modules);
        await grant(t, MAP_A, EDITOR, ['editor']);
        await expectErrorCode(
          t.query(api.mapChain[fn], { mapId: MAP_A, paginationOpts: page(10) }),
          'UNAUTHENTICATED',
        );
      },
    );

    it.each(['watchMapSystems', 'watchMapConnections'] as const)(
      'rejects a signed-in caller holding no claim on the map for %s',
      async (fn) => {
        const t = convexTest(schema, modules);
        await grant(t, MAP_A, EDITOR, ['editor']);
        await expectErrorCode(
          asUser(t, STRANGER).query(api.mapChain[fn], {
            mapId: MAP_A,
            paginationOpts: page(10),
          }),
          'FORBIDDEN',
        );
      },
    );

    it('lets a viewer watch both collections', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, VIEWER, ['viewer']);
      await placeSystems(t, MAP_A, [JITA, AMARR]);
      await connect(t, MAP_A, JITA, AMARR);

      const systems = await asUser(t, VIEWER).query(api.mapChain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });
      const connections = await asUser(t, VIEWER).query(api.mapChain.watchMapConnections, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });

      expect(systems.page).toHaveLength(2);
      expect(connections.page).toHaveLength(1);
    });

    // SC-4 · DC-4 / AC-4 — the server half of the calm no-access state.
    it('flips a previously succeeding watch to FORBIDDEN after claim revocation', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await placeSystems(t, MAP_A, [JITA]);

      const before = await asUser(t).query(api.mapChain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });
      expect(before.page).toHaveLength(1);

      await t.run(async (ctx) => {
        const claim = await ctx.db
          .query('mapAccess')
          .withIndex('by_map_user', (q) => q.eq('mapId', MAP_A).eq('userId', EDITOR))
          .unique();
        if (claim !== null) await ctx.db.delete(claim._id);
      });

      await expectErrorCode(
        asUser(t).query(api.mapChain.watchMapSystems, {
          mapId: MAP_A,
          paginationOpts: page(10),
        }),
        'FORBIDDEN',
      );
    });
  });

  // ── Map isolation and pagination ───────────────────────────────────────────
  describe('reads', () => {
    it('returns only the requested map’s rows', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await grant(t, MAP_B, EDITOR, ['editor']);
      await placeSystems(t, MAP_A, [JITA]);
      await placeSystems(t, MAP_B, [AMARR]);
      await connect(t, MAP_B, AMARR, AMARR + 1);

      const systems = await asUser(t).query(api.mapChain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(50),
      });
      const connections = await asUser(t).query(api.mapChain.watchMapConnections, {
        mapId: MAP_A,
        paginationOpts: page(50),
      });

      expect(systems.page.map((row) => row.systemId)).toEqual([JITA]);
      expect(connections.page).toHaveLength(0);
    });

    it('continues a multi-page systems read across real cursors', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      const seeded = [JITA, JITA + 1, JITA + 2, JITA + 3, JITA + 4];
      await placeSystems(t, MAP_A, seeded);

      const collected: number[] = [];
      let cursor: string | null = null;
      let pages = 0;

      for (;;) {
        // Annotated because `cursor` is fed back from the result: without it TypeScript treats the
        // page type as circular through its own initializer.
        const result: PaginationResult<Doc<'mapSystems'>> = await asUser(t).query(
          api.mapChain.watchMapSystems,
          { mapId: MAP_A, paginationOpts: page(2, cursor) },
        );
        collected.push(...result.page.map((row) => row.systemId));
        pages += 1;
        if (result.isDone) break;
        cursor = result.continueCursor;
        expect(pages).toBeLessThan(10);
      }

      expect(collected.toSorted((a, b) => a - b)).toEqual(seeded);
      expect(pages).toBeGreaterThan(1);
    });

    it('clamps an oversized requested page to the maximum', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await placeSystems(
        t,
        MAP_A,
        Array.from({ length: MAP_CHAIN_MAX_PAGE_SIZE + 5 }, (_, index) => JITA + index),
      );

      const result = await asUser(t).query(api.mapChain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(MAP_CHAIN_MAX_PAGE_SIZE * 5),
      });

      expect(result.page).toHaveLength(MAP_CHAIN_MAX_PAGE_SIZE);
      expect(result.isDone).toBe(false);
    });
  });

  // ── Departure seams ───────────────────────────────────────────────────────
  describe('removal fixtures', () => {
    it('removes an unreferenced system and reports the removal', async () => {
      const t = convexTest(schema, modules);
      await placeSystems(t, MAP_A, [JITA]);

      const outcome = await t.mutation(internal.mapFixtures.removeSystemFixture, {
        mapId: MAP_A,
        systemId: JITA,
      });

      expect(outcome).toBe('removed');
      const remaining = await t.run(async (ctx) =>
        await ctx.db
          .query('mapSystems')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(remaining).toHaveLength(0);
    });

    it('reports unchanged and writes nothing for a system that is not on the map', async () => {
      const t = convexTest(schema, modules);
      await placeSystems(t, MAP_A, [JITA]);

      const outcome = await t.mutation(internal.mapFixtures.removeSystemFixture, {
        mapId: MAP_A,
        systemId: AMARR,
      });

      expect(outcome).toBe('unchanged');
      const remaining = await t.run(async (ctx) =>
        await ctx.db
          .query('mapSystems')
          .withIndex('by_map', (q) => q.eq('mapId', MAP_A))
          .collect(),
      );
      expect(remaining.map((row) => row.systemId)).toEqual([JITA]);
    });

    it('refuses to remove a system a connection still references', async () => {
      const t = convexTest(schema, modules);
      await placeSystems(t, MAP_A, [JITA, AMARR]);
      await connect(t, MAP_A, JITA, AMARR);

      await expectErrorCode(
        t.mutation(internal.mapFixtures.removeSystemFixture, {
          mapId: MAP_A,
          systemId: AMARR,
        }),
        'SYSTEM_IN_USE',
      );
    });

    it('fails closed rather than scanning an oversized map', async () => {
      const t = convexTest(schema, modules);
      await placeSystems(t, MAP_A, [JITA]);
      await t.run(async (ctx) => {
        for (let index = 0; index <= FIXTURE_CONNECTION_SCAN_LIMIT; index += 1) {
          await ctx.db.insert('mapConnections', {
            mapId: MAP_A,
            fromSystemId: AMARR + index,
            toSystemId: AMARR + index + 1,
            wormholeTypeCode: null,
            massState: 'stable',
            shipSize: 'M',
            eolAt: null,
          });
        }
      });

      await expectErrorCode(
        t.mutation(internal.mapFixtures.removeSystemFixture, {
          mapId: MAP_A,
          systemId: JITA,
        }),
        'FIXTURE_MAP_TOO_LARGE',
      );
    });

    it('removes a connection once and reports unchanged on a repeat', async () => {
      const t = convexTest(schema, modules);
      await placeSystems(t, MAP_A, [JITA, AMARR]);
      const connectionId = await connect(t, MAP_A, JITA, AMARR);

      const first = await t.mutation(internal.mapFixtures.removeConnectionFixture, {
        connectionId,
      });
      const second = await t.mutation(internal.mapFixtures.removeConnectionFixture, {
        connectionId,
      });

      expect(first).toBe('removed');
      expect(second).toBe('unchanged');
    });
  });

  // ── SC-6 · DC-6 / AC-6 / V-2 ──────────────────────────────────────────────
  //
  // The deterministic half of the subscription-split proof. Convex reactivity is read-set-precise,
  // so if each handler's CODE touches exactly one chain table through one indexed range, a write to
  // the other table provably cannot overlap this handler's read set. That is a structural argument
  // about the source rather than an observation of a running deployment, which is what AC-6 asks
  // for. Comments are stripped first: prose naming a table creates no read set.
  describe('source contract', () => {
    const SOURCE = readFileSync('convex/mapChain.ts', 'utf8');

    const CHAIN_TABLES = [
      'mapAccess',
      'mapSystems',
      'mapConnections',
      'mapSignatures',
      'mapNotes',
      'mapSignatureActivity',
    ] as const;

    function codeOnly(source: string): string {
      return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    }

    function countOccurrences(haystack: string, needle: string): number {
      return haystack.split(needle).length - 1;
    }

    function handlerCode(name: string): string {
      const start = SOURCE.indexOf(`export const ${name} = query({`);
      expect(start, `${name} must be a public query`).toBeGreaterThanOrEqual(0);
      const rest = SOURCE.slice(start);
      const end = rest.indexOf('\n});');
      expect(end, `${name} must be a closed declaration`).toBeGreaterThan(0);
      return codeOnly(rest.slice(0, end));
    }

    it.each([
      { fn: 'watchMapSystems', table: 'mapSystems' },
      { fn: 'watchMapConnections', table: 'mapConnections' },
    ])('pins $fn to exactly one indexed $table range', ({ fn, table }) => {
      const code = handlerCode(fn);

      expect(countOccurrences(code, `'${table}'`)).toBe(1);
      for (const other of CHAIN_TABLES.filter((name) => name !== table)) {
        expect(code, `${fn} must not reference ${other}`).not.toContain(`'${other}'`);
      }

      expect(countOccurrences(code, '.paginate(')).toBe(1);
      expect(code).toContain("withIndex('by_map'");
      expect(code, `${fn} must not point-read a document`).not.toContain('db.get');
    });

    it.each(['watchMapSystems', 'watchMapConnections'])(
      'calls requireMapAccess before touching a chain table in %s',
      (fn) => {
        const code = handlerCode(fn);
        const gateAt = code.indexOf('requireMapAccess');
        const readAt = code.indexOf('ctx.db');

        expect(gateAt).toBeGreaterThanOrEqual(0);
        expect(readAt).toBeGreaterThan(gateAt);
      },
    );
  });
});
