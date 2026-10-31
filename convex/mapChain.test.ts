// @vitest-environment edge-runtime
import { readFileSync } from 'node:fs';
import { convexTest } from 'convex-test';
import type { PaginationResult } from 'convex/server';
import { expect, it } from 'vitest';
import { stripComments } from '@/lib/__tests__/source-scan';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { MAP_EVENT_READ_LIMIT } from './mapChainEvents';
import { MAP_CHAIN_MAX_PAGE_SIZE } from './lib/pagination';
import { MAP_CONNECTION_SIGNATURE_SCAN_LIMIT } from './lib/mapConnectionLookup';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import { connectionInsert } from './__tests__/connection-doc.setup';
import { expectConvexErrorCode, grantMapAccess, type Chain } from './__tests__/convexTest.setup';

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

function asUser(t: Chain, userId = EDITOR) {
  return t.withIdentity({ subject: userId });
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

it('serves signed-out and unclaimed callers an empty chain, denied access, and no events', async () => {
  for (const subject of [undefined, STRANGER]) {
    const t = convexTest(schema, modules);
    await grantMapAccess(t, MAP_A, EDITOR, ['editor']);
    await placeSystems(t, MAP_A, [JITA]);
    await connect(t, MAP_A, JITA, AMARR);
    await t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
      mapId: MAP_A,
      fromSystemId: JITA,
      fromSignatureId: 'ABC-123',
    });
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
    const caller = subject === undefined ? t : asUser(t, subject);

    for (const fn of ['watchMapSystems', 'watchMapConnections', 'watchUnresolvedHoles'] as const) {
      const result = await caller.query(chain[fn], { mapId: MAP_A, paginationOpts: page(10) });
      expect(result.page, `${fn} for ${subject ?? 'signed out'}`).toEqual([]);
      expect(result.isDone).toBe(true);
    }
    expect(await caller.query(chain.watchMapAccess, { mapId: MAP_A }))
      .toEqual({ granted: false, canEdit: false, trackableCharacterIds: null });
    expect(await caller.query(chain.watchMapEvents, { mapId: MAP_A })).toEqual([]);
  }
});

it('reports granted access for a viewer and canEdit for an editor', async () => {
  const t = convexTest(schema, modules);
  await grantMapAccess(t, MAP_A, VIEWER, ['viewer']);
  await grantMapAccess(t, MAP_A, EDITOR, ['editor']);

  expect(
    await asUser(t, VIEWER).query(chain.watchMapAccess, { mapId: MAP_A }),
  ).toEqual({ granted: true, canEdit: false, trackableCharacterIds: null });
  expect(await asUser(t).query(chain.watchMapAccess, { mapId: MAP_A })).toEqual({
    granted: true,
    canEdit: true,
    trackableCharacterIds: null,
  });
});

it('gives a viewer disjoint resolved and unresolved connection feeds', async () => {
  const t = convexTest(schema, modules);
  await grantMapAccess(t, MAP_A, VIEWER, ['viewer']);
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

it('returns tombstoned unresolved rows as slot holders', async () => {
  const t = convexTest(schema, modules);
  await grantMapAccess(t, MAP_A, EDITOR, ['editor']);
  await grantMapAccess(t, MAP_A, VIEWER, ['viewer']);
  await placeSystems(t, MAP_A, [JITA]);
  const unresolved = await t.mutation(internal.mapFixtureHoles.upsertUnresolvedHole, {
    mapId: MAP_A,
    fromSystemId: JITA,
    fromSignatureId: 'ABC-123',
  });
  await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneConnection, {
    mapId: MAP_A,
    connectionId: unresolved.connectionId,
  });

  const holes = await asUser(t, VIEWER).query(chain.watchUnresolvedHoles, {
    mapId: MAP_A,
    paginationOpts: page(10),
  });
  expect(holes.page).toEqual([
    expect.objectContaining({
      _id: unresolved.connectionId,
      toSystemId: null,
      tombstone: expect.objectContaining({ kind: 'removed' }),
    }),
  ]);
});

it('flips access off on revocation and restores rows when the claim returns', async () => {
  const t = convexTest(schema, modules);
  await grantMapAccess(t, MAP_A, EDITOR, ['editor']);
  await placeSystems(t, MAP_A, [JITA]);

  const before = await asUser(t).query(chain.watchMapSystems, {
    mapId: MAP_A,
    paginationOpts: page(10),
  });
  expect(before.page).toHaveLength(1);
  expect(await asUser(t).query(chain.watchMapAccess, { mapId: MAP_A })).toEqual({
    granted: true,
    canEdit: true,
    trackableCharacterIds: null,
  });

  await revokeClaim(t, MAP_A, EDITOR);

  expect(await asUser(t).query(chain.watchMapAccess, { mapId: MAP_A })).toEqual({
    granted: false,
    canEdit: false,
    trackableCharacterIds: null,
  });
  expect(
    (await asUser(t).query(chain.watchMapSystems, {
      mapId: MAP_A,
      paginationOpts: page(10),
    })).page,
  ).toEqual([]);

  await grantMapAccess(t, MAP_A, EDITOR, ['editor']);

  expect(await asUser(t).query(chain.watchMapAccess, { mapId: MAP_A })).toEqual({
    granted: true,
    canEdit: true,
    trackableCharacterIds: null,
  });
  expect(
    (await asUser(t).query(chain.watchMapSystems, {
      mapId: MAP_A,
      paginationOpts: page(10),
    })).page,
  ).toHaveLength(1);
});

it('returns only the requested map’s rows', async () => {
  const t = convexTest(schema, modules);
  await grantMapAccess(t, MAP_A, EDITOR, ['editor']);
  await grantMapAccess(t, MAP_B, EDITOR, ['editor']);
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
  await grantMapAccess(t, MAP_A, EDITOR, ['editor']);
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
  await grantMapAccess(t, MAP_A, EDITOR, ['editor']);
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
  await grantMapAccess(t, MAP_A, VIEWER, ['viewer']);
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

it('removes fixture systems and connections, refusing a referenced system', async () => {
  const t = convexTest(schema, modules);
  await placeSystems(t, MAP_A, [JITA, AMARR]);
  const connectionId = await connect(t, MAP_A, JITA, AMARR);
  const mapSystems = async () =>
    (await t.run((ctx) => ctx.db.query('mapSystems').withIndex('by_map', (q) => q.eq('mapId', MAP_A)).collect()))
      .map((row) => row.systemId);

  await expectConvexErrorCode(
    t.mutation(internal.mapFixtureRemove.removeSystemFixture, { mapId: MAP_A, systemId: AMARR }),
    'SYSTEM_IN_USE',
  );
  expect(await t.mutation(internal.mapFixtureRemove.removeSystemFixture, { mapId: MAP_A, systemId: AMARR + 1 }))
    .toBe('unchanged');
  expect(await mapSystems()).toEqual([JITA, AMARR]);

  expect(await t.mutation(internal.mapFixtureRemove.removeConnectionFixture, { connectionId })).toBe('removed');
  expect(await t.mutation(internal.mapFixtureRemove.removeConnectionFixture, { connectionId })).toBe('unchanged');

  expect(await t.mutation(internal.mapFixtureRemove.removeSystemFixture, { mapId: MAP_A, systemId: AMARR }))
    .toBe('removed');
  expect(await mapSystems()).toEqual([JITA]);
});

it('removes an unreferenced system even when the map already has many other doors', async () => {
  const t = convexTest(schema, modules);
  await placeSystems(t, MAP_A, [JITA]);
  await t.run(async (ctx) => {
    for (let index = 0; index <= MAP_CONNECTION_SIGNATURE_SCAN_LIMIT; index += 1) {
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

it('refuses to remove a system that still has many doors', async () => {
  const t = convexTest(schema, modules);
  await placeSystems(t, MAP_A, [JITA]);
  await t.run(async (ctx) => {
    for (let index = 0; index <= MAP_CONNECTION_SIGNATURE_SCAN_LIMIT; index += 1) {
      await ctx.db.insert('mapConnections', connectionInsert({
        mapId: MAP_A,
        fromSystemId: JITA,
        toSystemId: AMARR + index,
        wormholeTypeCode: null,
        massState: 'stable',
        shipSize: 'M',
      }));
    }
  });

  await expectConvexErrorCode(
    t.mutation(internal.mapFixtureRemove.removeSystemFixture, {
      mapId: MAP_A,
      systemId: JITA,
    }),
    'SYSTEM_IN_USE',
  );
});

it('keeps the access authority off the chain tables entirely', () => {
  const source = readFileSync('convex/mapChainAccess.ts', 'utf8');
  const start = source.indexOf('export const watchMapAccess = query({');
  expect(start, 'watchMapAccess must be a public query').toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  const code = stripComments(rest.slice(0, rest.indexOf('\n});'))).replace(/\s+/g, '');

  for (const table of [
    'mapAccess',
    'mapSystems',
    'mapConnections',
    'mapEvents',
    'mapSignatures',
    'mapNotes',
    'mapSignatureActivity',
  ]) {
    expect(code, `watchMapAccess must not query ${table}`).not.toContain(`ctx.db.query('${table}')`);
  }
  expect(code).toContain('tryMapAccess');
});
