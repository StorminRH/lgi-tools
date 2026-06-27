// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/lib/esi';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_charbpsync_1';
const GEN = 1_700_000_000_000;
const SITE = 'https://app.test';
const EXP = new Date(Date.now() + 3_600_000).toUTCString();

// ESI blueprint row (with item_id); the projection drops item_id + sorts.
function bpRow(typeId: number) {
  return {
    item_id: typeId * 10,
    type_id: typeId,
    location_id: 60003760,
    location_flag: 'Hangar',
    quantity: -1,
    material_efficiency: 0,
    time_efficiency: 0,
    runs: -1,
  };
}
function stored(typeId: number) {
  return {
    type_id: typeId,
    material_efficiency: 0,
    time_efficiency: 0,
    runs: -1,
    quantity: -1,
    location_id: 60003760,
    location_flag: 'Hangar',
  };
}

const permissiveScoreboard = {
  async preDispatch() {
    return { effectiveRemaining: 1000, blockedRetryAfter: null, etag: null };
  },
  async report() {},
  async getCachedBody() {
    return null;
  },
};

function jsonResponse(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function pageHeaders(etag: string, xPages: string): Record<string, string> {
  return {
    ETag: etag,
    Expires: EXP,
    'X-Pages': xPages,
    'X-Ratelimit-Group': 'char-blueprints',
    'X-Ratelimit-Limit': '600',
    'X-Ratelimit-Remaining': '599',
    'X-Ratelimit-Used': '1',
  };
}

type Character = { characterId: number; hasRefreshToken: boolean; missingScopes: string[] };
function eligible(characterId = 101): Character {
  return { characterId, hasRefreshToken: true, missingScopes: [] };
}

function stubFetch(opts: {
  characters?: Character[];
  token?: () => Response;
  esi?: (url: string) => Response;
}) {
  const fn = vi.fn(async (input: string | URL | Request) => {
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

// Single-page blueprints read by default.
function esiSinglePage(url: string): Response {
  if (/\/characters\/\d+\/blueprints\//.test(url)) {
    return jsonResponse([bpRow(1000)], pageHeaders('e1', '1'));
  }
  throw new Error(`unexpected esi url ${url}`);
}

function blueprintCalls(fn: ReturnType<typeof stubFetch>): number {
  return fn.mock.calls.filter(([u]) => /\/characters\/\d+\/blueprints\//.test(String(u))).length;
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

async function seedSubject(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    await ctx.db.insert('syncSubjects', {
      dataset: 'characterBlueprints' as const,
      userId: USER,
      status: 'running' as const,
      lastRequestedAt: GEN,
      workId: 'w1',
      nextDueAt: GEN + 3_600_000,
      minExpiresAt: null,
      syncedCharacterIds: [],
      lastFinishedAt: null,
      lastError: null,
      rlGroup: null,
      rlLimit: null,
      rlRemaining: null,
      rlUsed: null,
    });
  });
}

function readDoc(t: TestConvex<typeof schema>, characterId = 101) {
  return t.run((ctx) =>
    ctx.db
      .query('characterBlueprintsSync')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}
function readData(t: TestConvex<typeof schema>, characterId = 101) {
  return t.run((ctx) =>
    ctx.db
      .query('characterBlueprintsSyncData')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

function run(t: TestConvex<typeof schema>) {
  return t.action(internal.characterBlueprintsSync.syncUser, { userId: USER, generation: GEN });
}

describe('characterBlueprintsSync.syncUser', () => {
  it('throws when the deployment env is unset', async () => {
    vi.unstubAllEnvs();
    const t = convexTest(schema, modules);
    await expect(run(t)).rejects.toThrow(/SITE_URL/);
  });

  it('reads and projects a single page, storing per-page etags', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({ esi: esiSinglePage });

    await run(t);

    expect((await readData(t))?.data?.blueprints).toEqual([stored(1000)]);
    const doc = await readDoc(t);
    expect(doc?.etags).toEqual(['e1']);
    expect(doc?.expiresAt).toBe(Date.parse(EXP));
    expect(doc?.syncError).toBeNull();
    expect(blueprintCalls(fn)).toBe(1);
  });

  it('assembles a multi-page blueprint collection across pages', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({
      esi: (url) => {
        if (url.includes('page=2')) return jsonResponse([bpRow(3000)], pageHeaders('e2', '2'));
        return jsonResponse([bpRow(2000), bpRow(1000)], pageHeaders('e1', '2'));
      },
    });

    await run(t);

    // Canonical sort across the assembled pages.
    expect((await readData(t))?.data?.blueprints).toEqual([stored(1000), stored(2000), stored(3000)]);
    expect((await readDoc(t))?.etags).toEqual(['e1', 'e2']);
  });

  it('keeps the held collection on a 304', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterBlueprintsSync', {
        userId: USER,
        characterId: 101,
        etags: ['e1'],
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
      await ctx.db.insert('characterBlueprintsSyncData', {
        userId: USER,
        characterId: 101,
        data: { blueprints: [stored(1000)] },
      });
    });
    stubFetch({
      esi: () => new Response(null, { status: 304, headers: { Expires: EXP, 'X-Pages': '1' } }),
    });

    await run(t);

    const doc = await readDoc(t);
    expect((await readData(t))?.data?.blueprints).toEqual([stored(1000)]);
    expect(doc?.etags).toEqual(['e1']);
    expect((doc?.lastSyncedAt ?? 0) > GEN - 1000).toBe(true);
  });

  it('records reauth_required for a scope-missing character without vending a token or calling ESI', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({
      characters: [
        {
          characterId: 101,
          hasRefreshToken: true,
          missingScopes: ['esi-characters.read_blueprints.v1'],
        },
      ],
      esi: esiSinglePage,
    });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('reauth_required');
    expect(await readData(t)).toBeNull();
    expect(fn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
    expect(blueprintCalls(fn)).toBe(0);
  });

  it('reproduces the projection after a teardown + resync (regenerable)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: esiSinglePage });

    await run(t);
    const firstData = await readData(t);
    const firstDoc = await readDoc(t);
    expect(firstData?.data?.blueprints).toEqual([stored(1000)]);

    await t.run(async (ctx) => {
      for (const doc of await ctx.db.query('characterBlueprintsSync').collect()) {
        await ctx.db.delete(doc._id);
      }
      for (const doc of await ctx.db.query('characterBlueprintsSyncData').collect()) {
        await ctx.db.delete(doc._id);
      }
    });
    expect(await readDoc(t)).toBeNull();
    expect(await readData(t)).toBeNull();

    await run(t);
    expect((await readData(t))?.data).toEqual(firstData?.data);
    expect((await readDoc(t))?.etags).toEqual(firstDoc?.etags);
  });
});
