// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/lib/esi';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_corpbpsync_1';
const GEN = 1_700_000_000_000;
const SITE = 'https://app.test';
const EXP = new Date(Date.now() + 3_600_000).toUTCString();
const CORP_A = 2000;
const CORP_B = 3000;

function bpRow(typeId: number) {
  return {
    item_id: typeId * 10,
    type_id: typeId,
    location_id: 60003760,
    location_flag: 'CorpSAG1',
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
    location_flag: 'CorpSAG1',
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
    'X-Ratelimit-Group': 'corp-blueprints',
    'X-Ratelimit-Limit': '600',
    'X-Ratelimit-Remaining': '599',
    'X-Ratelimit-Used': '1',
  };
}

type Character = {
  characterId: number;
  corporationId: number | null;
  hasRefreshToken: boolean;
  missingScopes: string[];
};
function eligible(characterId = 101, corporationId: number | null = CORP_A): Character {
  return { characterId, corporationId, hasRefreshToken: true, missingScopes: [] };
}

// Routes the AUTHED reads a corp blueprints run makes: the per-character roles
// read and the per-corp paginated blueprints read.
function esiRouter(
  over: {
    roles?: (characterId: number) => Response;
    blueprints?: (corporationId: number, url: string) => Response;
  } = {},
) {
  return (url: string): Response => {
    let m = url.match(/\/characters\/(\d+)\/roles$/);
    if (m) return (over.roles ?? (() => jsonResponse({ roles: ['Director'] })))(Number(m[1]));
    m = url.match(/\/corporations\/(\d+)\/blueprints\//);
    if (m) {
      return (over.blueprints ?? (() => jsonResponse([bpRow(1000)], pageHeaders('cb1', '1'))))(
        Number(m[1]),
        url,
      );
    }
    throw new Error(`unexpected esi url ${url}`);
  };
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

function blueprintCalls(fn: ReturnType<typeof stubFetch>): number {
  return fn.mock.calls.filter(([u]) => /\/corporations\/\d+\/blueprints\//.test(String(u))).length;
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
      dataset: 'corpBlueprints' as const,
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

function readDoc(t: TestConvex<typeof schema>, corporationId = CORP_A) {
  return t.run((ctx) =>
    ctx.db
      .query('corpBlueprintsSync')
      .withIndex('by_user_corp', (q) => q.eq('userId', USER).eq('corporationId', corporationId))
      .unique(),
  );
}
function readData(t: TestConvex<typeof schema>, corporationId = CORP_A) {
  return t.run((ctx) =>
    ctx.db
      .query('corpBlueprintsSyncData')
      .withIndex('by_user_corp', (q) => q.eq('userId', USER).eq('corporationId', corporationId))
      .unique(),
  );
}

function run(t: TestConvex<typeof schema>) {
  return t.action(internal.corpBlueprintsSync.syncUser, { userId: USER, generation: GEN });
}

describe('corpBlueprintsSync.syncUser', () => {
  it('throws when the deployment env is unset', async () => {
    vi.unstubAllEnvs();
    const t = convexTest(schema, modules);
    await expect(run(t)).rejects.toThrow(/SITE_URL/);
  });

  it('reads a Director-held corp blueprints once and projects the stored fields', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({ esi: esiRouter() });

    await run(t);

    expect((await readData(t))?.data?.blueprints).toEqual([stored(1000)]);
    expect((await readDoc(t))?.etags).toEqual(['cb1']);
    expect((await readDoc(t))?.syncError).toBeNull();
    expect(blueprintCalls(fn)).toBe(1);
  });

  it('dedupes by corp: two characters in one corp read the corp blueprints ONCE', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({ characters: [eligible(101), eligible(102)], esi: esiRouter() });

    await run(t);

    expect(blueprintCalls(fn)).toBe(1);
  });

  it('records needs_role WITHOUT an ESI blueprints call when no character is a Director', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({ esi: esiRouter({ roles: () => jsonResponse({ roles: ['Accountant'] }) }) });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('needs_role');
    expect(await readData(t)).toBeNull();
    expect(blueprintCalls(fn)).toBe(0);
  });

  it('maps a blueprints 403 (role revoked mid-run) to needs_role', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({
      esi: esiRouter({ blueprints: () => new Response(null, { status: 403 }) }),
    });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('needs_role');
    expect(blueprintCalls(fn)).toBe(1);
  });

  it('assembles a multi-page corp blueprint collection', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({
      esi: esiRouter({
        blueprints: (_corp, url) =>
          url.includes('page=2')
            ? jsonResponse([bpRow(3000)], pageHeaders('cb2', '2'))
            : jsonResponse([bpRow(2000), bpRow(1000)], pageHeaders('cb1', '2')),
      }),
    });

    await run(t);

    expect((await readData(t))?.data?.blueprints).toEqual([stored(1000), stored(2000), stored(3000)]);
    expect((await readDoc(t))?.etags).toEqual(['cb1', 'cb2']);
  });

  it('skips a scope-missing character entirely: no token vend, no ESI, no corp doc', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({
      characters: [
        {
          characterId: 101,
          corporationId: CORP_A,
          hasRefreshToken: true,
          missingScopes: ['esi-corporations.read_blueprints.v1'],
        },
      ],
      esi: esiRouter(),
    });

    await run(t);

    expect(await readDoc(t)).toBeNull();
    expect(fn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
    expect(blueprintCalls(fn)).toBe(0);
  });

  it('syncs multiple corps, one blueprints read each', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({
      characters: [eligible(101, CORP_A), eligible(102, CORP_B)],
      esi: esiRouter(),
    });

    await run(t);

    expect(blueprintCalls(fn)).toBe(2);
    const corps = await t.run((ctx) =>
      ctx.db
        .query('corpBlueprintsSync')
        .withIndex('by_user', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(corps.map((d) => d.corporationId).sort((a, b) => a - b)).toEqual([CORP_A, CORP_B]);
  });

  it('reproduces the projection after a teardown + resync (regenerable)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: esiRouter() });

    await run(t);
    const firstData = await readData(t);
    const firstDoc = await readDoc(t);
    expect(firstData?.data?.blueprints).toEqual([stored(1000)]);

    await t.run(async (ctx) => {
      for (const doc of await ctx.db.query('corpBlueprintsSync').collect()) {
        await ctx.db.delete(doc._id);
      }
      for (const doc of await ctx.db.query('corpBlueprintsSyncData').collect()) {
        await ctx.db.delete(doc._id);
      }
    });
    expect(await readDoc(t)).toBeNull();

    await run(t);
    expect((await readData(t))?.data).toEqual(firstData?.data);
    expect((await readDoc(t))?.etags).toEqual(firstDoc?.etags);
  });
});
