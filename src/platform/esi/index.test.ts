import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
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
import type { EsiScoreboard } from './scoreboard';
import {
  setDependencyTimingSink,
  type DependencyCall,
  type DependencyKind,
} from '@/lib/dependency-timing';
import { setWorkDeferrer } from '@/lib/deferred-work';

function captureEsiCalls(): (DependencyCall | undefined)[] {
  const calls: (DependencyCall | undefined)[] = [];
  setDependencyTimingSink((kind, _ms, call) => {
    if (kind === 'esi') calls.push(call);
  });
  return calls;
}

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
  let warnSpy: ReturnType<typeof silenceConsolePrefixes>;

  beforeEach(() => {
    __resetEsiGateForTests();
    vi.stubEnv('KV_REST_API_URL', '');
    vi.stubEnv('KV_REST_API_TOKEN', '');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    warnSpy = silenceConsolePrefixes('warn', ['[esi] scoreboard pre-dispatch failed', '[esi] server error']);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('reports a dispatch that got no answer to the scoreboard before rethrowing', async () => {
    const report = vi.fn().mockResolvedValue(undefined);
    __setScoreboardForTests({
      preDispatch: vi.fn().mockResolvedValue({ effectiveRemaining: 100, blockedRetryAfter: null }),
      budgetSnapshot: vi.fn(),
      availabilitySnapshot: vi.fn(),
      report,
    });
    fetchSpy.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(esiFetch(TEST_URL)).rejects.toThrow('socket hang up');
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ url: TEST_URL, status: 0 }));
  });

  it('does not report a request its own caller cancelled', async () => {
    const report = vi.fn().mockResolvedValue(undefined);
    __setScoreboardForTests({
      preDispatch: vi.fn().mockResolvedValue({ effectiveRemaining: 100, blockedRetryAfter: null }),
      budgetSnapshot: vi.fn(),
      availabilitySnapshot: vi.fn(),
      report,
    });
    const caller = new AbortController();
    fetchSpy.mockImplementationOnce(async () => {
      caller.abort();
      throw new DOMException('This operation was aborted', 'AbortError');
    });

    await expect(esiFetch(TEST_URL, { signal: caller.signal })).rejects.toThrow('aborted');
    expect(report).not.toHaveBeenCalled();
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

  it('throws EsiServerError on 5xx, keeping and logging the body, the x-esi-* headers and Expires', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(
        503,
        {
          'X-ESI-Error-Limit-Remain': '88',
          'X-ESI-Request-ID': 'req-1',
          'Content-Type': 'application/json',
          Expires: 'Mon, 12 Oct 2026 11:30:00 GMT',
        },
        { error: 'Tranquility is down' },
      ),
    );

    const err = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EsiServerError);
    const kept = { 'x-esi-error-limit-remain': '88', 'x-esi-request-id': 'req-1', expires: 'Mon, 12 Oct 2026 11:30:00 GMT' };
    expect(err).toMatchObject({
      status: 503,
      body: '{"error":"Tranquility is down"}',
      esiHeaders: kept,
    });
    expect(warnSpy).toHaveBeenCalledWith('[esi] server error', {
      status: 503,
      path: '/markets/{n}/orders',
      headers: kept,
      body: '{"error":"Tranquility is down"}',
    });
  });

  it('still throws EsiServerError when the 5xx body cannot be read', async () => {
    const broken = new ReadableStream({
      start(controller) {
        controller.error(new Error('connection reset'));
      },
    });
    fetchSpy.mockResolvedValueOnce(new Response(broken, { status: 502 }));

    const err = await esiFetch(TEST_URL).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EsiServerError);
    expect(err).toMatchObject({ status: 502, body: null, esiHeaders: {} });
  });

  it('throws on 420 and refuses subsequent calls regardless of header value', async () => {
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

  it('times each ESI request as one esi call carrying its status', async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(200))
      .mockResolvedValueOnce(mockResponse(404));

    const calls = captureEsiCalls();
    await esiFetch(TEST_URL);
    await esiFetch(TEST_URL);

    expect(calls).toEqual([{ status: 200 }, { status: 404 }]);
  });

  it('times a request that never answered as an esi call without a status', async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'));

    const calls = captureEsiCalls();
    await expect(esiFetch(TEST_URL)).rejects.toThrow();

    expect(calls).toEqual([undefined]);
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

    const blocked = await esiFetch(
      'https://esi.evetech.net/markets/10000002/orders/?type_id=35',
    ).catch((e: unknown) => e);
    expect(blocked).toBeInstanceOf(EsiBudgetExhaustedError);
    expect((blocked as EsiBudgetExhaustedError).reason).toBe('rate_limited');
    expect((blocked as EsiBudgetExhaustedError).retryAfterSeconds).toBe(30);

    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const other = await esiFetch('https://esi.evetech.net/universe/types/34/');
    expect(other.status).toBe(200);

    vi.advanceTimersByTime(31_000);
    fetchSpy.mockResolvedValueOnce(mockResponse(200));
    const after = await esiFetch(TEST_URL);
    expect(after.status).toBe(200);
  });

  describe('CCP rate-limit groups and the history cap', () => {
    const HISTORY_URL = 'https://esi.evetech.net/markets/10000002/history/?type_id=34';
    const groupHeaders = (remaining: string) => ({
      'X-Ratelimit-Group': 'industry',
      'X-Ratelimit-Limit': '150/15m',
      'X-Ratelimit-Remaining': remaining,
    });

    it('reports the group headers to the scoreboard, the limit read as its leading integer', async () => {
      const report = vi.fn().mockResolvedValue(undefined);
      __setScoreboardForTests({
        preDispatch: vi.fn().mockResolvedValue({ effectiveRemaining: 100, blockedRetryAfter: null }),
        budgetSnapshot: vi.fn(),
        availabilitySnapshot: vi.fn(),
        report,
      });
      fetchSpy.mockResolvedValueOnce(mockResponse(200, groupHeaders('149')));

      await esiFetch(TEST_URL);

      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ rlGroup: 'industry', rlLimit: 150, rlRemaining: 149 }),
      );
    });

    it("refuses non-interactive calls below a tenth of the group's limit and interactive ones below a twentieth", async () => {
      fetchSpy.mockResolvedValue(mockResponse(200, groupHeaders('14')));
      await esiFetch(TEST_URL);

      const refused = await esiFetch(TEST_URL).catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(EsiBudgetExhaustedError);
      expect(refused).toMatchObject({ reason: 'group_budget', remaining: 14, resource: '/markets/{n}/orders' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockResolvedValue(mockResponse(200, groupHeaders('7')));
      const interactive = await esiFetch(TEST_URL, undefined, { interactive: true });
      expect(interactive.status).toBe(200);
      const interactiveRefused = await esiFetch(TEST_URL, undefined, { interactive: true }).catch((e: unknown) => e);
      expect(interactiveRefused).toMatchObject({ reason: 'group_budget', remaining: 7 });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('lets a call through once a fresh answer shows the group recovered', async () => {
      vi.useFakeTimers();
      fetchSpy.mockResolvedValueOnce(mockResponse(200, groupHeaders('10')));
      await esiFetch(TEST_URL);
      await expect(esiFetch(TEST_URL)).rejects.toMatchObject({ reason: 'group_budget' });

      vi.advanceTimersByTime(61_000);
      fetchSpy.mockResolvedValueOnce(mockResponse(200, groupHeaders('140')));
      expect((await esiFetch(TEST_URL)).status).toBe(200);
      fetchSpy.mockResolvedValueOnce(mockResponse(200, groupHeaders('139')));
      expect((await esiFetch(TEST_URL)).status).toBe(200);
    });

    it('refuses market-history calls once the shared count reaches the cap, and counts its own calls until the next reading', async () => {
      const preDispatch = vi.fn().mockResolvedValue({ effectiveRemaining: 100, blockedRetryAfter: null, historyCalls: 249 });
      __setScoreboardForTests({
        preDispatch,
        budgetSnapshot: vi.fn(),
        availabilitySnapshot: vi.fn(),
        report: vi.fn().mockResolvedValue(undefined),
      });
      fetchSpy.mockResolvedValue(mockResponse(200));

      expect((await esiFetch(HISTORY_URL)).status).toBe(200);
      const capped = await esiFetch(HISTORY_URL).catch((e: unknown) => e);
      expect(capped).toBeInstanceOf(EsiBudgetExhaustedError);
      expect(capped).toMatchObject({ reason: 'history_cap', remaining: 0, resource: '/markets/{n}/history' });
      expect(preDispatch).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      preDispatch.mockResolvedValue({ effectiveRemaining: 100, blockedRetryAfter: null, historyCalls: 250 });
      vi.useFakeTimers();
      vi.advanceTimersByTime(1_001);
      await expect(esiFetch(HISTORY_URL)).rejects.toMatchObject({ reason: 'history_cap' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('conditional requests', () => {
    it('passes a caller If-None-Match through and returns the 304 as ESI sent it', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockResponse(304, { ETag: '"abc"', Expires: 'Wed, 11 Jun 2026 12:05:00 GMT' }),
      );

      const res = await esiFetch(TEST_URL, { headers: { 'If-None-Match': '"abc"' } });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(requestHeaders(fetchSpy, 0).get('If-None-Match')).toBe('"abc"');
      expect(res.status).toBe(304);
      expect(res.headers.get('ETag')).toBe('"abc"');
      expect(res.headers.get('Expires')).toBe('Wed, 11 Jun 2026 12:05:00 GMT');
    });

    it('reports a 304 to the scoreboard as an answer, not an error', async () => {
      const report = vi.fn().mockResolvedValue(undefined);
      __setScoreboardForTests({
        preDispatch: vi.fn().mockResolvedValue({ effectiveRemaining: 100, blockedRetryAfter: null }),
        budgetSnapshot: vi.fn(),
        availabilitySnapshot: vi.fn(),
        report,
      });
      fetchSpy.mockResolvedValueOnce(mockResponse(304, { 'X-ESI-Error-Limit-Remain': '95' }));

      await esiFetch(TEST_URL, { headers: { 'If-None-Match': '"abc"' } });

      expect(report).toHaveBeenCalledWith({
        url: TEST_URL,
        status: 304,
        errorLimitRemain: 95,
        errorLimitReset: null,
        retryAfter: null,
        rlGroup: null,
        rlLimit: null,
        rlRemaining: null,
      });
    });

    it('never adds an If-None-Match of its own: an ETag it saw is not replayed', async () => {
      fetchSpy
        .mockResolvedValueOnce(
          mockResponse(200, { ETag: '"abc"', Expires: 'Wed, 11 Jun 2026 12:00:00 GMT' }, { a: 1 }),
        )
        .mockResolvedValueOnce(mockResponse(200, { ETag: '"abc"' }, { a: 1 }));

      await esiFetch(TEST_URL);
      await esiFetch(TEST_URL);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestHeaders(fetchSpy, 0).get('If-None-Match')).toBeNull();
      expect(requestHeaders(fetchSpy, 1).get('If-None-Match')).toBeNull();
    });

    it('serves nothing from a cache: every call inside Expires still reaches ESI', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-25T01:00:00Z'));
      fetchSpy.mockImplementation(async () =>
        mockResponse(200, { ETag: '"abc"', Expires: 'Thu, 25 Jun 2026 01:05:00 GMT' }, { a: 1 }),
      );

      const first = await esiFetch(TEST_URL);
      const second = await esiFetch(TEST_URL);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(await first.json()).toEqual({ a: 1 });
      expect(await second.json()).toEqual({ a: 1 });
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
        budgetSnapshot: vi.fn().mockResolvedValue({
          effectiveRemaining: 100,
          selfCount: 0,
          echo: null,
          source: 'process-local',
        }),
        availabilitySnapshot: vi.fn().mockResolvedValue({ calls: 0, failures: 0, source: 'process-local' }),
        report: vi.fn().mockResolvedValue(undefined),
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
      });
      fetchSpy.mockResolvedValueOnce(mockResponse(200));
      const res = await esiFetch(TEST_URL);
      expect(res.status).toBe(200);
      expect(preDispatch).toHaveBeenCalledTimes(2);
    });
  });

  describe('round trips the gate saves', () => {
    const POST_URL = 'https://esi.evetech.net/universe/names/';
    const IDS_URL = 'https://esi.evetech.net/universe/ids/';
    const post = { method: 'POST', body: '[1]' };

    function fakeScoreboard(remaining = 100): EsiScoreboard & {
      preDispatch: ReturnType<typeof vi.fn>;
      report: ReturnType<typeof vi.fn>;
    } {
      return {
        preDispatch: vi.fn().mockResolvedValue({
          effectiveRemaining: remaining,
          blockedRetryAfter: null,
        }),
        budgetSnapshot: vi.fn(),
        availabilitySnapshot: vi.fn().mockResolvedValue({ calls: 0, failures: 0, source: 'process-local' }),
        report: vi.fn().mockResolvedValue(undefined),
      };
    }

    afterEach(() => {
      setWorkDeferrer(null);
    });

    it('defers the report for a success but counts an error answer before returning', async () => {
      const fake = fakeScoreboard();
      __setScoreboardForTests(fake);
      const deferred: (() => Promise<void>)[] = [];
      setWorkDeferrer((task) => {
        deferred.push(task);
        return true;
      });
      fetchSpy
        .mockResolvedValueOnce(mockResponse(200, { 'X-ESI-Error-Limit-Remain': '95' }))
        .mockResolvedValueOnce(mockResponse(404));

      await esiFetch(TEST_URL);
      expect(fake.report).not.toHaveBeenCalled();
      expect(deferred).toHaveLength(1);

      await esiFetch(TEST_URL);
      expect(fake.report).toHaveBeenCalledOnce();
      expect(fake.report.mock.calls[0]![0]).toMatchObject({ status: 404 });

      await deferred[0]!();
      expect(fake.report).toHaveBeenCalledTimes(2);
      expect(fake.report.mock.calls[1]![0]).toMatchObject({ status: 200, errorLimitRemain: 95 });
    });

    it('reuses a fresh shared budget reading, and reads again after it ages', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      __setScoreboardForTests(fake);
      fetchSpy.mockImplementation(async () => mockResponse(200, {}, []));

      await esiFetch(POST_URL, post);
      await esiFetch(POST_URL, post);
      expect(fake.preDispatch).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(1_000);
      await esiFetch(POST_URL, post);
      expect(fake.preDispatch).toHaveBeenCalledTimes(2);
    });

    it('reuses the reading for a GET on the same path as well', async () => {
      const fake = fakeScoreboard();
      __setScoreboardForTests(fake);
      fetchSpy.mockImplementation(async () => mockResponse(200));

      await esiFetch(TEST_URL);
      await esiFetch(TEST_URL);

      expect(fake.preDispatch).toHaveBeenCalledOnce();
    });

    it('counts its own error answers against the reused reading', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard(ESI_BUDGET_FLOOR + 1);
      __setScoreboardForTests(fake);
      fetchSpy.mockResolvedValueOnce(mockResponse(404)).mockResolvedValueOnce(mockResponse(404));

      await esiFetch(POST_URL, post);
      await esiFetch(POST_URL, post);
      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'error_budget' });

      expect(fake.preDispatch).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('closes the gate locally on a 420 without waiting for the next shared reading', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      __setScoreboardForTests(fake);
      fetchSpy.mockResolvedValueOnce(mockResponse(420));

      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'esi_420' });
      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'error_budget' });

      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('writes the echo before returning once ESI reports the budget running low', async () => {
      const fake = fakeScoreboard();
      __setScoreboardForTests(fake);
      const deferred: (() => Promise<void>)[] = [];
      setWorkDeferrer((task) => {
        deferred.push(task);
        return true;
      });
      fetchSpy
        .mockResolvedValueOnce(mockResponse(200, { 'X-ESI-Error-Limit-Remain': String(ESI_BUDGET_FLOOR * 2 - 1) }))
        .mockResolvedValueOnce(mockResponse(200, { 'X-ESI-Error-Limit-Remain': String(ESI_BUDGET_FLOOR * 2) }));

      await esiFetch(TEST_URL);
      expect(fake.report).toHaveBeenCalledOnce();
      expect(fake.report.mock.calls[0]![0]).toMatchObject({ status: 200, errorLimitRemain: ESI_BUDGET_FLOOR * 2 - 1 });
      expect(deferred).toEqual([]);

      await esiFetch(TEST_URL);
      expect(fake.report).toHaveBeenCalledOnce();
      expect(deferred).toHaveLength(1);
    });

    it('caps the reused reading by the error count ESI reports on each answer', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      __setScoreboardForTests(fake);
      fetchSpy.mockResolvedValueOnce(mockResponse(200, { 'X-ESI-Error-Limit-Remain': '3' }, []));

      await esiFetch(POST_URL, post);
      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'error_budget' });

      expect(fake.preDispatch).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('keeps a 420 that arrived while an older shared read was still in flight', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      const open = { effectiveRemaining: 100, blockedRetryAfter: null };
      let releaseRead: (state: typeof open) => void = () => {};
      fake.preDispatch
        .mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }))
        .mockResolvedValueOnce(open);
      __setScoreboardForTests(fake);
      fetchSpy.mockResolvedValueOnce(mockResponse(420));

      const slowGet = esiFetch(TEST_URL);
      await vi.advanceTimersByTimeAsync(10);
      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'esi_420' });
      releaseRead(open);

      // The read predates the 420, so neither the call that made it nor the next one goes out.
      await expect(slowGet).rejects.toMatchObject({ reason: 'error_budget' });
      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'error_budget' });
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('trusts a shared reading over errors it saw while the read was out, which reach the shared count first', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      const reading = { effectiveRemaining: ESI_BUDGET_FLOOR, blockedRetryAfter: null };
      let releaseRead: (state: typeof reading) => void = () => {};
      fake.preDispatch
        .mockResolvedValueOnce({ ...reading, effectiveRemaining: 100 })
        .mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }));
      __setScoreboardForTests(fake);
      fetchSpy
        .mockResolvedValueOnce(mockResponse(200, {}, []))
        .mockResolvedValueOnce(mockResponse(404))
        .mockResolvedValue(mockResponse(200));

      await esiFetch(POST_URL, post);
      const slowGet = esiFetch(TEST_URL);
      await vi.advanceTimersByTimeAsync(0);
      await expect(esiFetch(POST_URL, post)).resolves.toMatchObject({ status: 404 });
      releaseRead(reading);

      await expect(slowGet).resolves.toMatchObject({ status: 200 });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it("caps a shared read by ESI's newest error count from while it was out", async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      const reading = { effectiveRemaining: 100, blockedRetryAfter: null };
      let releaseRead: (state: typeof reading) => void = () => {};
      fake.preDispatch
        .mockResolvedValueOnce(reading)
        .mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }));
      __setScoreboardForTests(fake);
      fetchSpy
        .mockResolvedValueOnce(mockResponse(200, {}, []))
        .mockResolvedValueOnce(mockResponse(404, { 'X-ESI-Error-Limit-Remain': String(ESI_BUDGET_FLOOR - 1) }))
        .mockResolvedValue(mockResponse(200));

      await esiFetch(POST_URL, post);
      const slowGet = esiFetch(TEST_URL);
      await vi.advanceTimersByTimeAsync(0);
      await expect(esiFetch(POST_URL, post)).resolves.toMatchObject({ status: 404 });
      releaseRead(reading);

      await expect(slowGet).rejects.toMatchObject({ reason: 'error_budget' });
      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'error_budget' });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('keeps a newer low reading when an older read returns after it', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      const reading = (effectiveRemaining: number) => ({ effectiveRemaining, blockedRetryAfter: null });
      let releaseOlder: (state: ReturnType<typeof reading>) => void = () => {};
      fake.preDispatch
        .mockImplementationOnce(() => new Promise((resolve) => { releaseOlder = resolve; }))
        .mockResolvedValueOnce(reading(ESI_BUDGET_FLOOR - 5));
      __setScoreboardForTests(fake);
      fetchSpy.mockResolvedValue(mockResponse(200));

      const older = esiFetch(TEST_URL);
      await vi.advanceTimersByTimeAsync(0);
      await expect(esiFetch(TEST_URL)).rejects.toMatchObject({ reason: 'error_budget' });
      releaseOlder(reading(100));

      await expect(older).rejects.toMatchObject({ reason: 'error_budget' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('lets a recovered shared reading through when an older call finishes while it is read', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      const reading = (effectiveRemaining: number) => ({ effectiveRemaining, blockedRetryAfter: null });
      let releaseRead: (state: ReturnType<typeof reading>) => void = () => {};
      let releaseFetch: (res: Response) => void = () => {};
      fake.preDispatch
        .mockResolvedValueOnce(reading(100))
        .mockResolvedValueOnce(reading(ESI_BUDGET_FLOOR - 5))
        .mockImplementationOnce(() => new Promise((resolve) => { releaseRead = resolve; }));
      __setScoreboardForTests(fake);
      fetchSpy
        .mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseFetch = resolve; }))
        .mockResolvedValueOnce(mockResponse(200));

      // A call goes out on a good reading and is still in flight when the budget dips and recovers.
      const slowPost = esiFetch(POST_URL, post);
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'error_budget' });
      await vi.advanceTimersByTimeAsync(2_000);
      const get = esiFetch(TEST_URL);
      await vi.advanceTimersByTimeAsync(0);
      releaseFetch(mockResponse(200, {}, []));
      await slowPost;
      releaseRead(reading(100));

      await expect(get).resolves.toMatchObject({ status: 200 });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('reads the shared state for a path this process has not read, even inside the reuse window', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      fake.preDispatch
        .mockResolvedValueOnce({ effectiveRemaining: 100, blockedRetryAfter: null })
        .mockResolvedValueOnce({ effectiveRemaining: 100, blockedRetryAfter: 30 });
      __setScoreboardForTests(fake);
      fetchSpy.mockResolvedValueOnce(mockResponse(200, {}, []));

      await esiFetch(POST_URL, post);
      await expect(esiFetch(IDS_URL, post)).rejects.toMatchObject({ reason: 'rate_limited', retryAfterSeconds: 30 });

      expect(fake.preDispatch).toHaveBeenCalledTimes(2);
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('keeps a local 429 to the path that drew it', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      __setScoreboardForTests(fake);
      fetchSpy
        .mockResolvedValueOnce(mockResponse(429, { 'Retry-After': '30' }))
        .mockResolvedValueOnce(mockResponse(200, {}, []));

      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'rate_limited' });
      await expect(esiFetch(IDS_URL, post)).resolves.toMatchObject({ status: 200 });

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('blocks the path locally after a 429 until Retry-After', async () => {
      vi.useFakeTimers();
      const fake = fakeScoreboard();
      __setScoreboardForTests(fake);
      fetchSpy.mockResolvedValueOnce(mockResponse(429, { 'Retry-After': '30' }));

      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({ reason: 'rate_limited' });
      await expect(esiFetch(POST_URL, post)).rejects.toMatchObject({
        reason: 'rate_limited',
        retryAfterSeconds: 30,
      });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fake.preDispatch).toHaveBeenCalledOnce();
    });
  });

  describe('dependency timing', () => {
    function recordTimings(): Array<[DependencyKind, number]> {
      const recorded: Array<[DependencyKind, number]> = [];
      setDependencyTimingSink((kind, ms) => {
        recorded.push([kind, ms]);
      });
      return recorded;
    }

    function scoreboardWith(report: EsiScoreboard['report']): EsiScoreboard {
      return {
        preDispatch: vi.fn().mockResolvedValue({
          effectiveRemaining: 100,
          blockedRetryAfter: null,
        }),
        budgetSnapshot: vi.fn().mockResolvedValue({
          effectiveRemaining: 100,
          selfCount: 0,
          echo: null,
          source: 'process-local',
        }),
        availabilitySnapshot: vi.fn().mockResolvedValue({ calls: 0, failures: 0, source: 'process-local' }),
        report,
      };
    }

    it('records one esi timing per HTTP attempt, answered or failed', async () => {
      const recorded = recordTimings();
      __setScoreboardForTests(scoreboardWith(vi.fn().mockResolvedValue(undefined)));
      fetchSpy
        .mockResolvedValueOnce(mockResponse(304, { ETag: '"abc"' }))
        .mockResolvedValueOnce(mockResponse(200, {}, { a: 2 }));

      const notModified = await esiFetch(TEST_URL, { headers: { 'If-None-Match': '"abc"' } });
      const res = await esiFetch(TEST_URL);

      expect(notModified.status).toBe(304);
      expect(res.status).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(recorded.map(([kind]) => kind)).toEqual(['esi', 'esi']);

      fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));
      await expect(esiFetch(TEST_URL)).rejects.toThrow('fetch failed');

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(recorded.map(([kind]) => kind)).toEqual(['esi', 'esi', 'esi']);
    });

    it('leaves a slow scoreboard report out of the esi time', async () => {
      vi.useFakeTimers();
      const recorded = recordTimings();
      const report = vi.fn(
        () => new Promise<void>((resolve) => setTimeout(resolve, 1_000)),
      );
      __setScoreboardForTests(scoreboardWith(report));
      fetchSpy.mockResolvedValueOnce(mockResponse(200));

      const pending = esiFetch(TEST_URL);
      await vi.advanceTimersByTimeAsync(1_000);
      const res = await pending;

      expect(res.status).toBe(200);
      expect(report).toHaveBeenCalledOnce();
      expect(recorded).toEqual([['esi', 0]]);
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
