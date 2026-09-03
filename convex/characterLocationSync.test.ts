// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/platform/esi';
import { internal } from './_generated/api';
import schema from './schema';

import { modules } from './__tests__/modules.setup';

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

const TOKEN_EXP = Date.now() + 1_200_000;

function jsonResponse(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function problemResponse(code: string, status: number) {
  return Response.json(
    problemBodySchema.parse({
      type: `https://lgi.tools/problems/${code}`,
      title: 'Request failed',
      status,
      code,
      correlationId: 'correlation-id',
    }),
    { status },
  );
}

const RL = {
  ETag: 'loc1',
  Expires: EXP,
  'X-Ratelimit-Group': 'char-location',
  'X-Ratelimit-Limit': '600',
  'X-Ratelimit-Remaining': '599',
  'X-Ratelimit-Used': '1',
};

function stubFetch(opts: {
  token?: () => Response;
  esi?: (url: string) => Response;
}) {
  const fn = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/api/internal/eve-token')) {
      return (opts.token ?? (() => jsonResponse({ accessToken: 'tok', expiresAt: TOKEN_EXP })))();
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
    workId: String(GEN),
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

async function seedOnline(
  t: TestConvex<typeof schema>,
  overrides: Partial<{ online: boolean; etagOnline: string | null; onlineExpiresAt: number }> = {},
  characterId = 101,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('characterLocationOnline', {
      userId: USER,
      characterId,
      online: true,
      etagOnline: 'on0',
      onlineExpiresAt: Date.now() + 60_000,
      ...overrides,
    });
  });
}

function readOnlineRow(t: TestConvex<typeof schema>, characterId = 101) {
  return t.run((ctx) =>
    ctx.db
      .query('characterLocationOnline')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

function readLease(t: TestConvex<typeof schema>, characterId = 101) {
  return t.run((ctx) =>
    ctx.db
      .query('characterLocationAccess')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

function readDoc(t: TestConvex<typeof schema>, characterId = 101) {
  return t.run((ctx) =>
    ctx.db
      .query('characterLocation')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

async function seedLease(
  t: TestConvex<typeof schema>,
  overrides: Partial<{ accessToken: string; expiresAt: number }> = {},
  characterId = 101,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert('characterLocationAccess', {
      userId: USER,
      characterId,
      accessToken: 'leased-tok',
      expiresAt: Date.now() + 600_000,
      updatedAt: Date.now(),
      ...overrides,
    });
  });
}

function run(t: TestConvex<typeof schema>) {
  return t.action(internal.characterLocationSync.syncUser, { userId: USER, generation: GEN });
}

describe('characterLocationSync.syncUser', () => {
  it('completes as failed when the deployment env is unset', async () => {
    vi.unstubAllEnvs();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await run(t);
    const subject = await t.run((ctx) => ctx.db.query('syncSubjects').unique());
    expect(subject?.status).toBe('idle');
    expect(subject?.lastError).toMatch(/SITE_URL/);
  });

  it('writes a fresh 200 location + ship for a tracked character', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await seedOnline(t);
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
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/eve-characters'))).toBe(false);
    const lease = await readLease(t);
    expect(lease).toMatchObject({ accessToken: 'tok', expiresAt: TOKEN_EXP });
  });

  it('keeps the held document byte-identical on a 304', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await seedOnline(t);
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
    const createdAt = (await t.run((ctx) => ctx.db.get(before)))?._creationTime;
    stubFetch({
      esi: () => new Response(null, { status: 304, headers: { Expires: EXP } }),
    });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?._id).toBe(before);
    expect(doc?._creationTime).toBe(createdAt);
    expect(doc).toMatchObject({
      solarSystemId: SYSTEM_A,
      shipTypeId: SHIP_A,
      etagLocation: 'loc0',
      etagShip: 'ship0',
    });
  });

  it('fetches ship and stamps prev on a system change', async () => {
    const t = convexTest(schema, modules);
    const recentFinish = Date.now() - 5_000;
    await seedSubject(t, {
      lastFinishedAt: recentFinish,
      syncedCharacterIds: [101],
      coveredCharacterIds: [101],
    });
    await seedTracking(t);
    await seedOnline(t);
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
    await seedOnline(t);
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
    const fetchFn = stubFetch({
      esi: () => {
        throw new Error('should not call ESI');
      },
    });

    await run(t);

    expect(await readDoc(t)).toBeNull();
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
  });

  it('records reauth_required when vend returns 409', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    const fetchFn = stubFetch({
      token: () => problemResponse('reauth_required', 409),
    });

    await run(t);

    expect(await readDoc(t)).toBeNull();
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(true);
    expect(await readLease(t)).toBeNull();
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) =>
          q.eq('userId', USER).eq('dataset', 'characterLocation'),
        )
        .unique(),
    );
    expect(subject?.minExpiresAt).toBeNull();
    expect(subject?.syncedCharacterIds).toEqual([101]);
  });

  it('clears a freshly vended lease when ESI returns 403', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await seedOnline(t);
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
    const fetchFn = stubFetch({ esi: () => new Response(null, { status: 403 }) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.solarSystemId).toBe(SYSTEM_A);
    expect(doc?.etagLocation).toBe('loc0');
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(true);
    expect(await readLease(t)).toBeNull();
  });

  it('keeps the last-known doc on ESI 403, drops a held lease, and does not vend', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await seedOnline(t);
    await seedLease(t);
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
    const fetchFn = stubFetch({ esi: () => new Response(null, { status: 403 }) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.solarSystemId).toBe(SYSTEM_A);
    expect(doc?.etagLocation).toBe('loc0');
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
    expect(await readLease(t)).toBeNull();
  });

  it('reuses a held online answer inside its window — no /online read', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await seedOnline(t);
    const fetchFn = stubFetch({
      esi: (url) => {
        if (url.includes('/location')) {
          return new Response(null, { status: 304, headers: { Expires: EXP } });
        }
        throw new Error(`unexpected esi ${url}`);
      },
    });

    await run(t);

    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/online'))).toBe(false);
    expect((await readOnlineRow(t))?.etagOnline).toBe('on0');
  });

  it('re-reads /online past the window; a 304 keeps the flag and refreshes the window', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    const lapsed = Date.now() - 1;
    await seedOnline(t, { onlineExpiresAt: lapsed });
    const onlineExpires = new Date(Date.now() + 60_000).toUTCString();
    const fetchFn = stubFetch({
      esi: (url) => {
        if (url.includes('/online')) {
          return new Response(null, { status: 304, headers: { Expires: onlineExpires } });
        }
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

    const onlineCall = fetchFn.mock.calls.find(([u]) => String(u).includes('/online'));
    expect(onlineCall).toBeDefined();
    const row = await readOnlineRow(t);
    expect(row?.online).toBe(true);
    expect(row?.onlineExpiresAt).toBeGreaterThan(lapsed);
    expect((await readDoc(t))?.solarSystemId).toBe(SYSTEM_A);
  });

  it('skips location and ship for an offline pilot and paces at the online window', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    const onlineExpires = new Date(Date.now() + 60_000).toUTCString();
    const fetchFn = stubFetch({
      esi: (url) => {
        if (url.includes('/online')) {
          return jsonResponse({ online: false }, { ETag: 'on1', Expires: onlineExpires });
        }
        throw new Error(`unexpected esi ${url}`);
      },
    });

    await run(t);

    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/location'))).toBe(false);
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/ship'))).toBe(false);
    expect(await readDoc(t)).toBeNull();
    const row = await readOnlineRow(t);
    expect(row?.online).toBe(false);
    expect(row?.etagOnline).toBe('on1');
    const subject = await t.run((ctx) =>
      ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) =>
          q.eq('userId', USER).eq('dataset', 'characterLocation'),
        )
        .unique(),
    );
    expect(subject?.minExpiresAt).toBeGreaterThan(Date.now() + 30_000);
    expect(subject?.coveredCharacterIds).toEqual([]);
  });

  it('resumes the location loop when the probe sees a login', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await seedTracking(t);
    await seedOnline(t, { online: false, onlineExpiresAt: Date.now() - 1 });
    const fetchFn = stubFetch({
      esi: (url) => {
        if (url.includes('/online')) {
          return jsonResponse({ online: true }, { ETag: 'on2', Expires: EXP });
        }
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

    expect((await readOnlineRow(t))?.online).toBe(true);
    expect((await readDoc(t))?.solarSystemId).toBe(SYSTEM_A);
    expect(fetchFn.mock.calls.some(([u]) => String(u).includes('/location'))).toBe(true);
  });

  it('reuses a still-valid access lease and re-vends once Neon expiresAt lapses', async () => {
    const locationShip = {
      esi: (url: string) => {
        if (url.includes('/location')) {
          return jsonResponse({ solar_system_id: SYSTEM_A }, RL);
        }
        if (url.includes('/ship')) {
          return jsonResponse({ ship_type_id: SHIP_A }, { ...RL, ETag: 'ship1' });
        }
        throw new Error(`unexpected esi ${url}`);
      },
    };

    const held = convexTest(schema, modules);
    await seedSubject(held);
    await seedTracking(held);
    await seedOnline(held);
    await seedLease(held);
    const heldFetch = stubFetch(locationShip);
    await run(held);
    expect(heldFetch.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
    expect(heldFetch.mock.calls.some(([u]) => String(u).includes('/eve-characters'))).toBe(false);
    expect((await readDoc(held))?.solarSystemId).toBe(SYSTEM_A);
    expect((await readLease(held))?.accessToken).toBe('leased-tok');

    const stale = convexTest(schema, modules);
    await seedSubject(stale);
    await seedTracking(stale);
    await seedOnline(stale);
    await seedLease(stale, { expiresAt: Date.now() - 1, accessToken: 'stale-tok' });
    const staleFetch = stubFetch(locationShip);
    await run(stale);
    expect(staleFetch.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(true);
    expect(await readLease(stale)).toMatchObject({ accessToken: 'tok', expiresAt: TOKEN_EXP });
    expect((await readDoc(stale))?.solarSystemId).toBe(SYSTEM_A);
  });
});
