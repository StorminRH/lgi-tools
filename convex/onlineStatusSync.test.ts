// @vitest-environment edge-runtime
import { convexTest, type TestConvex } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/lib/esi';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob(['./**/*.ts', '!./**/*.test.ts']);

const USER = 'user_onlinesync_1';
const GEN = 1_700_000_000_000;
const SITE = 'https://app.test';
const EXP = new Date(Date.now() + 60_000).toUTCString();

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
  ETag: 'o1',
  Expires: EXP,
  'X-Ratelimit-Group': 'char-online',
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
    dataset: 'onlineStatus' as const,
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
      .query('characterOnline')
      .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', characterId))
      .unique(),
  );
}

function run(t: TestConvex<typeof schema>) {
  return t.action(internal.onlineStatusSync.syncUser, { userId: USER, generation: GEN });
}

describe('onlineStatusSync.syncUser', () => {
  it('throws when the deployment env is unset', async () => {
    vi.unstubAllEnvs();
    const t = convexTest(schema, modules);
    await expect(run(t)).rejects.toThrow(/SITE_URL/);
  });

  it('reads /online and stores online:true with its etag', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: () => jsonResponse({ online: true }, RL) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.online).toBe(true);
    expect(doc?.etag).toBe('o1');
  });

  it('stores online:false for an offline character', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: () => jsonResponse({ online: false }, RL) });

    await run(t);

    expect((await readDoc(t))?.online).toBe(false);
  });

  it('keeps the held state on a 304 (no write)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const before = await t.run(async (ctx) =>
      ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'o0' }),
    );
    stubFetch({ esi: () => new Response(null, { status: 304, headers: { Expires: EXP } }) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.online).toBe(true);
    expect(doc?.etag).toBe('o0');
    // Byte-identical — the 304 wrote nothing (no spurious forViewer re-fire).
    expect(doc?._id).toBe(before);
    expect(doc?._creationTime).toBe(
      (await t.run((ctx) => ctx.db.get(before)))?._creationTime,
    );
  });

  it('flips a stored online:true to false on a fresh body', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await t.run((ctx) =>
      ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'o0' }),
    );
    stubFetch({ esi: () => jsonResponse({ online: false }, { ...RL, ETag: 'o2' }) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.online).toBe(false);
    expect(doc?.etag).toBe('o2');
  });

  it('does not write when a fresh 200 carries unchanged content (the no-op guard)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const id = await t.run((ctx) =>
      ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'o0' }),
    );
    const creationTime = (await t.run((ctx) => ctx.db.get(id)))?._creationTime;
    // A 200 whose parsed value AND etag equal the stored doc — the guard skips it.
    stubFetch({ esi: () => jsonResponse({ online: true }, { ...RL, ETag: 'o0' }) });

    await run(t);

    expect((await readDoc(t))?._creationTime).toBe(creationTime);
  });

  it('records no doc for an ineligible character and never vends a token', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    const fetchFn = stubFetch({
      characters: [
        { characterId: 101, hasRefreshToken: true, missingScopes: ['esi-location.read_online.v1'] },
      ],
    });

    await run(t);

    expect(await readDoc(t)).toBeNull();
    expect(fetchFn.mock.calls.some(([u]) => String(u).endsWith('/eve-token'))).toBe(false);
  });

  it('skips a character unlinked between enumeration and token vend (404)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ token: () => new Response(null, { status: 404 }) });

    await run(t);

    expect(await readDoc(t)).toBeNull();
  });

  it('writes nothing on a 409 token vend (reauth required)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ token: () => new Response(null, { status: 409 }) });

    await run(t);

    expect(await readDoc(t)).toBeNull();
  });

  it('writes nothing on a failed token vend', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ token: () => new Response(null, { status: 500 }) });

    await run(t);

    expect(await readDoc(t)).toBeNull();
  });

  it('writes nothing on a 4xx ESI read and keeps the last-known doc', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    await t.run((ctx) =>
      ctx.db.insert('characterOnline', { userId: USER, characterId: 101, online: true, etag: 'o0' }),
    );
    stubFetch({ esi: () => new Response(null, { status: 403 }) });

    await run(t);

    const doc = await readDoc(t);
    expect(doc?.online).toBe(true);
    expect(doc?.etag).toBe('o0');
  });

  it('writes nothing when the ESI body fails the parse (contract error)', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    stubFetch({ esi: () => jsonResponse({ not: 'online' }, RL) });

    await run(t);

    expect(await readDoc(t)).toBeNull();
  });

  it('stops the run and records budget_exhausted on the subject when the gate refuses', async () => {
    const t = convexTest(schema, modules);
    await seedSubject(t);
    __setScoreboardForTests('unavailable');
    stubFetch({});

    await run(t);

    const { doc, subject } = await t.run(async (ctx) => ({
      doc: await ctx.db
        .query('characterOnline')
        .withIndex('by_user_character', (q) => q.eq('userId', USER).eq('characterId', 101))
        .unique(),
      subject: await ctx.db
        .query('syncSubjects')
        .withIndex('by_user_dataset', (q) => q.eq('userId', USER).eq('dataset', 'onlineStatus'))
        .unique(),
    }));
    expect(doc).toBeNull();
    expect(subject?.lastError?.startsWith('budget_exhausted:')).toBe(true);
  });
});
