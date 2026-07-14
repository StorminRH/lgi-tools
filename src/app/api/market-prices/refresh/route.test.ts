import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketPrice } from '@/data/market-prices/types';

const getLivePricesMock = vi.fn();
const rateLimitGuardMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/data/market-prices/refresh-on-view', () => ({
  getLivePrices: (...args: unknown[]) => getLivePricesMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

// The guard's own 429 construction + IP keying are pinned in
// src/lib/rate-limit.test.ts; here we only drive its ok/denied union.
vi.mock('@/lib/rate-limit', () => ({
  rateLimitGuard: (...args: unknown[]) => rateLimitGuardMock(...args),
}));

function buildRequest(body: unknown, ip = '1.2.3.4'): NextRequest {
  return new NextRequest('http://localhost:3000/api/market-prices/refresh', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function price(typeId: number, source: MarketPrice['source']): MarketPrice {
  return {
    typeId,
    bestBuy: 5.5,
    bestSell: 5.7,
    pct5Buy: 5.4,
    pct5Sell: 5.8,
    buyVolume: BigInt(1_000_000),
    sellVolume: BigInt(2_000_000),
    buyDepth: [{ pct: 0.5, cumVolume: 1000 }],
    sellDepth: [{ pct: 0.5, cumVolume: 2000 }],
    regionalDiscount: null,
    source,
    updatedAt: new Date('2026-05-27T11:00:00Z'),
    staleAfter: new Date('2026-05-28T11:00:00Z'),
  };
}

function cleanResult(rows: MarketPrice[]) {
  return {
    prices: new Map(rows.map((r) => [r.typeId, r])),
    degraded: {
      fetched: rows.length,
      esiCount: rows.length,
      fuzzworkFallbackCount: 0,
      budgetExhausted: false,
    },
    metrics: {
      requested: rows.length,
      returned: rows.length,
      cacheHits: 0,
      esiCount: rows.length,
      fuzzworkFallbackCount: 0,
    },
  };
}

async function importRoute() {
  return await import('./route');
}

describe('POST /api/market-prices/refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    getLivePricesMock.mockReset();
    rateLimitGuardMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    rateLimitGuardMock.mockResolvedValue({ ok: true });
    getLivePricesMock.mockResolvedValue(cleanResult([price(34, 'esi')]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the requested typeIds live and returns the fresh rows', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [34] }));
    expect(res.status).toBe(200);
    expect(getLivePricesMock).toHaveBeenCalledWith([34], expect.any(Function));
    const body = await res.json();
    expect(body.prices[0].typeId).toBe(34);
    expect(body.prices[0].buyVolume).toBe('1000000');
    expect(body.prices[0].staleAfter).toBe('2026-05-28T11:00:00.000Z');
    expect(body.prices[0].source).toBe('esi');
  });

  it('omits types the engine returned no price for', async () => {
    // Seed-miss + live-miss → absent from the map; the response simply skips it.
    getLivePricesMock.mockResolvedValue(cleanResult([price(34, 'esi')]));
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [34, 99] }));
    const body = await res.json();
    expect(body.prices).toHaveLength(1);
    expect(body.prices[0].typeId).toBe(34);
  });

  it('emits price_source_degraded telemetry when the read fell back to Fuzzwork', async () => {
    getLivePricesMock.mockResolvedValue({
      prices: new Map([
        [34, price(34, 'esi')],
        [35, price(35, 'fuzzwork-fallback')],
        [36, price(36, 'fuzzwork-fallback')],
      ]),
      degraded: {
        fetched: 3,
        esiCount: 1,
        fuzzworkFallbackCount: 2,
        budgetExhausted: false,
      },
      metrics: {
        requested: 3,
        returned: 3,
        cacheHits: 0,
        esiCount: 1,
        fuzzworkFallbackCount: 2,
      },
    });
    const { POST } = await importRoute();
    await POST(buildRequest({ typeIds: [34, 35, 36] }));
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'price_source_degraded',
      metadata: {
        caller: 'on-demand',
        fetched: 3,
        esiCount: 1,
        fuzzworkFallbackCount: 2,
        budgetExhausted: false,
      },
    });
  });

  it('emits degradation telemetry when the ESI error budget was exhausted', async () => {
    getLivePricesMock.mockResolvedValue({
      prices: new Map([[34, price(34, 'esi')]]),
      degraded: { fetched: 1, esiCount: 1, fuzzworkFallbackCount: 0, budgetExhausted: true },
      metrics: {
        requested: 1,
        returned: 1,
        cacheHits: 0,
        esiCount: 1,
        fuzzworkFallbackCount: 0,
      },
    });
    const { POST } = await importRoute();
    await POST(buildRequest({ typeIds: [34] }));
    expect(logUsageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'price_source_degraded' }),
    );
  });

  it('emits only the normal cost metric on a clean all-ESI read', async () => {
    const { POST } = await importRoute();
    await POST(buildRequest({ typeIds: [34] }));
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'market_price_refresh',
      metadata: expect.objectContaining({
        requested: 1,
        returned: 1,
        cacheHits: 0,
        esiCount: 1,
        fuzzworkFallbackCount: 0,
        budgetExhausted: false,
      }),
    });
  });

  it('deduplicates typeIds before passing to the engine', async () => {
    const { POST } = await importRoute();
    await POST(buildRequest({ typeIds: [34, 34, 35] }));
    const passed = getLivePricesMock.mock.calls[0]![0] as number[];
    expect(passed.sort()).toEqual([34, 35]);
  });

  it('rejects an empty typeIds array', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
    expect(getLivePricesMock).not.toHaveBeenCalled();
  });

  it('rejects more than 50 typeIds', async () => {
    const { POST } = await importRoute();
    const tooMany = Array.from({ length: 51 }, (_, i) => i + 1);
    const res = await POST(buildRequest({ typeIds: tooMany }));
    expect(res.status).toBe(400);
    expect(getLivePricesMock).not.toHaveBeenCalled();
  });

  it('rejects non-integer typeIds', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [34.5] }));
    expect(res.status).toBe(400);
    expect(getLivePricesMock).not.toHaveBeenCalled();
  });

  it('rejects negative typeIds', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [-1] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 on malformed JSON', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest('{ not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_json');
  });

  it('returns the guard 429 verbatim when the limiter denies', async () => {
    rateLimitGuardMock.mockResolvedValueOnce({
      ok: false,
      response: Response.json(
        { error: 'rate_limited', retryAfter: 42 },
        { status: 429, headers: { 'Retry-After': '42' } },
      ),
    });
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [34] }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    const body = await res.json();
    expect(body).toEqual({ error: 'rate_limited', retryAfter: 42 });
    expect(getLivePricesMock).not.toHaveBeenCalled();
  });

  it('hands the request and the slice limit policy to the guard', async () => {
    const { POST } = await importRoute();
    await POST(buildRequest({ typeIds: [34] }, '203.0.113.99'));
    expect(rateLimitGuardMock).toHaveBeenCalledTimes(1);
    const [guardedRequest, options] = rateLimitGuardMock.mock.calls[0] as [Request, unknown];
    expect(guardedRequest.headers.get('x-forwarded-for')).toBe('203.0.113.99');
    expect(options).toEqual(
      expect.objectContaining({ name: 'market-prices-refresh', perMinute: expect.any(Number) }),
    );
  });
});
