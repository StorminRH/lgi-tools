import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESI_COMPATIBILITY_DATE } from '@/config/esi';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
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
  // 304 is a null-body status — the Response constructor rejects a body.
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
    __resetEsiGateForTests();
    // Pin the in-process scoreboard path even when a `vercel env pull` left
    // Upstash credentials in the local env (rate-limit.test.ts precedent).
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
    // The OAuth seam (3.4.4 carry-forward, landed with its first consumer in
    // 3.4.6): authenticated character reads hand the gate a bearer token via
    // init.headers and rely on it reaching ESI verbatim, while the gate still
    // applies its set-if-absent User-Agent default to the same request.
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
    // Prime the shared echo below the floor via a previous response.
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        'X-ESI-Error-Limit-Remain': String(ESI_BUDGET_FLOOR - 1),
      }),
    );
    await esiFetch(TEST_URL);

    const err = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((err as EsiBudgetExhaustedError).reason).toBe('error_budget');
    // Refusal happened before fetch — still only one call recorded.
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('refuses from the self-count alone when responses carry no error-limit headers', async () => {
    // Routes under the new token-bucket limiter do not send the legacy
    // headers, so the mirror must close on our own error tally. 100-error
    // ceiling − 81 errors = 19 remaining < floor of 20.
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
    // ESI sends 420 when the limit is tripped; the Remain header on that
    // response may be stale, so the echo is forced to zero.
    fetchSpy.mockResolvedValueOnce(
      mockResponse(420, { 'X-ESI-Error-Limit-Remain': '50' }),
    );

    const first = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((first as EsiBudgetExhaustedError).reason).toBe('esi_420');

    const second = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((second as EsiBudgetExhaustedError).reason).toBe('error_budget');
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

    // Same route (different query) refuses pre-dispatch...
    const blocked = await esiFetch(
      'https://esi.evetech.net/markets/10000002/orders/?type_id=35',
    ).catch((e: unknown) => e);
    expect(blocked).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((blocked as EsiBudgetExhaustedError).reason).toBe('rate_limited');
    expect((blocked as EsiBudgetExhaustedError).retryAfterSeconds).toBe(30);

    // ...a different route still dispatches...
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const other = await esiFetch('https://esi.evetech.net/universe/types/34/');
    expect(other.status).toBe(200);

    // ...and the block lifts after Retry-After.
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
            // Only a fixed Content-Length makes a body cache-eligible now (real
            // ESI sends one only on small fixed-length responses); '{"a":1}' is
            // 7 bytes. Without it the chunked-no-CL guard would skip caching and
            // there'd be no stored body for the 304 to revalidate against.
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
      // Content-Length makes this 200 cache-eligible so an ETag is actually
      // stored; without it the chunked-no-CL guard skips caching and the
      // assertion below would pass vacuously (no stored ETag to attach).
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
      // A fixed Content-Length over the cap is excluded by the pre-check before
      // any read. (new Response(string) carries no Content-Length, so set it
      // explicitly to exercise the CL-present > cap exclusion specifically.)
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
      // ESI streams nearly every 200 chunked with no Content-Length. The gate
      // must NOT read such a body for the cache — reading it via res.clone() is
      // what intermittently consumed the CALLER's body (the 3.5.1b "Body has
      // already been read" bug). The undici consumption race itself is not
      // reproducible against mocked Responses (verified live), so this asserts
      // the structural guarantee: a no-CL 200 is left uncached (no conditional
      // request next time) and its body stays readable here.
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
    // A 200 carrying ETag + Content-Length + a future Expires: cache-eligible
    // AND inside ESI's own freshness window. '{"a":1}' is 7 bytes.
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
      vi.setSystemTime(new Date('2026-06-25T01:00:00Z')); // 5 min before Expires
      fetchSpy.mockResolvedValueOnce(primingResponse());

      const first = await esiFetch(TEST_URL);
      expect(await first.json()).toEqual({ a: 1 });
      expect(fetchSpy).toHaveBeenCalledOnce();

      // Second read, still inside the window: no outbound call, served from the
      // cached body. Two within-window reads → exactly one ESI request.
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

      // Past the Expires (+ skew): the gate re-asks ESI, conditionally.
      vi.setSystemTime(new Date('2026-06-25T01:10:00Z'));
      fetchSpy.mockResolvedValueOnce(mockResponse(304, { ETag: '"abc"' }));
      const second = await esiFetch(TEST_URL);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBe('"abc"');
      expect(second.status).toBe(200);
      // The 304-reuse path, distinct from the no-dispatch window serve.
      expect(second.headers.get('x-lgi-esi-cache')).toBe('revalidated');
    });

    it('never serves an Authorization-carrying GET from the shared cache', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T01:00:00Z'));
      // Prime the shared cache with an unauthenticated read inside the window.
      fetchSpy.mockResolvedValueOnce(primingResponse());
      await esiFetch(TEST_URL);
      expect(fetchSpy).toHaveBeenCalledOnce();

      // Same URL, still inside the window, but carrying a bearer token: must
      // dispatch every time and get ESI's own body, never the cached one.
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
      // Future Expires (window open) but the body is gone from the scoreboard.
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
        report: vi.fn().mockResolvedValue(undefined),
        getCachedBody,
      };
      __setScoreboardForTests(fake);

      fetchSpy.mockResolvedValueOnce(mockResponse(200, { ETag: '"abc"' }, { a: 9 }));
      const res = await esiFetch(TEST_URL);

      expect(getCachedBody).toHaveBeenCalledTimes(1); // it tried the cache...
      expect(fetchSpy).toHaveBeenCalledTimes(1); // ...then dispatched once
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
        report: vi.fn().mockResolvedValue(undefined),
        getCachedBody: vi.fn().mockResolvedValue(null),
      };
      __setScoreboardForTests(fake);

      await expect(esiFetch(TEST_URL)).rejects.toMatchObject({
        reason: 'scoreboard_unavailable',
      });
      expect(preDispatch).toHaveBeenCalledTimes(1);

      // Within the 5s memo the scoreboard is not re-consulted.
      await expect(esiFetch(TEST_URL)).rejects.toMatchObject({
        reason: 'scoreboard_unavailable',
      });
      expect(preDispatch).toHaveBeenCalledTimes(1);

      // After the memo expires it is consulted again; recovery is automatic.
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
      // Two fresh module instances simulate two Lambdas: each has private
      // module state, both point at one scoreboard. With the old per-Lambda
      // budget, instance B's first call would have dispatched blind.
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
