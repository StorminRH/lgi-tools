import { expect, test, vi } from 'vitest';
import type { MarketPrice } from '@/data/market-prices/types';
import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';

const getLivePricesMock = vi.fn();
const checkRateLimitMock = vi.fn();
const emitCostMetricMock = vi.fn();

vi.mock('@/data/market-prices/refresh-on-view', () => ({
  getLivePrices: (...args: unknown[]) => getLivePricesMock(...args),
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (...args: unknown[]) => emitCostMetricMock(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
}));

import { POST } from './route';

const ROUTE = '/api/market-prices/refresh';

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
      esiCount: rows.length,
      fuzzworkFallbackCount: 0,
    },
  };
}

function resetMocks() {
  getLivePricesMock.mockReset().mockResolvedValue(cleanResult([price(34, 'esi')]));
  checkRateLimitMock.mockReset().mockResolvedValue({ ok: true });
  emitCostMetricMock.mockReset();
}

test('POST /api/market-prices/refresh reads distinct typeIds live, spends one allowance per id, and returns the rows it found', async () => {
  resetMocks();
  const headers = { 'x-forwarded-for': '203.0.113.99' };
  const res = await POST(postJson(ROUTE, { typeIds: [34, 34, 99] }, { headers }));

  expect(res.status).toBe(200);
  expect(getLivePricesMock).toHaveBeenCalledWith([34, 99], expect.any(Function));
  // The per-client limit counts distinct type ids, 2000 a minute.
  const [guardedRequest, options, cost] = checkRateLimitMock.mock.calls[0] ?? [];
  expect(guardedRequest.headers.get('x-forwarded-for')).toBe('203.0.113.99');
  expect(options).toEqual({ name: 'market-prices-refresh', perMinute: 2000, unit: 'type-ids' });
  expect(cost).toBe(2);

  // Type 99 has no price, so only 34 comes back.
  const body = await res.json();
  expect(body.prices).toHaveLength(1);
  expect(body.prices[0].typeId).toBe(34);
  expect(body.prices[0].buyVolume).toBe('1000000');
  expect(body.prices[0].staleAfter).toBe('2026-05-28T11:00:00.000Z');
  expect(body.prices[0].source).toBe('esi');

  // A clean all-ESI read records the refresh and no degradation.
  expect(emitCostMetricMock).toHaveBeenCalledWith(
    'market_price_refresh',
    expect.objectContaining({
      requested: 1,
      returned: 1,
      esiCount: 1,
      fuzzworkFallbackCount: 0,
      budgetExhausted: false,
    }),
  );
  expect(emitCostMetricMock).not.toHaveBeenCalledWith('price_source_degraded', expect.anything());
});

test('POST /api/market-prices/refresh emits price_source_degraded telemetry when the read fell back to Fuzzwork', async () => {
  resetMocks();
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
      esiCount: 1,
      fuzzworkFallbackCount: 2,
    },
  });
  await POST(postJson(ROUTE, { typeIds: [34, 35, 36] }));
  expect(emitCostMetricMock).toHaveBeenCalledWith(
    'price_source_degraded',
    {
      caller: 'on-demand',
      fetched: 3,
      esiCount: 1,
      fuzzworkFallbackCount: 2,
      budgetExhausted: false,
    },
  );
});

test('POST /api/market-prices/refresh rejects bad bodies with 400 and a denied limiter with 429, reading nothing', async () => {
  resetMocks();
  const empty = await POST(postJson(ROUTE, { typeIds: [] }));
  expect(empty.status).toBe(400);
  expect(problemBodySchema.parse(await empty.json()).code).toBe('invalid_body');

  for (const typeIds of [Array.from({ length: 2001 }, (_, i) => i + 1), [34.5], [-1]]) {
    expect((await POST(postJson(ROUTE, { typeIds }))).status, JSON.stringify(typeIds).slice(0, 20)).toBe(400);
  }

  const malformed = await POST(postJson(ROUTE, '{ not json'));
  expect(malformed.status).toBe(400);
  expect(problemBodySchema.parse(await malformed.json()).code).toBe('invalid_json');

  checkRateLimitMock.mockResolvedValueOnce({
    ok: false,
    failure: {
      category: 'rate_limited',
      code: 'rate_limited',
      retryAfterSeconds: 42,
    },
  });
  const limited = await POST(postJson(ROUTE, { typeIds: [34] }));
  expect(limited.status).toBe(429);
  expect(limited.headers.get('Retry-After')).toBe('42');
  expect(problemBodySchema.parse(await limited.json())).toMatchObject({
    status: 429,
    code: 'rate_limited',
    retryAfterSeconds: 42,
  });
  expect(getLivePricesMock).not.toHaveBeenCalled();
});
