// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EveCharactersResponse } from '@/platform/auth/api-contract';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/platform/esi';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_locationsync_1';
const GEN = 1_700_000_000_000;
const SITE = 'https://app.test';
const EXP = new Date(Date.now() + 5_000).toUTCString();
const SYSTEM_A = 30_000_142;
const SYSTEM_B = 30_000_144;
const SHIP_A = 587;
const SHIP_B = 11_985;

const permissiveScoreboard = {
  async preDispatch() {
    return { effectiveRemaining: 1000, blockedRetryAfter: null, etag: null };
  },
  async budgetSnapshot() {
    return { effectiveRemaining: 1000, selfCount: 0, echo: null, source: 'process-local' as const };
  },
  async report() {},
  async getCachedBody() {
    return null;
  },
};

function jsonResponse(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

const RL = {
  ETag: 'loc1',
  Expires: EXP,
  'X-Ratelimit-Group': 'char-location',
  'X-Ratelimit-Limit': '600',
  'X-Ratelimit-Remaining': '599',
  'X-Ratelimit-Used': '1',
};

type Character = EveCharactersResponse['characters'][number];

function eligible(characterId = 101): Character {
  return {
    characterId,
    name: `Pilot ${characterId}`,
    hasRefreshToken: true,
    missingScopes: [],
    corporationId: null,
  };
}

function stubFetch(opts: {
  characters?: Character[];
  token?: () => Response;
  esi?: (url: string) => Response;
}) {
  const fn = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/internal/eve-characters')) {
      return jsonResponse({ characters: opts.characters ?? [eligible()] });
    }
    if (url.endsWith('/api/internal/eve-token')) {
      return (opts.token ?? (() => jsonResponse({ accessToken: 'tok' })))();
    }
    if (opts.esi) return opts.esi(url);
    throw new Error(`unexpected url ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.stubEnv('SITE_URL', SITE);
  vi.stubEnv('CONVEX_SERVICE_SECRET', 'secret');
  __setScoreboardForTests(permissiveScoreboard);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  __resetEsiGateForTests();
});

function subjectRow(overrides: Record<string, unknown> = {}) {
  return {
    dataset: 'characterLocation' as const,
    userId: USER,
    status: 'running' as const,
    lastRequestedAt: GEN,
    workId: 'w1',
    nextDueAt: GEN + 30_000,
    minExpiresAt: null,
    syncedCharacterIds: [] as number[],
    lastFinishedAt: null,
    lastError: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    rlUsed: null,
    ...overrides,
  };
}

async function seedSubject(t: TestConvex<typeof schema>, overrides?: Record<string, unknown>) {
  await t.run(async (ctx) => {
    await ctx.db.insert('syncSubjects', subjectRow(overrides));
  });
}

async function seedTracking(t: TestConvex<typeof schema>, characterId = 101) {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapTracking', {
      mapId: 'map-a',
      userId: USER,
      characterId,
    });
  });
}

function readDoc(t: TestConvex<typeof schema>, characterId = 101) {
  return t.run((ctx) =>
    ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

function run(t: TestConvex<typeof schema>) {
  return t.action(internal.characterLocationSync.syncUser, { userId: USER, generation: GEN });
}

describe('characterLocationSync.syncUser', () => {
  it('throws when the deployment env is unset', async () => {
    vi.unstubAllEnvs();
    const t = convexTest(schema, modules);
    await expect(run(t)).rejects.toThrow(/SITE_URL/);
  });

  it('writes a fresh 200 location + ship for a tracked character', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    const fetchFn = stubFetch({
      esi: (url) => {
        if (url.includes('/location')) {
          return jsonResponse({ solar_system_id: SYSTEM_A }, RL);
        }
        if (url.includes('/ship')) {
          return jsonResponse({ ship_type_id: SHIP_A }, { ...RL, ETag: 'ship1' });
        }
        throw new Error(`unexpected esi ${url}`);
      },
    });

    await run(t);

    const doc = await readDoc(t);
    expect(doc).toMatchObject({
      solarSystemId: SYSTEM_A,
      stationId: null,
      structureId: null,
      shipTypeId: SHIP_A,
      prevSolarSystemId: null,
      prevFresh: false,
      etagLocation: 'loc1',
      etagShip: 'ship1',
    });
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/location'))).toBe(true);
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/ship'))).toBe(true);
  });

  it('keeps the held document byte-identical on a 304', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    const before = await t.run(async (ctx) =>
      ctx.db.insert('characterLocation', {
        userId: USER,
        characterId: 101,
        solarSystemId: SYSTEM_A,
        stationId: null,
        structureId: null,
        shipTypeId: SHIP_A,
        prevSolarSystemId: null,
        prevFresh: false,
        observedAt: GEN - 1_000,
        etagLocation: 'loc0',
        etagShip: 'ship0',
      }),
    );
    stubFetch({
      esi: () => new Response(null, { status: 304, headers: { Expires: EXP } }),
    });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?._id).toBe(before);
    expect(doc?._creationTime).toBe(
      (await t.run((ctx) => ctx.db.get(before)))?._creationTime,
    );
    expect(doc).toMatchObject({
      solarSystemId: SYSTEM_A,
      shipTypeId: SHIP_A,
      etagLocation: 'loc0',
      etagShip: 'ship0',
    });
  });

  it('fetches ship and stamps prev on a system change', async () => {
    const t = convexTest(schema, modules);
    // Continuity uses Date.now() at apply — keep lastFinishedAt inside JUMP_CONTINUITY_MS.
    // prevFresh requires the previous run's covered set, not the tracked set.
    const recentFinish = Date.now() - 5_000;
    await seedSubject(t, {
      lastFinishedAt: recentFinish,
      syncedCharacterIds: [101],
      coveredCharacterIds: [101],
    });
    await seedTracking(t);
    await t.run((ctx) =>
      ctx.db.insert('characterLocation', {
        userId: USER,
        characterId: 101,
        solarSystemId: SYSTEM_A,
        stationId: null,
        structureId: null,
        shipTypeId: SHIP_A,
        prevSolarSystemId: null,
        prevFresh: false,
        observedAt: recentFinish,
        etagLocation: 'loc0',
        etagShip: 'ship0',
      }),
    );
    const fetchFn = stubFetch({
      esi: (url) => {
        if (url.includes('/location')) {
          return jsonResponse({ solar_system_id: SYSTEM_B }, { ...RL, ETag: 'loc2' });
        }
        if (url.includes('/ship')) {
          return jsonResponse({ ship_type_id: SHIP_B }, { ...RL, ETag: 'ship2' });
        }
        throw new Error(`unexpected esi ${url}`);
      },
    });

    await run(t);

    const doc = await readDoc(t);
    expect(doc).toMatchObject({
      solarSystemId: SYSTEM_B,
      shipTypeId: SHIP_B,
      prevSolarSystemId: SYSTEM_A,
      prevFresh: true,
      etagLocation: 'loc2',
      etagShip: 'ship2',
    });
    expect(fetchFn.mock.calls.filter(([u]) => String(u).includes('/ship'))).toHaveLength(1);
  });

  it('does not fetch ship on a same-system dock change', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await t.run((ctx) =>
      ctx.db.insert('characterLocation', {
        userId: USER,
        characterId: 101,
        solarSystemId: SYSTEM_A,
        stationId: null,
        structureId: null,
        shipTypeId: SHIP_A,
        prevSolarSystemId: 30_000_001,
        prevFresh: true,
        observedAt: GEN - 5_000,
        etagLocation: 'loc0',
        etagShip: 'ship0',
      }),
    );
    const fetchFn = stubFetch({
      esi: (url) => {
        if (url.includes('/location')) {
          return jsonResponse(
            { solar_system_id: SYSTEM_A, station_id: 60_003_760 },
            { ...RL, ETag: 'loc3' },
          );
        }
        throw new Error(`unexpected ship fetch ${url}`);
      },
    });

    await run(t);

    const doc = await readDoc(t);
    expect(doc).toMatchObject({
      solarSystemId: SYSTEM_A,
      stationId: 60_003_760,
      shipTypeId: SHIP_A,
      prevSolarSystemId: 30_000_001,
      prevFresh: true,
      etagLocation: 'loc3',
      etagShip: 'ship0',
    });
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/ship'))).toBe(false);
  });

  it('skips untracked characters entirely (no token vend)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    // No mapTracking row.
    const fetchFn = stubFetch({
      esi: () => {
        throw new Error('should not call ESI');
      },
    });

    await run(t);

    expect(await readDoc(t)).toBeNull();
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
  });

  it('records reauth_required for an ineligible tracked character', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    const fetchFn = stubFetch({
      characters: [
        { ...eligible(101), missingScopes: ['esi-location.read_location.v1'] },
      ],
    });

    await run(t);

    expect(await readDoc(t)).toBeNull();
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) =>
          q.eq('userId', USER).eq('dataset', 'characterLocation'),
        )
        .unique(),
    );
    // Per-character error clears the subject window (null minExpiresAt).
    expect(subject?.minExpiresAt).toBeNull();
    expect(subject?.syncedCharacterIds).toEqual([101]);
  });

  it('keeps the last-known doc on ESI 4xx', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await t.run((ctx) =>
      ctx.db.insert('characterLocation', {
        userId: USER,
        characterId: 101,
        solarSystemId: SYSTEM_A,
        stationId: null,
        structureId: null,
        shipTypeId: SHIP_A,
        prevSolarSystemId: null,
        prevFresh: false,
        observedAt: GEN - 1_000,
        etagLocation: 'loc0',
        etagShip: 'ship0',
      }),
    );
    stubFetch({ esi: () => new Response(null, { status: 403 }) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.solarSystemId).toBe(SYSTEM_A);
    expect(doc?.etagLocation).toBe('loc0');
  });
});
