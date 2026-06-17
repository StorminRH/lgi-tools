// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/lib/esi';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_skillssync_1';
const GEN = 1_700_000_000_000;
const SITE = 'https://app.test';
const EXP = new Date(Date.now() + 60_000).toUTCString();
const ENTRY = { skill_id: 1, queue_position: 0, finished_level: 5 };

// Permissive in-memory scoreboard so esiFetch dispatches deterministically
// (the real gate fails closed for non-interactive callers without Upstash).
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
  ETag: 'q1',
  Expires: EXP,
  'X-Ratelimit-Group': 'char-detail',
  'X-Ratelimit-Limit': '600',
  'X-Ratelimit-Remaining': '599',
  'X-Ratelimit-Used': '1',
};

type Character = { characterId: number; hasRefreshToken: boolean; missingScopes: string[] };

function eligible(characterId = 101): Character {
  return { characterId, hasRefreshToken: true, missingScopes: [] };
}

// Route fetch: the two Next internal endpoints plus a per-test ESI handler.
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

function freshEsi(url: string): Response {
  if (url.includes('/skillqueue')) return jsonResponse([ENTRY], RL);
  if (url.includes('/skills')) return jsonResponse({ total_sp: 1000 }, { ETag: 's1', Expires: EXP });
  throw new Error(`unexpected esi url ${url}`);
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
    dataset: 'skills' as const,
    userId: USER,
    status: 'running' as const,
    lastRequestedAt: GEN,
    workId: 'w1',
    nextDueAt: GEN + 60_000,
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
      .query('characterSync')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

function run(t: TestConvex<typeof schema>) {
  return t.action(internal.skillsSync.syncUser, { userId: USER, generation: GEN });
}

describe('skillsSync.syncUser', () => {
  it('throws when the deployment env is unset', async () => {
    vi.unstubAllEnvs();
    const t = convexTest(schema, modules);
    await expect(run(t)).rejects.toThrow(/SITE_URL/);
  });

  it('reads both endpoints and applies a fresh character payload', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: freshEsi });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.data).toEqual({ entries: [ENTRY], totalSp: 1000 });
    expect(doc?.queueEtag).toBe('q1');
    expect(doc?.skillsEtag).toBe('s1');
    expect(doc?.expiresAt).toBe(Date.parse(EXP));
    expect(doc?.syncError).toBeNull();
  });

  it('keeps the held payload on a 304 from both endpoints', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('characterSync', {
        userId: USER,
        characterId: 101,
        data: { entries: [ENTRY], totalSp: 500 },
        queueEtag: 'q0',
        skillsEtag: 's0',
        lastSyncedAt: GEN - 1000,
        expiresAt: GEN - 1,
        syncError: null,
      });
    });
    stubFetch({ esi: () => new Response(null, { status: 304, headers: { Expires: EXP } }) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.data).toEqual({ entries: [ENTRY], totalSp: 500 });
    expect(doc?.queueEtag).toBe('q0');
    expect(doc?.skillsEtag).toBe('s0');
    expect((doc?.lastSyncedAt ?? 0) > GEN - 1000).toBe(true);
  });

  it('records reauth_required for an ineligible character without vending a token', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fetchFn = stubFetch({
      characters: [{ characterId: 101, hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }],
    });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.syncError).toBe('reauth_required');
    expect(doc?.data).toBeNull();
    const calledToken = fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'));
    expect(calledToken).toBe(false);
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

  it('records an esi error code on a 4xx ESI read and skips the second read', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fetchFn = stubFetch({
      esi: (url) => {
        if (url.includes('/skillqueue')) return new Response(null, { status: 403 });
        return jsonResponse({ total_sp: 1 }, { ETag: 's1', Expires: EXP });
      },
    });

    await run(t);

    expect((await readDoc(t))?.syncError).toBe('esi_403');
    const calledSkills = fetchFn.mock.calls.some(([u]) => String(u).includes('/skills/'));
    expect(calledSkills).toBe(false);
  });

  it('records contract_error when an ESI body fails the parse', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({
      esi: (url) => {
        if (url.includes('/skillqueue')) return jsonResponse({ not: 'an array' }, RL);
        return jsonResponse({ total_sp: 1 }, { ETag: 's1', Expires: EXP });
      },
    });

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
        .query('characterSync')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
      subject: await ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'skills'))
        .unique(),
    }));
    expect(doc?.syncError).toBe('budget_exhausted');
    expect(subject?.lastError?.startsWith('budget_exhausted:')).toBe(true);
  });
});
