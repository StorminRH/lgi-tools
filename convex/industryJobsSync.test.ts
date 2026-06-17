// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/lib/esi';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_jobssync_1';
const GEN = 1_700_000_000_000;
const SITE = 'https://app.test';
const EXP = new Date(Date.now() + 300_000).toUTCString();
const FUTURE = '2099-01-01T00:00:00Z';

const JOB = {
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
  ETag: 'j1',
  Expires: EXP,
  'X-Ratelimit-Group': 'char-industry',
  'X-Ratelimit-Limit': '600',
  'X-Ratelimit-Remaining': '599',
  'X-Ratelimit-Used': '1',
};

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
    dataset: 'industryJobs' as const,
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

function readDoc(t: TestConvex<typeof schema>, characterId = 101) {
  return t.run((ctx) =>
    ctx.db
      .query('industryJobsSync')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

function run(t: TestConvex<typeof schema>) {
  return t.action(internal.industryJobsSync.syncUser, { userId: USER, generation: GEN });
}

describe('industryJobsSync.syncUser', () => {
  it('throws when the deployment env is unset', async () => {
    vi.unstubAllEnvs();
    const t = convexTest(schema, modules);
    await expect(run(t)).rejects.toThrow(/SITE_URL/);
  });

  it('reads the jobs endpoint and applies a fresh board', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: () => jsonResponse([JOB], RL) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.data?.jobs.map((j) => j.job_id)).toEqual([1]);
    expect(doc?.data?.jobs[0]?.status).toBe('active');
    expect(doc?.jobsEtag).toBe('j1');
    expect(doc?.expiresAt).toBe(Date.parse(EXP));
    expect(doc?.syncError).toBeNull();
  });

  it('keeps the held board on a 304', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('industryJobsSync', {
        userId: USER,
        characterId: 101,
        data: { jobs: [JOB] },
        jobsEtag: 'j0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
    });
    stubFetch({ esi: () => new Response(null, { status: 304, headers: { Expires: EXP } }) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.data?.jobs.map((j) => j.job_id)).toEqual([1]);
    expect(doc?.jobsEtag).toBe('j0');
    expect((doc?.lastSyncedAt ?? 0) > GEN - 1000).toBe(true);
  });

  it('records reauth_required for an ineligible character without vending a token', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fetchFn = stubFetch({
      characters: [
        { characterId: 101, hasRefreshToken: true, missingScopes: ['esi-industry.read_character_jobs.v1'] },
      ],
    });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('reauth_required');
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
  });

  it('skips a character unlinked between enumeration and token vend (404)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ token: () => new Response(null, { status: 404 }) });

    await run(t);

    expect(await readDoc(t)).toBeNull();
  });

  it('records reauth_required on a 409 token vend', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ token: () => new Response(null, { status: 409 }) });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('reauth_required');
  });

  it('records token_unavailable on a failed token vend', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ token: () => new Response(null, { status: 500 }) });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('token_unavailable');
  });

  it('records an esi error code on a 4xx ESI read', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: () => new Response(null, { status: 403 }) });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('esi_403');
  });

  it('records contract_error when the ESI body fails the parse', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: () => jsonResponse({ not: 'an array' }, RL) });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('contract_error');
  });

  it('stops the run and records budget_exhausted when the gate refuses', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    __setScoreboardForTests('unavailable');
    stubFetch({});

    await run(t);

    const { doc, subject } = await t.run(async (ctx) => ({
      doc: await ctx.db
        .query('industryJobsSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
      subject: await ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'industryJobs'))
        .unique(),
    }));
    expect(doc?.syncError).toBe('budget_exhausted');
    expect(subject?.lastError?.startsWith('budget_exhausted:')).toBe(true);
  });
});
