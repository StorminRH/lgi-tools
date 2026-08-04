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

/** Deletes one caller's claim, the durable revocation the projection performs. */
async function revokeClaim(t: Chain, mapId: string, userId: string): Promise<void> {
  await t.run(async (ctx) => {
    const claim = await ctx.db
      .query('mapAccess')
      .withIndex('by_map_user', (q) => q.eq('mapId', mapId).eq('userId', userId))
      .unique();
    if (claim !== null) await ctx.db.delete(claim._id);
  });
}

describe('map chain read path', () => {
  // ── Gate-first authorization ───────────────────────────────────────────────
  describe('gate', () => {
    // The chain reads answer a denial with an empty page rather than a throw, because a thrown error
    // inside a live subscription is an uncaught error in the client's socket callback rather than a
    // state the UI can simply render. `watchMapAccess` is the authority on revoked-versus-empty.
    it.each(['watchMapSystems', 'watchMapConnections'] as const)(
      'serves a signed-out caller of %s an empty, complete page and no rows',
      async (fn) => {
        const t = convexTest(schema, modules);
        await grant(t, MAP_A, EDITOR, ['editor']);
        await placeSystems(t, MAP_A, [JITA]);
        await connect(t, MAP_A, JITA, AMARR);

        const result = await t.query(api.mapChain[fn], {
          mapId: MAP_A,
          paginationOpts: page(10),
        });

        expect(result.page).toEqual([]);
        expect(result.isDone).toBe(true);
      },
    );

    it.each(['watchMapSystems', 'watchMapConnections'] as const)(
      'serves a caller holding no claim an empty page for %s',
      async (fn) => {
        const t = convexTest(schema, modules);
        await grant(t, MAP_A, EDITOR, ['editor']);
        await placeSystems(t, MAP_A, [JITA]);
        await connect(t, MAP_A, JITA, AMARR);

        const result = await asUser(t, STRANGER).query(api.mapChain[fn], {
          mapId: MAP_A,
          paginationOpts: page(10),
        });

        expect(result.page).toEqual([]);
        expect(result.isDone).toBe(true);
      },
    );

    it.each([
      ['a signed-out caller', undefined],
      ['a caller holding no claim', STRANGER],
    ] as const)('reports access as not granted for %s', async (_label, subject) => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);

      const result = await (subject === undefined
        ? t.query(api.mapChain.watchMapAccess, { mapId: MAP_A })
        : asUser(t, subject).query(api.mapChain.watchMapAccess, { mapId: MAP_A }));

      expect(result).toEqual({ granted: false, canEdit: false });
    });

    it('reports access as granted for a viewer without edit', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, VIEWER, ['viewer']);

      const result = await asUser(t, VIEWER).query(api.mapChain.watchMapAccess, {
        mapId: MAP_A,
      });

      expect(result).toEqual({ granted: true, canEdit: false });
    });

    it('reports canEdit for an editor', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);

      const result = await asUser(t).query(api.mapChain.watchMapAccess, {
        mapId: MAP_A,
      });

      expect(result).toEqual({ granted: true, canEdit: true });
    });

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

    // SC-4 · DC-4 / AC-4 — the server half of the calm no-access state, with no error path.
    it('flips access to not granted after claim revocation, without throwing', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await placeSystems(t, MAP_A, [JITA]);

      const before = await asUser(t).query(api.mapChain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });
      const accessBefore = await asUser(t).query(api.mapChain.watchMapAccess, {
        mapId: MAP_A,
      });
      expect(before.page).toHaveLength(1);
      expect(accessBefore).toEqual({ granted: true, canEdit: true });

      await revokeClaim(t, MAP_A, EDITOR);

      const accessAfter = await asUser(t).query(api.mapChain.watchMapAccess, {
        mapId: MAP_A,
      });
      const after = await asUser(t).query(api.mapChain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });

      expect(accessAfter).toEqual({ granted: false, canEdit: false });
      expect(after.page).toEqual([]);
    });

    // Recovery is live: re-granting the claim restores the map with no reload and no user action.
    it('restores access and rows when the claim is granted again', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await placeSystems(t, MAP_A, [JITA]);
      await revokeClaim(t, MAP_A, EDITOR);

      await grant(t, MAP_A, EDITOR, ['editor']);

      const access = await asUser(t).query(api.mapChain.watchMapAccess, {
        mapId: MAP_A,
      });
      const systems = await asUser(t).query(api.mapChain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });

      expect(access).toEqual({ granted: true, canEdit: true });
      expect(systems.page).toHaveLength(1);
    });

    it('never reads a chain row for a caller holding no claim', async () => {
      const t = convexTest(schema, modules);
      await placeSystems(t, MAP_A, [JITA, AMARR]);
      await connect(t, MAP_A, JITA, AMARR);

      // No claim was ever granted: both collections must come back empty despite holding rows.
      const systems = await asUser(t, STRANGER).query(api.mapChain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(100),
      });
      const connections = await asUser(t, STRANGER).query(
        api.mapChain.watchMapConnections,
        { mapId: MAP_A, paginationOpts: page(100) },
      );

      expect(systems.page).toEqual([]);
      expect(connections.page).toEqual([]);
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

    /** Whitespace-stripped code, so a formatter's line breaks cannot hide a chained call. */
    function dense(code: string): string {
      return code.replace(/\s+/g, '');
    }

    function handlerCode(name: string): string {
      const start = SOURCE.indexOf(`export const ${name} = query({`);
      expect(start, `${name} must be a public query`).toBeGreaterThanOrEqual(0);
      const rest = SOURCE.slice(start);
      const end = rest.indexOf('\n});');
      expect(end, `${name} must be a closed declaration`).toBeGreaterThan(0);
      return codeOnly(rest.slice(0, end));
    }

    /** The one shared body every chain subscription flows through. */
    function helperCode(): string {
      const start = SOURCE.indexOf('async function readChainPage');
      expect(start, 'readChainPage must exist').toBeGreaterThanOrEqual(0);
      const rest = SOURCE.slice(start);
      const end = rest.indexOf('\n}');
      expect(end, 'readChainPage must be a closed declaration').toBeGreaterThan(0);
      return codeOnly(rest.slice(0, end));
    }

    // HC-2's deterministic evidence, in two halves. Read-set tracking is per-execution, so the
    // handler's table literal plus a helper that reads nothing but that parameter table proves a
    // connection patch cannot overlap the systems read set — without observing a deployment.
    it.each([
      { fn: 'watchMapSystems', table: 'mapSystems' },
      { fn: 'watchMapConnections', table: 'mapConnections' },
    ])('pins $fn to exactly its own $table read', ({ fn, table }) => {
      const code = dense(handlerCode(fn));

      expect(countOccurrences(code, `readChainPage(ctx,'${table}'`)).toBe(1);
      for (const other of CHAIN_TABLES.filter((name) => name !== table)) {
        expect(code, `${fn} must not name ${other}`).not.toContain(`'${other}'`);
      }
      // The handler delegates and does nothing else database-shaped itself.
      expect(code, `${fn} must not read the database directly`).not.toContain('ctx.db');
    });

    it('pins the shared page reader to one gated dynamic read and nothing else', () => {
      const code = dense(helperCode());

      // Exactly one database read, and it is the caller's parameter table via the by_map index.
      expect(countOccurrences(code, 'ctx.db.query(chainTable)')).toBe(1);
      expect(countOccurrences(code, 'ctx.db.')).toBe(1);
      expect(countOccurrences(code, '.paginate(')).toBe(1);
      expect(code).toContain("withIndex('by_map'");
      expect(code, 'the helper must not point-read a document').not.toContain('db.get');
      // No table literal may be hard-wired inside the shared body: an added read here would land in
      // every chain subscription at once.
      for (const table of CHAIN_TABLES) {
        expect(code, `readChainPage must not hard-code ${table}`).not.toContain(`'${table}'`);
      }
    });

    it('resolves access before touching a chain table in the shared reader', () => {
      const code = dense(helperCode());
      const gateAt = code.indexOf('tryMapAccess');
      const readAt = code.indexOf('ctx.db.query');

      expect(gateAt).toBeGreaterThanOrEqual(0);
      expect(readAt).toBeGreaterThan(gateAt);
    });

    it('returns an empty page instead of throwing when access is absent', () => {
      // The whole point of the shape: a live subscription reports a denial as a value, so a
      // revocation is a state the UI renders rather than an error in the client's socket callback.
      const code = helperCode();

      expect(code).toContain('=== null) return deniedPage');
      expect(code, 'the shared reader must not throw').not.toContain('throw ');
    });

    it('keeps the access authority off the chain tables entirely', () => {
      const code = dense(handlerCode('watchMapAccess'));

      for (const table of CHAIN_TABLES) {
        expect(code, `watchMapAccess must not query ${table}`).not.toContain(
          `ctx.db.query('${table}')`,
        );
      }
      expect(code).toContain('tryMapAccess');
    });
  });
});
