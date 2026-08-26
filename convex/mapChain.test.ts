// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest, type TestConvex } from 'convex-test';
import type { PaginationResult } from 'convex/server';
import { ConvexError } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { MAP_EVENT_READ_LIMIT } from './mapChainEvents';
import { MAP_CHAIN_MAX_PAGE_SIZE } from './mapChainPage';
import { FIXTURE_CONNECTION_SCAN_LIMIT } from './lib/mapConnectionLookup';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import { connectionInsert } from './__tests__/connection-doc.setup';


const chain = {
  watchMapAccess: api.mapChainAccess.watchMapAccess,
  watchMapSystems: api.mapChainSystems.watchMapSystems,
  watchMapConnections: api.mapChainConnections.watchMapConnections,
  watchUnresolvedHoles: api.mapChainConnections.watchUnresolvedHoles,
  watchMapEvents: api.mapChainEvents.watchMapEvents,
} as const;

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
  roles: ('viewer' | 'editor' | 'admin')[],
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId, userId, roles });
  });
}

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
    return await ctx.db.insert('mapConnections', connectionInsert({
      mapId,
      fromSystemId,
      toSystemId,
      wormholeTypeCode: null,
      massState: 'stable',
      shipSize: 'M',
    }));
  });
}

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
  describe('gate', () => {
    it.each(
      (
        ['watchMapSystems', 'watchMapConnections', 'watchUnresolvedHoles'] as const
      ).flatMap((fn) =>
        (
          [
            ['a signed-out caller', undefined],
            ['a caller holding no claim', STRANGER],
          ] as const
        ).map(([label, subject]) => ({ fn, label, subject })),
      ),
    )('serves $label of $fn an empty, complete page', async ({ fn, subject }) => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await placeSystems(t, MAP_A, [JITA]);
      await connect(t, MAP_A, JITA, AMARR);

      const result = await (subject === undefined
        ? t.query(chain[fn], { mapId: MAP_A, paginationOpts: page(10) })
        : asUser(t, subject).query(chain[fn], {
            mapId: MAP_A,
            paginationOpts: page(10),
          }));

      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it.each([
      ['a signed-out caller', undefined],
      ['a caller holding no claim', STRANGER],
    ] as const)('reports access as not granted for %s', async (_label, subject) => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);

      const result = await (subject === undefined
        ? t.query(chain.watchMapAccess, { mapId: MAP_A })
        : asUser(t, subject).query(chain.watchMapAccess, { mapId: MAP_A }));

      expect(result).toEqual({ granted: false, canEdit: false });
    });

    it.each([
      ['a signed-out caller', undefined],
      ['a caller holding no claim', STRANGER],
    ] as const)('serves %s an empty event ledger', async (_label, subject) => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await t.run(async (ctx) => {
        await ctx.db.insert('mapEvents', {
          mapId: MAP_A,
          at: 1,
          kind: 'connection_severed_retained',
          actor: 'Editor',
          payload: { connectionId: 'connection-1' },
          purgeAfter: 2,
        });
      });

      const events = await (subject === undefined
        ? t.query(chain.watchMapEvents, { mapId: MAP_A })
        : asUser(t, subject).query(chain.watchMapEvents, { mapId: MAP_A }));
      expect(events).toEqual([]);
    });

    it('reports granted access for a viewer and canEdit for an editor', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, VIEWER, ['viewer']);
      await grant(t, MAP_A, EDITOR, ['editor']);

      expect(
        await asUser(t, VIEWER).query(chain.watchMapAccess, { mapId: MAP_A }),
      ).toEqual({ granted: true, canEdit: false });
      expect(await asUser(t).query(chain.watchMapAccess, { mapId: MAP_A })).toEqual({
        granted: true,
        canEdit: true,
      });
    });

    it('gives a viewer disjoint resolved and unresolved connection feeds', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, VIEWER, ['viewer']);
      await placeSystems(t, MAP_A, [JITA, AMARR]);
      await connect(t, MAP_A, JITA, AMARR);
      const unresolved = await t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
        mapId: MAP_A,
        fromSystemId: JITA,
        fromSignatureId: 'ABC-123',
      });

      const systems = await asUser(t, VIEWER).query(chain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });
      const connections = await asUser(t, VIEWER).query(chain.watchMapConnections, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });
      const holes = await asUser(t, VIEWER).query(chain.watchUnresolvedHoles, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });

      expect(systems.page).toHaveLength(2);
      expect(connections.page).toHaveLength(1);
      expect(connections.page[0]?.toSystemId).toBe(AMARR);
      expect(holes.page).toEqual([
        expect.objectContaining({
          _id: unresolved.connectionId,
          fromSystemId: JITA,
          toSystemId: null,
          from: expect.objectContaining({ signatureId: 'ABC-123' }),
        }),
      ]);
    });

    it('flips access off on revocation and restores rows when the claim returns', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await placeSystems(t, MAP_A, [JITA]);

      const before = await asUser(t).query(chain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(10),
      });
      expect(before.page).toHaveLength(1);
      expect(await asUser(t).query(chain.watchMapAccess, { mapId: MAP_A })).toEqual({
        granted: true,
        canEdit: true,
      });

      await revokeClaim(t, MAP_A, EDITOR);

      expect(await asUser(t).query(chain.watchMapAccess, { mapId: MAP_A })).toEqual({
        granted: false,
        canEdit: false,
      });
      expect(
        (await asUser(t).query(chain.watchMapSystems, {
          mapId: MAP_A,
          paginationOpts: page(10),
        })).page,
      ).toEqual([]);

      await grant(t, MAP_A, EDITOR, ['editor']);

      expect(await asUser(t).query(chain.watchMapAccess, { mapId: MAP_A })).toEqual({
        granted: true,
        canEdit: true,
      });
      expect(
        (await asUser(t).query(chain.watchMapSystems, {
          mapId: MAP_A,
          paginationOpts: page(10),
        })).page,
      ).toHaveLength(1);
    });
  });

  describe('reads', () => {
    it('returns only the requested map’s rows', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, EDITOR, ['editor']);
      await grant(t, MAP_B, EDITOR, ['editor']);
      await placeSystems(t, MAP_A, [JITA]);
      await placeSystems(t, MAP_B, [AMARR]);
      await connect(t, MAP_B, AMARR, AMARR + 1);

      const systems = await asUser(t).query(chain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(50),
      });
      const connections = await asUser(t).query(chain.watchMapConnections, {
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
        const result: PaginationResult<Doc<'mapSystems'>> = await asUser(t).query(
          chain.watchMapSystems,
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

      const result = await asUser(t).query(chain.watchMapSystems, {
        mapId: MAP_A,
        paginationOpts: page(MAP_CHAIN_MAX_PAGE_SIZE * 5),
      });

      expect(result.page).toHaveLength(MAP_CHAIN_MAX_PAGE_SIZE);
      expect(result.isDone).toBe(false);
    });

    it('reads only one map event range, newest-first and bounded', async () => {
      const t = convexTest(schema, modules);
      await grant(t, MAP_A, VIEWER, ['viewer']);
      await t.run(async (ctx) => {
        for (let at = 0; at < MAP_EVENT_READ_LIMIT + 2; at += 1) {
          await ctx.db.insert('mapEvents', {
            mapId: MAP_A,
            at,
            kind: 'connection_severed_retained',
            actor: 'Editor',
            payload: { connectionId: `connection-${at}` },
            purgeAfter: at + 10_000,
          });
        }
        await ctx.db.insert('mapEvents', {
          mapId: MAP_B,
          at: MAP_EVENT_READ_LIMIT + 100,
          kind: 'connection_severed_retained',
          actor: 'Other map',
          payload: { connectionId: 'other-map' },
          purgeAfter: MAP_EVENT_READ_LIMIT + 10_000,
        });
      });

      const events = await asUser(t, VIEWER).query(chain.watchMapEvents, {
        mapId: MAP_A,
      });
      expect(events).toHaveLength(MAP_EVENT_READ_LIMIT);
      expect(events[0]?.at).toBe(MAP_EVENT_READ_LIMIT + 1);
      expect(events.at(-1)?.at).toBe(2);
      expect(events.every((event) => event.mapId === MAP_A)).toBe(true);
    });
  });

  describe('removal fixtures', () => {
    it('removes an unreferenced system and reports the removal', async () => {
      const t = convexTest(schema, modules);
      await placeSystems(t, MAP_A, [JITA]);

      const outcome = await t.mutation(internal.mapFixtureRemove.removeSystemFixture, {
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

      const outcome = await t.mutation(internal.mapFixtureRemove.removeSystemFixture, {
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
        t.mutation(internal.mapFixtureRemove.removeSystemFixture, {
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
          await ctx.db.insert('mapConnections', connectionInsert({
            mapId: MAP_A,
            fromSystemId: AMARR + index,
            toSystemId: AMARR + index + 1,
            wormholeTypeCode: null,
            massState: 'stable',
            shipSize: 'M',
          }));
        }
      });

      await expectErrorCode(
        t.mutation(internal.mapFixtureRemove.removeSystemFixture, {
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

      const first = await t.mutation(internal.mapFixtureRemove.removeConnectionFixture, {
        connectionId,
      });
      const second = await t.mutation(internal.mapFixtureRemove.removeConnectionFixture, {
        connectionId,
      });

      expect(first).toBe('removed');
      expect(second).toBe('unchanged');
    });
  });

  describe('source contract', () => {
    const ACCESS = readFileSync('convex/mapChainAccess.ts', 'utf8');
    const SYSTEMS = readFileSync('convex/mapChainSystems.ts', 'utf8');
    const CONNECTIONS = readFileSync('convex/mapChainConnections.ts', 'utf8');
    const EVENTS = readFileSync('convex/mapChainEvents.ts', 'utf8');

    const CHAIN_TABLES = [
      'mapAccess',
      'mapSystems',
      'mapConnections',
      'mapEvents',
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

    function dense(code: string): string {
      return code.replace(/\s+/g, '');
    }

    function handlerCode(source: string, name: string): string {
      const start = source.indexOf(`export const ${name} = query({`);
      expect(start, `${name} must be a public query`).toBeGreaterThanOrEqual(0);
      const rest = source.slice(start);
      const end = rest.indexOf('\n});');
      expect(end, `${name} must be a closed declaration`).toBeGreaterThan(0);
      return codeOnly(rest.slice(0, end));
    }

    function helperCode(source: string, startMarker: string, endMarker: string): string {
      const start = source.indexOf(startMarker);
      const end = source.indexOf(endMarker, start);
      expect(start, `${startMarker} must exist`).toBeGreaterThanOrEqual(0);
      expect(end, `${endMarker} must follow ${startMarker}`).toBeGreaterThan(start);
      return codeOnly(source.slice(start, end));
    }

    it.each([
      { source: SYSTEMS, fn: 'watchMapSystems', helper: 'readSystemPage' },
      {
        source: CONNECTIONS,
        fn: 'watchMapConnections',
        helper: 'readConnectionPage',
        mode: 'resolved',
      },
      {
        source: CONNECTIONS,
        fn: 'watchUnresolvedHoles',
        helper: 'readConnectionPage',
        mode: 'unresolved',
      },
    ])('pins $fn to its owned page helper', ({ source, fn, helper, mode }) => {
      const code = dense(handlerCode(source, fn));

      expect(countOccurrences(code, `${helper}(ctx,mapId,paginationOpts`)).toBe(1);
      if (mode !== undefined) expect(code).toContain(`'${mode}'`);
      expect(code, `${fn} must not read the database directly`).not.toContain('ctx.db');
    });

    it('pins the gated helpers to their disjoint indexed ranges', () => {
      const systems = dense(
        helperCode(SYSTEMS, 'async function readSystemPage', 'export const watchMapSystems'),
      );
      const connections = dense(
        helperCode(
          CONNECTIONS,
          'async function readConnectionPage',
          'export const watchMapConnections',
        ),
      );

      expect(countOccurrences(systems, "ctx.db.query('mapSystems')")).toBe(1);
      expect(systems).toContain("withIndex('by_map'");
      expect(countOccurrences(systems, '.paginate(')).toBe(1);
      expect(systems.indexOf('tryMapAccess')).toBeLessThan(systems.indexOf('ctx.db.query'));

      expect(countOccurrences(connections, "ctx.db.query('mapConnections')")).toBe(2);
      expect(countOccurrences(connections, "withIndex('by_map_to'")).toBe(2);
      expect(connections).toContain("gt('toSystemId',null)");
      expect(connections).toContain("eq('toSystemId',null)");
      expect(connections.indexOf('tryMapAccess')).toBeLessThan(connections.indexOf('ctx.db.query'));

      for (const code of [systems, connections]) {
        expect(code).toContain('deniedPage');
        expect(code).not.toContain('db.get');
        expect(code).not.toContain('.collect(');
        expect(code).not.toContain('throw');
      }
    });

    it('keeps the access authority off the chain tables entirely', () => {
      const code = dense(handlerCode(ACCESS, 'watchMapAccess'));

      for (const table of CHAIN_TABLES) {
        expect(code, `watchMapAccess must not query ${table}`).not.toContain(
          `ctx.db.query('${table}')`,
        );
      }
      expect(code).toContain('tryMapAccess');
    });

    it('pins the event ledger to one bounded newest-first indexed read', () => {
      const code = dense(handlerCode(EVENTS, 'watchMapEvents'));

      expect(countOccurrences(code, "ctx.db.query('mapEvents')")).toBe(1);
      expect(code).toContain("withIndex('by_map'");
      expect(code).toContain(".order('desc')");
      expect(code).toContain('.take(MAP_EVENT_READ_LIMIT)');
      expect(code).toContain('tryMapAccess');
      expect(code).not.toContain('.collect(');
      for (const table of CHAIN_TABLES.filter((name) => name !== 'mapEvents')) {
        expect(code, `watchMapEvents must not query ${table}`).not.toContain(
          `ctx.db.query('${table}')`,
        );
      }
    });
  });
});
