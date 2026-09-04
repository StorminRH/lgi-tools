// @vitest-environment edge-runtime
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

import { modules } from './__tests__/modules.setup';
import {
  AMARR,
  JITA,
  MAP_A,
  NOW,
  WH_ROOT,
  asUser,
  installAuthoringTimers,
  restoreAuthoringTimers,
  seedEmpty,
  seedHome,
  seedJump,
  type Chain,
} from './__tests__/mapAuthoring.setup';

const SITE = 'https://app.test';
const ORIGIN = 31_000_001;
const DESTINATION = 31_000_002;
const CHARACTER = 90_000_001;
const JUMP_MAP = 'map-jump-statics';
const EDITOR = 'user-editor';
const TRACKER = 'user-tracker';

beforeEach(() => {
  installAuthoringTimers();
});

afterEach(() => {
  restoreAuthoringTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function scheduledStaticFetches(t: Chain) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query('_scheduled_functions').collect();
    return rows.filter((row) => row.name.includes('fetchSystemStatics'));
  });
}

function scheduledFetchSystemIds(rows: readonly { readonly args?: unknown }[]): number[] {
  return rows.flatMap((row) => {
    const payload = Array.isArray(row.args) ? row.args[0] : row.args;
    if (typeof payload !== 'object' || payload === null) return [];
    if (!('systemId' in payload) || typeof payload.systemId !== 'number') return [];
    return [payload.systemId];
  });
}

async function liveStaticRows(t: Chain, systemId: number) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query('mapConnections')
      .withIndex('by_map_from', (q) => q.eq('mapId', MAP_A).eq('fromSystemId', systemId))
      .collect();
    return rows.filter((row) => row.staticCode !== undefined);
  });
}

function stubStaticsFetch(handler: (systemId: number) => Response) {
  vi.stubEnv('SITE_URL', SITE);
  return vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      const match = /\/api\/universe\/statics\/(\d+)$/.exec(url);
      if (match === null) throw new Error(`unexpected url ${url}`);
      return handler(Number(match[1]));
    }),
  );
}

describe('map static placeholders', () => {
  it('inserts one row per static', async () => {
    const t = convexTest(schema, modules);
    await seedHome(t, WH_ROOT);
    const result = await t.mutation(internal.mapStatics.applyStaticPlaceholders, {
      mapId: MAP_A,
      systemId: WH_ROOT,
      codes: ['C247', 'C140'],
    });
    expect(result).toEqual({ inserted: 2 });
    const rows = await liveStaticRows(t, WH_ROOT);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.staticCode).sort()).toEqual(['C140', 'C247']);
    for (const row of rows) {
      expect(row.from.typeCode).toBe(row.staticCode);
      expect(row.from.signatureId).toBeNull();
      expect(row.toSystemId).toBeNull();
      expect(row.seatOrderAt).toBe(NOW);
      expect(row.identity).toEqual({ kind: 'typed', provenance: 'assumed' });
      expect(row.tombstone).toEqual({ kind: 'live' });
    }
  });

  it('is idempotent', async () => {
    const t = convexTest(schema, modules);
    await seedHome(t, WH_ROOT);
    const args = {
      mapId: MAP_A,
      systemId: WH_ROOT,
      codes: ['C247', 'C140'],
    };
    expect(await t.mutation(internal.mapStatics.applyStaticPlaceholders, args)).toEqual({
      inserted: 2,
    });
    expect(await t.mutation(internal.mapStatics.applyStaticPlaceholders, args)).toEqual({
      inserted: 0,
    });
    expect(await liveStaticRows(t, WH_ROOT)).toHaveLength(2);
  });

  it('inserts nothing for an empty code list', async () => {
    const t = convexTest(schema, modules);
    await seedHome(t, WH_ROOT);
    expect(
      await t.mutation(internal.mapStatics.applyStaticPlaceholders, {
        mapId: MAP_A,
        systemId: WH_ROOT,
        codes: [],
      }),
    ).toEqual({ inserted: 0 });
    expect(await liveStaticRows(t, WH_ROOT)).toEqual([]);
  });

  it('schedules on insert for setHomeSystem', async () => {
    const t = convexTest(schema, modules);
    await seedEmpty(t);
    await asUser(t).mutation(api.mapAuthoringHome.setHomeSystem, {
      mapId: MAP_A,
      systemId: WH_ROOT,
    });
    const scheduled = await scheduledStaticFetches(t);
    expect(scheduled).toHaveLength(1);
    expect(scheduledFetchSystemIds(scheduled)).toEqual([WH_ROOT]);
  });

  it('schedules on insert for addSystemFromNode', async () => {
    const t = convexTest(schema, modules);
    await seedHome(t);
    await asUser(t).mutation(api.mapAuthoringHome.addSystemFromNode, {
      mapId: MAP_A,
      fromSystemId: JITA,
      toSystemId: AMARR,
    });
    expect(scheduledFetchSystemIds(await scheduledStaticFetches(t))).toEqual([JITA, AMARR]);
  });

  it('schedules on insert for jump authoring', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('mapAccess', { mapId: JUMP_MAP, userId: EDITOR, roles: ['editor'] });
    });
    await t.mutation(internal.mapFixturePlace.placeSystemFixture, {
      mapId: JUMP_MAP,
      systemId: ORIGIN,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('mapTracking', {
        mapId: JUMP_MAP,
        userId: TRACKER,
        characterId: CHARACTER,
      });
      await ctx.db.insert('characterLocation', {
        userId: TRACKER,
        characterId: CHARACTER,
        solarSystemId: DESTINATION,
        stationId: null,
        structureId: null,
        shipTypeId: 587,
        prevSolarSystemId: ORIGIN,
        prevFresh: true,
        transitionObservedAt: NOW,
        observedAt: NOW,
        etagLocation: null,
        etagShip: null,
      });
    });
    await t.mutation(internal.mapJumpAuthoring.resolveJumpAuthoring, {
      userId: EDITOR,
      mapId: JUMP_MAP,
      characterId: CHARACTER,
      fromSolarSystemId: ORIGIN,
      toSolarSystemId: DESTINATION,
      transitionObservedAt: NOW,
      observedShipMassKg: 10_000_000,
      observationKey: 'observation-key',
      decision: { kind: 'insert', candidateIds: [], survivors: [] },
    });
    expect(scheduledFetchSystemIds(await scheduledStaticFetches(t))).toEqual([DESTINATION]);
  });

  it('schedules on insert for restoreSystem', async () => {
    const t = convexTest(schema, modules);
    await seedHome(t, WH_ROOT);
    await asUser(t).mutation(internal.mapAuthoringTombstone.tombstoneSystem, {
      mapId: MAP_A,
      systemId: WH_ROOT,
    });
    const afterTombstone = scheduledFetchSystemIds(await scheduledStaticFetches(t));
    expect(afterTombstone).toEqual([WH_ROOT]);
    await asUser(t).mutation(internal.mapAuthoringTombstone.restoreSystem, {
      mapId: MAP_A,
      systemId: WH_ROOT,
    });
    expect(scheduledFetchSystemIds(await scheduledStaticFetches(t))).toEqual([
      WH_ROOT,
      WH_ROOT,
    ]);
  });

  it('does not schedule when the destination is already live', async () => {
    const t = convexTest(schema, modules);
    await seedJump(t);
    const before = await scheduledStaticFetches(t);
    await asUser(t).mutation(api.mapAuthoringHome.addSystemFromNode, {
      mapId: MAP_A,
      fromSystemId: AMARR,
      toSystemId: JITA,
    });
    expect(await scheduledStaticFetches(t)).toHaveLength(before.length);
  });

  it('skips apply when fetch fails', async () => {
    const t = convexTest(schema, modules);
    await seedHome(t, WH_ROOT);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubStaticsFetch(() => new Response('nope', { status: 500 }));
    await t.action(internal.mapStatics.fetchSystemStatics, {
      mapId: MAP_A,
      systemId: WH_ROOT,
    });
    expect(await liveStaticRows(t, WH_ROOT)).toEqual([]);
    expect(warn.mock.calls.some((call) => String(call[0]).includes('static placeholders skipped')))
      .toBe(true);
  });

  it('skips apply when SITE_URL is missing', async () => {
    const t = convexTest(schema, modules);
    await seedHome(t, WH_ROOT);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await t.action(internal.mapStatics.fetchSystemStatics, {
      mapId: MAP_A,
      systemId: WH_ROOT,
    });
    expect(await liveStaticRows(t, WH_ROOT)).toEqual([]);
    expect(warn.mock.calls.some((call) => String(call[0]).includes('static placeholders skipped')))
      .toBe(true);
  });

  it('backfillStaticPlaceholders on a fixture map', async () => {
    const t = convexTest(schema, modules);
    await seedHome(t, WH_ROOT);
    stubStaticsFetch((systemId) => {
      if (systemId === WH_ROOT) {
        return Response.json({ statics: ['C247', 'C140'] });
      }
      return Response.json({ statics: [] });
    });
    const first = await t.action(internal.mapStatics.backfillStaticPlaceholders, {
      mapId: MAP_A,
    });
    expect(first).toMatchObject({ systems: 1, inserted: 2, hasMore: false });
    expect(typeof first.cursor).toBe('string');
    const rows = await liveStaticRows(t, WH_ROOT);
    expect(rows.map((row) => row.staticCode).sort()).toEqual(['C140', 'C247']);
    const second = await t.action(internal.mapStatics.backfillStaticPlaceholders, {
      mapId: MAP_A,
      cursor: first.cursor,
    });
    expect(second.inserted).toBe(0);
    expect(second.hasMore).toBe(false);
  });
});
