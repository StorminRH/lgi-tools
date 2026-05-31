import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshStalePricesMock = vi.fn();
const logUsageEventMock = vi.fn();
const alertMock = vi.fn();
const revalidateTagMock = vi.fn();

vi.mock('@/data/market-prices/cache', () => ({
  PRICES_FRESHNESS_TAG: 'market-prices-freshness',
  refreshStalePrices: (...args: unknown[]) => refreshStalePricesMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/lib/alerts', () => ({
  alertPriceSourceDegradation: (input: unknown) => alertMock(input),
}));

vi.mock('@/db', () => ({ directClient: {} }));

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

vi.mock('next/server', () => ({
  connection: () => Promise.resolve(),
}));

async function importRoute() {
  return await import('./route');
}

function authedRequest(secret = 'test-secret'): Request {
  return new Request('http://localhost:3000/api/cron/refresh-prices', {
    headers: { authorization: `Bearer ${secret}` },
  });
}

const REFRESHED_SUMMARY = {
  requested: 10,
  fetched: 10,
  written: 10,
  durationMs: 1234,
  esiCount: 10,
  fuzzworkFallbackCount: 0,
  budgetExhausted: false,
};

describe('GET /api/cron/refresh-prices', () => {
  beforeEach(() => {
    vi.resetModules();
    refreshStalePricesMock.mockReset();
    logUsageEventMock.mockReset();
    alertMock.mockReset();
    revalidateTagMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    alertMock.mockResolvedValue(undefined);
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects a request without the cron bearer token', async () => {
    const { GET } = await importRoute();
    const res = await GET(new Request('http://localhost:3000/api/cron/refresh-prices'));
    expect(res.status).toBe(401);
    expect(refreshStalePricesMock).not.toHaveBeenCalled();
  });

  it('records a lock-contended skip as cron_prices/skipped (O-3)', async () => {
    refreshStalePricesMock.mockResolvedValue({
      status: 'cached',
      reason: 'lock-contended',
      lastUpdatedAt: new Date('2026-05-30T11:00:00Z'),
    });
    const { GET } = await importRoute();
    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).cached).toBe(true);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_prices',
      metadata: expect.objectContaining({ outcome: 'skipped', reason: 'lock-contended' }),
    });
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('records a clean refresh as cron_prices/refreshed with counts (O-2) and no degradation', async () => {
    refreshStalePricesMock.mockResolvedValue({
      status: 'refreshed',
      lastUpdatedAt: new Date('2026-05-30T12:00:00Z'),
      summary: REFRESHED_SUMMARY,
    });
    const { GET } = await importRoute();
    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith('market-prices-freshness', 'max');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_prices',
      metadata: expect.objectContaining({
        outcome: 'refreshed',
        fetched: 10,
        written: 10,
        esiCount: 10,
        fuzzworkFallbackCount: 0,
        budgetExhausted: false,
      }),
    });
    // No degradation → no price_source_degraded event, no Discord alert.
    expect(logUsageEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'price_source_degraded' }),
    );
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('emits price_source_degraded and a Discord alert when ESI degraded (O-1)', async () => {
    refreshStalePricesMock.mockResolvedValue({
      status: 'refreshed',
      lastUpdatedAt: new Date('2026-05-30T13:00:00Z'),
      summary: {
        ...REFRESHED_SUMMARY,
        esiCount: 6,
        fuzzworkFallbackCount: 4,
        budgetExhausted: true,
      },
    });
    const { GET } = await importRoute();
    await GET(authedRequest());
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'price_source_degraded',
      metadata: {
        caller: 'cron',
        fetched: 10,
        esiCount: 6,
        fuzzworkFallbackCount: 4,
        budgetExhausted: true,
      },
    });
    expect(alertMock).toHaveBeenCalledWith({
      fetched: 10,
      esiCount: 6,
      fuzzworkFallbackCount: 4,
      budgetExhausted: true,
    });
  });

  it('does not let a telemetry failure break the cron response', async () => {
    logUsageEventMock.mockRejectedValue(new Error('db down'));
    refreshStalePricesMock.mockResolvedValue({
      status: 'refreshed',
      lastUpdatedAt: new Date('2026-05-30T14:00:00Z'),
      summary: REFRESHED_SUMMARY,
    });
    const { GET } = await importRoute();
    const res = await GET(authedRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).written).toBe(10);
  });
});
