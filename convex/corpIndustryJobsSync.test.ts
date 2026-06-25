// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/lib/esi';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_corpjobs_1';
const GEN = 1_700_000_000_000;
const SITE = 'https://app.test';
const EXP = new Date(Date.now() + 300_000).toUTCString();
const FUTURE = '2099-01-01T00:00:00Z';
const CORP_A = 2000;
const CORP_B = 3000;

// The corp endpoint returns a SUPERSET of the character job shape — installer_id
// / cost are corp-only. Zod strips them, so the stored doc carries only the
// projected fields (asserted below).
const CORP_JOB = {
  job_id: 1,
  activity_id: 1,
  blueprint_type_id: 1000,
  runs: 1,
  status: 'active' as const,
  start_date: '2020-01-01T00:00:00Z',
  end_date: FUTURE,
  installer_id: 90001,
  cost: 1234.5,
  facility_id: 60000001,
};

// The projected (stored) shape — what survives the boundary parse, used to seed
// existing docs (the corp-only extras above are NOT valid schema fields).
const STORED_JOB = {
  job_id: 1,
  activity_id: 1,
  blueprint_type_id: 1000,
  runs: 1,
  status: 'active' as const,
  start_date: '2020-01-01T00:00:00Z',
  end_date: FUTURE,
};

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

const RL = {
  ETag: 'cj1',
  Expires: EXP,
  'X-Ratelimit-Group': 'corp-industry',
  'X-Ratelimit-Limit': '600',
  'X-Ratelimit-Remaining': '599',
  'X-Ratelimit-Used': '1',
};

type Character = { characterId: number; hasRefreshToken: boolean; missingScopes: string[] };

function eligible(characterId = 101): Character {
  return { characterId, hasRefreshToken: true, missingScopes: [] };
}

// Routes the three ESI reads a corp run makes (all versionless, matching the
// codebase's esiUrl convention). Order matters: the more specific /roles and
// /corporations/.../industry/jobs paths are matched before the bare
// /characters/{id} public read.
function esiRouter(
  over: {
    public?: (characterId: number) => Response;
    roles?: (characterId: number) => Response;
    jobs?: (corporationId: number) => Response;
  } = {},
) {
  return (url: string): Response => {
    let m = url.match(/\/characters\/(\d+)\/roles$/);
    if (m) return (over.roles ?? (() => jsonResponse({ roles: ['Factory_Manager'] })))(Number(m[1]));
    m = url.match(/\/corporations\/(\d+)\/industry\/jobs$/);
    if (m) return (over.jobs ?? (() => jsonResponse([CORP_JOB], RL)))(Number(m[1]));
    m = url.match(/\/characters\/(\d+)$/);
    if (m) return (over.public ?? (() => jsonResponse({ corporation_id: CORP_A })))(Number(m[1]));
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

function corpJobsCalls(fn: ReturnType<typeof stubFetch>): number {
  return fn.mock.calls.filter(([u]) => /\/corporations\/\d+\/industry\/jobs$/.test(String(u))).length;
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
    dataset: 'corpIndustryJobs' as const,
    userId: USER,
    status: 'running' as const,
    lastRequestedAt: GEN,
    workId: 'w1',
    nextDueAt: GEN + 300_000,
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

function readDoc(t: TestConvex<typeof schema>, corporationId = CORP_A) {
  return t.run((ctx) =>
    ctx.db
      .query('corpIndustryJobsSync')
      .withIndex('by_user_corp', (q) => q.eq('userId', USER).eq('corporationId', corporationId))
      .unique(),
  );
}

function readSubject(t: TestConvex<typeof schema>) {
  return t.run((ctx) =>
    ctx.db
      .query('syncSubjects')
      .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'corpIndustryJobs'))
      .unique(),
  );
}

function run(t: TestConvex<typeof schema>) {
  return t.action(internal.corpIndustryJobsSync.syncUser, { userId: USER, generation: GEN });
}

describe('corpIndustryJobsSync.syncUser', () => {
  it('throws when the deployment env is unset', async () => {
    vi.unstubAllEnvs();
    const t = convexTest(schema, modules);
    await expect(run(t)).rejects.toThrow(/SITE_URL/);
  });

  it('reads a role-holding corp board once and projects only the stored fields', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({ esi: esiRouter() });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.data?.jobs.map((j) => j.job_id)).toEqual([1]);
    expect(doc?.data?.jobs[0]?.status).toBe('active');
    // The corp-only fields are stripped at the boundary parse.
    expect(doc?.data?.jobs[0]).not.toHaveProperty('installer_id');
    expect(doc?.data?.jobs[0]).not.toHaveProperty('cost');
    expect(doc?.jobsEtag).toBe('cj1');
    expect(doc?.expiresAt).toBe(Date.parse(EXP));
    expect(doc?.syncError).toBeNull();
    expect(corpJobsCalls(fn)).toBe(1);
  });

  it('dedupes by corp: two characters in one corp read the corp board ONCE', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    // Both characters resolve to CORP_A (default public read) and both hold the
    // role (default roles read) — the corp board must be fetched exactly once.
    const fn = stubFetch({ characters: [eligible(101), eligible(102)], esi: esiRouter() });

    await run(t);

    expect(corpJobsCalls(fn)).toBe(1);
    const docs = await t.run((ctx) =>
      ctx.db
        .query('corpIndustryJobsSync')
        .withIndex('by_user', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(docs.map((d) => d.corporationId)).toEqual([CORP_A]);
  });

  it('records needs_role WITHOUT an ESI corp-jobs call when no character holds the role', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({
      esi: esiRouter({ roles: () => jsonResponse({ roles: ['Accountant'] }) }),
    });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.syncError).toBe('needs_role');
    expect(doc?.data).toBeNull();
    // Budget-safe: a guaranteed 403 is never spent.
    expect(corpJobsCalls(fn)).toBe(0);
  });

  it('admits a Director (role gate accepts Factory_Manager OR Director)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({ esi: esiRouter({ roles: () => jsonResponse({ roles: ['Director'] }) }) });

    await run(t);

    expect((await readDoc(t))?.data?.jobs.map((j) => j.job_id)).toEqual([1]);
    expect(corpJobsCalls(fn)).toBe(1);
  });

  it('maps a corp-jobs 403 (role revoked mid-run) to needs_role', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    // Roles say the character holds the role, but the actual board read 403s.
    const fn = stubFetch({ esi: esiRouter({ jobs: () => new Response(null, { status: 403 }) }) });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('needs_role');
    expect(corpJobsCalls(fn)).toBe(1);
  });

  it('skips a scope-missing character entirely: no token vend, no ESI, no corp doc', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({
      characters: [
        {
          characterId: 101,
          hasRefreshToken: true,
          missingScopes: ['esi-industry.read_corporation_jobs.v1'],
        },
      ],
      esi: esiRouter(),
    });

    await run(t);

    expect(await readDoc(t)).toBeNull();
    expect(fn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
    expect(corpJobsCalls(fn)).toBe(0);
  });

  it('syncs multiple corps, one board read each', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fn = stubFetch({
      characters: [eligible(101), eligible(102)],
      esi: esiRouter({
        // 101 → CORP_A, 102 → CORP_B.
        public: (characterId) =>
          jsonResponse({ corporation_id: characterId === 101 ? CORP_A : CORP_B }),
      }),
    });

    await run(t);

    expect(corpJobsCalls(fn)).toBe(2);
    const corps = await t.run((ctx) =>
      ctx.db
        .query('corpIndustryJobsSync')
        .withIndex('by_user', (q) => q.eq('userId', USER))
        .collect(),
    );
    expect(corps.map((d) => d.corporationId).sort()).toEqual([CORP_A, CORP_B]);
  });

  it('orphan-cleans a corp the user no longer reaches', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    // A stale doc for a corp not reachable this run.
    await t.run(async (ctx) => {
      await ctx.db.insert('corpIndustryJobsSync', {
        userId: USER,
        corporationId: 9999,
        data: { jobs: [] },
        jobsEtag: 'old',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
    });
    stubFetch({ esi: esiRouter() }); // only reaches CORP_A

    await run(t);

    expect(await readDoc(t, 9999)).toBeNull();
    expect((await readDoc(t, CORP_A))?.data?.jobs.map((j) => j.job_id)).toEqual([1]);
  });

  it('keeps the held board on a 304', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('corpIndustryJobsSync', {
        userId: USER,
        corporationId: CORP_A,
        data: { jobs: [STORED_JOB] },
        jobsEtag: 'cj0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
    });
    stubFetch({
      esi: esiRouter({ jobs: () => new Response(null, { status: 304, headers: { Expires: EXP } }) }),
    });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.data?.jobs.map((j) => j.job_id)).toEqual([1]);
    expect(doc?.jobsEtag).toBe('cj0');
    expect((doc?.lastSyncedAt ?? 0) > GEN - 1000).toBe(true);
  });

  it('reproduces the projection after a teardown + resync (regenerable)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: esiRouter() });

    await run(t);
    const first = await readDoc(t);
    expect(first?.data?.jobs.map((j) => j.job_id)).toEqual([1]);

    // Wipe the corp projection (Convex is regenerable; Neon + ESI are authority).
    await t.run(async (ctx) => {
      for (const doc of await ctx.db.query('corpIndustryJobsSync').collect()) {
        await ctx.db.delete(doc._id);
      }
    });
    expect(await readDoc(t)).toBeNull();

    await run(t);
    const second = await readDoc(t);
    expect(second?.data).toEqual(first?.data);
    expect(second?.jobsEtag).toBe(first?.jobsEtag);
    expect(second?.syncError).toBe(first?.syncError);
  });

  it('skips a character unlinked between enumeration and token vend (404): no corp doc', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ token: () => new Response(null, { status: 404 }), esi: esiRouter() });

    await run(t);

    expect(await readDoc(t)).toBeNull();
  });

  it('stops the run and records budget_exhausted without orphaning when the gate refuses', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    // A pre-existing doc must survive a budget-cut run (incomplete corp set →
    // no orphan cleanup).
    await t.run(async (ctx) => {
      await ctx.db.insert('corpIndustryJobsSync', {
        userId: USER,
        corporationId: CORP_A,
        data: { jobs: [] },
        jobsEtag: 'keep',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
    });
    __setScoreboardForTests('unavailable');
    stubFetch({ esi: esiRouter() });

    await run(t);

    const subject = await readSubject(t);
    expect(subject?.lastError?.startsWith('budget_exhausted:')).toBe(true);
    // The existing doc is retained, not orphaned, on incomplete information.
    expect(await readDoc(t, CORP_A)).not.toBeNull();
  });
});
