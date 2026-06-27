// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetEsiGateForTests, __setScoreboardForTests } from '@/lib/esi';
import { readEsiPaged, type RlSnapshot } from './esiRead';

// Permissive in-memory scoreboard so esiFetch dispatches deterministically (the
// real gate fails closed for non-interactive callers without Upstash).
const permissiveScoreboard = {
  async preDispatch() {
    return { effectiveRemaining: 1000, blockedRetryAfter: null, etag: null };
  },
  async report() {},
  async getCachedBody() {
    return null;
  },
};

const EXP = new Date(Date.now() + 3_600_000).toUTCString();
const PATH = '/characters/101/blueprints/';

function rl(): RlSnapshot {
  return { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
}

function jsonResponse(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function bp(typeId: number) {
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

beforeEach(() => {
  __setScoreboardForTests(permissiveScoreboard);
});

afterEach(() => {
  vi.unstubAllGlobals();
  __resetEsiGateForTests();
});

describe('readEsiPaged', () => {
  it('returns a single page fresh with its etag and expiry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse([bp(1000)], { ETag: 'e1', Expires: EXP, 'X-Pages': '1' })),
    );

    const out = await readEsiPaged(PATH, 'tok', [], rl());
    expect(out.kind).toBe('fresh');
    if (out.kind !== 'fresh') return;
    expect(out.items).toEqual([bp(1000)]);
    expect(out.etags).toEqual(['e1']);
    expect(out.expiresAt).toBe(Date.parse(EXP));
  });

  it('returns unchanged on a single-page 304 against the held etag', async () => {
    const fetchFn = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 304, headers: { Expires: EXP, 'X-Pages': '1' } }),
    );
    vi.stubGlobal('fetch', fetchFn);

    const out = await readEsiPaged(PATH, 'tok', ['e1'], rl());
    expect(out.kind).toBe('unchanged');
    // The held page-1 etag was replayed as a conditional request.
    const [, init] = fetchFn.mock.calls[0];
    expect(new Headers(init?.headers).get('if-none-match')).toBe('e1');
  });

  it('assembles every page in order and collects per-page etags (multi-page)', async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('page=2')) {
        return jsonResponse([bp(3000)], { ETag: 'e2', Expires: EXP, 'X-Pages': '2' });
      }
      return jsonResponse([bp(1000), bp(2000)], { ETag: 'e1', Expires: EXP, 'X-Pages': '2' });
    });
    vi.stubGlobal('fetch', fetchFn);

    const out = await readEsiPaged(PATH, 'tok', [], rl());
    expect(out.kind).toBe('fresh');
    if (out.kind !== 'fresh') return;
    expect(out.items).toEqual([bp(1000), bp(2000), bp(3000)]);
    expect(out.etags).toEqual(['e1', 'e2']);
  });

  it('surfaces a 4xx as an error code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await readEsiPaged(PATH, 'tok', [], rl())).toEqual({ kind: 'error', code: 'esi_404' });
  });

  it('treats a non-array body as a contract error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ not: 'an array' }, { ETag: 'e1', Expires: EXP, 'X-Pages': '1' })),
    );
    expect(await readEsiPaged(PATH, 'tok', [], rl())).toEqual({ kind: 'error', code: 'contract_error' });
  });
});
