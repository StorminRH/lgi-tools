import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';

const mocks = vi.hoisted(() => ({
  markRecentBudgetExhaustion: vi.fn(),
}));
vi.mock('./exhaustion-marker', () => ({
  markRecentBudgetExhaustion: mocks.markRecentBudgetExhaustion,
}));

import {
  __resetEsiGateForTests,
  __setScoreboardForTests,
  ESI_BUDGET_FLOOR,
  EsiBudgetExhaustedError,
  EsiServerError,
  esiFetch,
  esiUrl,
} from './index';
import { BODY_CACHE_MAX_BYTES, type EsiScoreboard } from './scoreboard';

const TEST_URL = 'https://esi.evetech.net/markets/10000002/orders/?type_id=34';

function mockResponse(
  status: number,
  headers: Record<string, string> = {},
  body: unknown = {},
): Response {

  if (status === 304) return new Response(null, { status, headers });
  return new Response(JSON.stringify(body), { status, headers });
}

function requestHeaders(
  fetchSpy: ReturnType<typeof vi.spyOn>,
  call: number,
): Headers {
  const init = fetchSpy.mock.calls[call][1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('esiFetch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.markRecentBudgetExhaustion.mockClear();
    __resetEsiGateForTests();

    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('dispatches the request and returns the response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { 'X-ESI-Error-Limit-Remain': '95' }),
    );

    const res = await esiFetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('exposes expires and rate headers to the caller', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        Expires: 'Wed, 11 Jun 2026 12:00:00 GMT',
        'X-Ratelimit-Group': 'market-orders',
        'X-Ratelimit-Remaining': '11990',
      }),
    );

    const res = await esiFetch(TEST_URL);

    expect(res.headers.get('Expires')).toBe('Wed, 11 Jun 2026 12:00:00 GMT');
    expect(res.headers.get('X-Ratelimit-Group')).toBe('market-orders');
    expect(res.headers.get('X-Ratelimit-Remaining')).toBe('11990');
  });

  it('sends the outbound User-Agent on every ESI call', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));

    await esiFetch(TEST_URL);

    expect(requestHeaders(fetchSpy, 0).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });

  it('passes the caller Authorization header through untouched alongside the default User-Agent', async () => {

    fetchSpy.mockResolvedValueOnce(mockResponse(200));

    await esiFetch(TEST_URL, {
      headers: { Authorization: 'Bearer caller-token' },
    });

    const headers = requestHeaders(fetchSpy, 0);
    expect(headers.get('Authorization')).toBe('Bearer caller-token');
    expect(headers.get('User-Agent')).toBe(OUTBOUND_USER_AGENT);
  });

  it('sends the X-Compatibility-Date header to pin the ESI contract', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200));

    await esiFetch(TEST_URL);

    expect(requestHeaders(fetchSpy, 0).get('X-Compatibility-Date')).toBe(
      ESI_COMPATIBILITY_DATE,
    );
  });

  it('builds ESI URLs from the gate-owned base via esiUrl', () => {
    expect(esiUrl('/markets/10000002/orders/')).toBe(
      'https://esi.evetech.net/markets/10000002/orders/',
    );
  });

  it('refuses to dispatch when the echoed remaining count is below the floor', async () => {

    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        'X-ESI-Error-Limit-Remain': String(ESI_BUDGET_FLOOR - 1),
      }),
    );
    await esiFetch(TEST_URL);

    const err = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((err as EsiBudgetExhaustedError).reason).toBe('error_budget');
    expect(mocks.markRecentBudgetExhaustion).toHaveBeenCalledOnce();

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('refuses from the self-count alone when responses carry no error-limit headers', async () => {

    fetchSpy.mockResolvedValue(mockResponse(404));
    for (let i = 0; i < 81; i++) {
      await esiFetch(TEST_URL);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(81);

    const err = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((err as EsiBudgetExhaustedError).reason).toBe('error_budget');
    expect(fetchSpy).toHaveBeenCalledTimes(81);
  });

  it('throws EsiServerError on 5xx', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(503, { 'X-ESI-Error-Limit-Remain': '88' }),
    );

    const err = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EsiServerError);
    expect((err as EsiServerError).status).toBe(503);
  });

  it('throws on 420 and refuses subsequent calls regardless of header value', async () => {

    fetchSpy.mockResolvedValueOnce(
      mockResponse(420, { 'X-ESI-Error-Limit-Remain': '50' }),
    );

    const first = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((first as EsiBudgetExhaustedError).reason).toBe('esi_420');
    expect(mocks.markRecentBudgetExhaustion).toHaveBeenCalledOnce();

    const second = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((second as EsiBudgetExhaustedError).reason).toBe('error_budget');
    expect(mocks.markRecentBudgetExhaustion).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('keeps dispatching when the remaining header is missing or garbage', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(200))
      .mockResolvedValueOnce(
        mockResponse(200, { 'X-ESI-Error-Limit-Remain': 'not-a-number' }),
      )
      .mockResolvedValueOnce(mockResponse(200));

    await esiFetch(TEST_URL);
    await esiFetch(TEST_URL);
    const res = await esiFetch(TEST_URL);

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns 4xx responses to the caller without throwing', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(404));

    const res = await esiFetch(TEST_URL);
    expect(res.status).toBe(404);
  });

  it('throws a metadata-rich 429 deferral, then blocks the route until Retry-After elapses', async () => {
    vi.useFakeTimers();
    fetchSpy.mockResolvedValueOnce(
      mockResponse(429, { 'Retry-After': '30' }),
    );

    const immediate = await esiFetch(TEST_URL).catch((error: unknown) => error);
    expect(immediate).toBeInstanceOf(EsiBudgetExhaustedError);
    expect(immediate).toMatchObject({
      reason: 'rate_limited',
      retryAfterSeconds: 30,
      resource: '/markets/{n}/orders',
    });
    expect(mocks.markRecentBudgetExhaustion).toHaveBeenCalledOnce();

    const blocked = await esiFetch(
      'https://esi.evetech.net/markets/10000002/orders/?type_id=35',
    ).catch((e: unknown) => e);
    expect(blocked).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((blocked as EsiBudgetExhaustedError).reason).toBe('rate_limited');
    expect((blocked as EsiBudgetExhaustedError).retryAfterSeconds).toBe(30);
    expect(mocks.markRecentBudgetExhaustion).toHaveBeenCalledTimes(2);

    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const other = await esiFetch('https://esi.evetech.net/universe/types/34/');
    expect(other.status).toBe(200);

    vi.advanceTimersByTime(31_000);
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const after = await esiFetch(TEST_URL);
    expect(after.status).toBe(200);
  });

  describe('ETag revalidation', () => {
    it('stores an ETag on 200 and serves a 304 as a synthesized 200', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse(
          200,
          {
            ETag: '"abc"',
            'Content-Type': 'application/json',
            Expires: 'Wed, 11 Jun 2026 12:00:00 GMT',

            'Content-Length': '7',
          },
          { a: 1 },
        ),
      );
      const first = await esiFetch(TEST_URL);
      expect(await first.json()).toEqual({ a: 1 });
      expect(requestHeaders(fetchSpy, 0).get('If-None-Match')).toBeNull();

      fetchSpy.mockResolvedValueOnce(
        mockResponse(304, {
          ETag: '"abc"',
          Expires: 'Wed, 11 Jun 2026 12:05:00 GMT',
        }),
      );
      const second = await esiFetch(TEST_URL);

      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBe('"abc"');
      expect(second.status).toBe(200);
      expect(second.ok).toBe(true);
      expect(second.headers.get('x-lgi-esi-cache')).toBe('revalidated');
      expect(second.headers.get('Expires')).toBe(
        'Wed, 11 Jun 2026 12:05:00 GMT',
      );
      expect(await second.json()).toEqual({ a: 1 });
    });

    it('never attaches If-None-Match to requests carrying Authorization', async () => {

      fetchSpy.mockResolvedValueOnce(
        mockResponse(200, { ETag: '"abc"', 'Content-Length': '7' }, { a: 1 }),
      );
      await esiFetch(TEST_URL);

      fetchSpy.mockResolvedValueOnce(mockResponse(200));
      await esiFetch(TEST_URL, {
        headers: { Authorization: 'Bearer token' },
      });

      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBeNull();
    });

    it('does not cache a fixed-length body over the size cap', async () => {

      const big = 'x'.repeat(BODY_CACHE_MAX_BYTES + 1);
      fetchSpy.mockResolvedValueOnce(
        new Response(big, {
          status: 200,
          headers: {
            ETag: '"big"',
            'Content-Length': String(BODY_CACHE_MAX_BYTES + 1),
          },
        }),
      );
      await esiFetch(TEST_URL);

      fetchSpy.mockResolvedValueOnce(mockResponse(200));
      await esiFetch(TEST_URL);

      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBeNull();
    });

    it('does not cache a chunked (no Content-Length) 200, leaving the body for the caller', async () => {

      const body = { systems: [1, 2, 3] };
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { ETag: '"chunked"' },
        }),
      );
      const first = await esiFetch(TEST_URL);
      expect(await first.json()).toEqual(body);

      fetchSpy.mockResolvedValueOnce(mockResponse(200));
      await esiFetch(TEST_URL);

      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBeNull();
    });

    it('retries exactly once without If-None-Match when the cached body is gone', async () => {
      const fake: EsiScoreboard = {
        preDispatch: vi.fn().mockResolvedValue({
          effectiveRemaining: 100,
          blockedRetryAfter: null,
          etag: { etag: '"abc"', expires: null, contentType: null },
        }),
        budgetSnapshot: vi.fn().mockResolvedValue({
          effectiveRemaining: 100,
          selfCount: 0,
          echo: null,
          source: 'process-local',
        }),
        report: vi.fn().mockResolvedValue(undefined),
        getCachedBody: vi.fn().mockResolvedValue(null),
      };
      __setScoreboardForTests(fake);

      fetchSpy
        .mockResolvedValueOnce(mockResponse(304, { ETag: '"abc"' }))
        .mockResolvedValueOnce(mockResponse(200, {}, { a: 2 }));

      const res = await esiFetch(TEST_URL);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestHeaders(fetchSpy, 0).get('If-None-Match')).toBe('"abc"');
      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBeNull();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ a: 2 });
    });
  });

  describe('within-window cache serve', () => {

    function primingResponse(): Response {
      return mockResponse(
        200,
        {
          ETag: '"abc"',
          'Content-Type': 'application/json',
          Expires: 'Thu, 25 Jun 2026 01:05:00 GMT',
          'Content-Length': '7',
        },
        { a: 1 },
      );
    }

    it('serves the stored body with no dispatch while the Expires window is open', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T01:00:00Z'));
      fetchSpy.mockResolvedValueOnce(primingResponse());

      const first = await esiFetch(TEST_URL);
      expect(await first.json()).toEqual({ a: 1 });
      expect(fetchSpy).toHaveBeenCalledOnce();

      const second = await esiFetch(TEST_URL);
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(second.status).toBe(200);
      expect(second.headers.get('x-lgi-esi-cache')).toBe('window');
      expect(await second.json()).toEqual({ a: 1 });
    });

    it('dispatches a conditional request once the Expires window has passed', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T01:00:00Z'));
      fetchSpy.mockResolvedValueOnce(primingResponse());
      await esiFetch(TEST_URL);
      expect(fetchSpy).toHaveBeenCalledOnce();

      vi.setSystemTime(new Date('2026-06-25T01:10:00Z'));
      fetchSpy.mockResolvedValueOnce(mockResponse(304, { ETag: '"abc"' }));
      const second = await esiFetch(TEST_URL);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBe('"abc"');
      expect(second.status).toBe(200);

      expect(second.headers.get('x-lgi-esi-cache')).toBe('revalidated');
    });

    it('never serves an Authorization-carrying GET from the shared cache', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T01:00:00Z'));

      fetchSpy.mockResolvedValueOnce(primingResponse());
      await esiFetch(TEST_URL);
      expect(fetchSpy).toHaveBeenCalledOnce();

      fetchSpy.mockResolvedValueOnce(mockResponse(200, {}, { a: 2 }));
      const authed = await esiFetch(TEST_URL, {
        headers: { Authorization: 'Bearer token' },
      });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBeNull();
      expect(authed.headers.get('x-lgi-esi-cache')).toBeNull();
      expect(await authed.json()).toEqual({ a: 2 });
    });

    it('falls through to a normal dispatch when the body was evicted mid-window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T01:00:00Z'));

      const getCachedBody = vi.fn().mockResolvedValue(null);
      const fake: EsiScoreboard = {
        preDispatch: vi.fn().mockResolvedValue({
          effectiveRemaining: 100,
          blockedRetryAfter: null,
          etag: {
            etag: '"abc"',
            expires: 'Thu, 25 Jun 2026 01:05:00 GMT',
            contentType: 'application/json',
          },
        }),
        budgetSnapshot: vi.fn().mockResolvedValue({
          effectiveRemaining: 100,
          selfCount: 0,
          echo: null,
          source: 'process-local',
        }),
        report: vi.fn().mockResolvedValue(undefined),
        getCachedBody,
      };
      __setScoreboardForTests(fake);

      fetchSpy.mockResolvedValueOnce(mockResponse(200, { ETag: '"abc"' }, { a: 9 }));
      const res = await esiFetch(TEST_URL);

      expect(getCachedBody).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(requestHeaders(fetchSpy, 0).get('If-None-Match')).toBe('"abc"');
      expect(res.status).toBe(200);
      expect(res.headers.get('x-lgi-esi-cache')).toBeNull();
      expect(await res.json()).toEqual({ a: 9 });
    });
  });

  describe('fail-closed when the scoreboard is unavailable', () => {
    it('refuses non-interactive dispatch without calling fetch', async () => {
      __setScoreboardForTests('unavailable');

      const err = await esiFetch(TEST_URL).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EsiBudgetExhaustedError);
      expect((err as EsiBudgetExhaustedError).reason).toBe(
        'scoreboard_unavailable',
      );
      expect(mocks.markRecentBudgetExhaustion).toHaveBeenCalledOnce();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows interactive calls a hard-capped trickle that resets each minute', async () => {
      vi.useFakeTimers();
      __setScoreboardForTests('unavailable');
      fetchSpy.mockResolvedValue(mockResponse(200));

      for (let i = 0; i < 10; i++) {
        const res = await esiFetch(TEST_URL, undefined, { interactive: true });
        expect(res.status).toBe(200);
      }

      const capped = await esiFetch(TEST_URL, undefined, {
        interactive: true,
      }).catch((e: unknown) => e);
      expect(capped).toBeInstanceOf(EsiBudgetExhaustedError);
      expect((capped as EsiBudgetExhaustedError).reason).toBe('trickle_capped');
      expect(mocks.markRecentBudgetExhaustion).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledTimes(10);

      vi.advanceTimersByTime(60_001);
      const next = await esiFetch(TEST_URL, undefined, { interactive: true });
      expect(next.status).toBe(200);
    });

    it('skips the scoreboard while the outage memo is open and recovers after it', async () => {
      vi.useFakeTimers();
      const preDispatch = vi.fn().mockRejectedValue(new Error('redis down'));
      const fake: EsiScoreboard = {
        preDispatch,
        budgetSnapshot: vi.fn().mockResolvedValue({
          effectiveRemaining: 100,
          selfCount: 0,
          echo: null,
          source: 'process-local',
        }),
        report: vi.fn().mockResolvedValue(undefined),
        getCachedBody: vi.fn().mockResolvedValue(null),
      };
      __setScoreboardForTests(fake);

      await expect(esiFetch(TEST_URL)).rejects.toMatchObject({
        reason: 'scoreboard_unavailable',
      });
      expect(preDispatch).toHaveBeenCalledTimes(1);

      await expect(esiFetch(TEST_URL)).rejects.toMatchObject({
        reason: 'scoreboard_unavailable',
      });
      expect(preDispatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(5_001);
      preDispatch.mockResolvedValue({
        effectiveRemaining: 100,
        blockedRetryAfter: null,
        etag: null,
      });
      fetchSpy.mockResolvedValueOnce(mockResponse(200));
      const res = await esiFetch(TEST_URL);
      expect(res.status).toBe(200);
      expect(preDispatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('shared scoreboard across gate instances', () => {
    afterEach(() => {
      vi.resetModules();
    });

    it("one instance's spend closes another instance's gate", async () => {

      vi.resetModules();
      const scoreboardMod = await import('./scoreboard');
      const shared = scoreboardMod.resolveScoreboard();
      expect(shared).not.toBeNull();

      const gateA = await import('./index');
      gateA.__setScoreboardForTests(shared);
      fetchSpy.mockResolvedValueOnce(
        mockResponse(200, { 'X-ESI-Error-Limit-Remain': '5' }),
      );
      await gateA.esiFetch(TEST_URL);

      vi.resetModules();
      const gateB = await import('./index');
      gateB.__setScoreboardForTests(shared);

      await expect(gateB.esiFetch(TEST_URL)).rejects.toMatchObject({
        name: 'EsiBudgetExhaustedError',
        reason: 'error_budget',
      });
      expect(fetchSpy).toHaveBeenCalledOnce();
    });
  });
});
