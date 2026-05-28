import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshPricesMock = vi.fn();
const rateLimitMock = vi.fn();
const dbSelectMock = vi.fn();

vi.mock('@/db', () => ({
  db: {
    select: () => dbSelectMock(),
  },
}));

vi.mock('@/data/market-prices/ingest', () => ({
  refreshPrices: (...args: unknown[]) => refreshPricesMock(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => rateLimitMock(...args),
  clientIdentifier: (headers: Headers) => headers.get('x-forwarded-for') ?? 'anon',
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

function buildSelectChain(rows: unknown[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

async function importRoute() {
  return await import('./route');
}

describe('POST /api/market-prices/refresh', () => {
  beforeEach(() => {
    vi.resetModules();
    refreshPricesMock.mockReset();
    rateLimitMock.mockReset();
    dbSelectMock.mockReset();
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 19 });
    refreshPricesMock.mockResolvedValue({
      requested: 1,
      fetched: 1,
      written: 1,
      durationMs: 42,
    });
    dbSelectMock.mockReturnValue(
      buildSelectChain([
        {
          typeId: 34,
          bestBuy: 5.5,
          bestSell: 5.7,
          pct5Buy: 5.4,
          pct5Sell: 5.8,
          buyVolume: BigInt(1_000_000),
          sellVolume: BigInt(2_000_000),
          updatedAt: new Date('2026-05-27T11:00:00Z'),
          staleAfter: new Date('2026-05-28T11:00:00Z'),
          source: 'esi',
        },
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes the requested typeIds and returns the fresh rows', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [34] }));
    expect(res.status).toBe(200);
    expect(refreshPricesMock).toHaveBeenCalledWith(expect.anything(), [34]);
    const body = await res.json();
    expect(body.summary.written).toBe(1);
    expect(body.prices[0].typeId).toBe(34);
    expect(body.prices[0].buyVolume).toBe('1000000');
    expect(body.prices[0].source).toBe('esi');
  });

  it('deduplicates typeIds before passing to refreshPrices', async () => {
    const { POST } = await importRoute();
    await POST(buildRequest({ typeIds: [34, 34, 35] }));
    const passed = refreshPricesMock.mock.calls[0][1] as number[];
    expect(passed.sort()).toEqual([34, 35]);
  });

  it('rejects an empty typeIds array', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [] }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
    expect(refreshPricesMock).not.toHaveBeenCalled();
  });

  it('rejects more than 50 typeIds', async () => {
    const { POST } = await importRoute();
    const tooMany = Array.from({ length: 51 }, (_, i) => i + 1);
    const res = await POST(buildRequest({ typeIds: tooMany }));
    expect(res.status).toBe(400);
    expect(refreshPricesMock).not.toHaveBeenCalled();
  });

  it('rejects non-integer typeIds', async () => {
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [34.5] }));
    expect(res.status).toBe(400);
    expect(refreshPricesMock).not.toHaveBeenCalled();
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

  it('returns 429 with Retry-After header when the limiter denies', async () => {
    rateLimitMock.mockResolvedValueOnce({ ok: false, retryAfter: 42 });
    const { POST } = await importRoute();
    const res = await POST(buildRequest({ typeIds: [34] }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    const body = await res.json();
    expect(body).toEqual({ error: 'rate_limited', retryAfter: 42 });
    expect(refreshPricesMock).not.toHaveBeenCalled();
  });

  it('keys the rate limit by the client IP from x-forwarded-for', async () => {
    const { POST } = await importRoute();
    await POST(buildRequest({ typeIds: [34] }, '203.0.113.99'));
    expect(rateLimitMock).toHaveBeenCalledWith(
      '203.0.113.99',
      expect.objectContaining({ name: 'market-prices-refresh' }),
    );
  });
});
