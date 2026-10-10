import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { cronRequest, TEST_CRON_SECRET } from '@/lib/__tests__/route-requests';

const refreshStalePricesMock = vi.fn();
const logUsageEventMock = vi.fn();
const emitDomainEventMock = vi.fn();
const alertMock = vi.fn();
const revalidateTagMock = vi.fn();
const directDatabaseMock = { handle: 'direct-database' };

vi.mock('@/data/market-prices/cache', () => ({
  PRICES_FRESHNESS_TAG: 'market-prices-freshness',
  refreshStalePrices: (...args: unknown[]) => refreshStalePricesMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/data/domain-events/queries', () => ({
  emitDomainEvent: (input: unknown) => emitDomainEventMock(input),
}));

vi.mock('@/lib/alerts', () => ({
  alertPriceSourceDegradation: (input: unknown) => alertMock(input),
}));

vi.mock('@/db', () => ({ directClient: {} }));

vi.mock('@/db/direct-database', () => ({
  directDatabase: () => directDatabaseMock,
}));

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

vi.mock('next/server', () => ({
  connection: () => Promise.resolve(),
}));

const ROUTE = '/api/cron/refresh-prices';

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
    emitDomainEventMock.mockReset();
    alertMock.mockReset();
    revalidateTagMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
    alertMock.mockResolvedValue(undefined);
    vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);
    silenceConsolePrefixes('log', ['{"scope":"cron:']);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects a request without the cron bearer token', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost:3000/api/cron/refresh-prices'));
    expect(res.status).toBe(401);
    expect(refreshStalePricesMock).not.toHaveBeenCalled();
  });

  it('records an empty-set skip as cron_prices/skipped with reason empty-set (O-3)', async () => {
    refreshStalePricesMock.mockResolvedValue({
      status: 'cached',
      reason: 'empty-set',
      lastUpdatedAt: new Date('2026-05-30T11:00:00Z'),
    });
    const { GET } = await import('./route');
    const res = await GET(cronRequest(ROUTE));
    expect((await res.json()).cached).toBe(true);
    expect(refreshStalePricesMock).toHaveBeenCalledWith(directDatabaseMock);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_prices',
      metadata: expect.objectContaining({ outcome: 'skipped', reason: 'empty-set' }),
    });
    expect(emitDomainEventMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('records a clean refresh as cron_prices/refreshed with counts (O-2) and no degradation', async () => {
    refreshStalePricesMock.mockResolvedValue({
      status: 'refreshed',
      lastUpdatedAt: new Date('2026-05-30T12:00:00Z'),
      summary: REFRESHED_SUMMARY,
    });
    const { GET } = await import('./route');
    const res = await GET(cronRequest(ROUTE));
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
    expect(logUsageEventMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'price_source_degraded' }),
    );
    expect(emitDomainEventMock).toHaveBeenCalledWith({
      eventType: 'price_refresh_finished',
      metadata: {
        outcome: 'completed',
        fetched: 10,
        written: 10,
        esiCount: 10,
        fuzzworkFallbackCount: 0,
        budgetExhausted: false,
        durationMs: expect.any(Number),
      },
    });
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
    const { GET } = await import('./route');
    await GET(cronRequest(ROUTE));
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
    expect(emitDomainEventMock).toHaveBeenCalledWith({
      eventType: 'price_refresh_finished',
      metadata: {
        outcome: 'degraded',
        fetched: 10,
        written: 10,
        esiCount: 6,
        fuzzworkFallbackCount: 4,
        budgetExhausted: true,
        durationMs: expect.any(Number),
      },
    });
    expect(alertMock).toHaveBeenCalledWith({
      fetched: 10,
      esiCount: 6,
      fuzzworkFallbackCount: 4,
      budgetExhausted: true,
    });
  });

  it('logs a failed degradation alert and still answers 200', async () => {
    const errors = silenceConsolePrefixes('error', ['[cron:prices] degradation alert failed']);
    const down = new Error('discord down');
    alertMock.mockRejectedValue(down);
    refreshStalePricesMock.mockResolvedValue({
      status: 'refreshed',
      lastUpdatedAt: new Date('2026-05-30T13:30:00Z'),
      summary: { ...REFRESHED_SUMMARY, esiCount: 6, fuzzworkFallbackCount: 4 },
    });
    const { GET } = await import('./route');
    const res = await GET(cronRequest(ROUTE));
    expect(res.status).toBe(200);
    expect((await res.json()).written).toBe(10);
    expect(alertMock).toHaveBeenCalledOnce();
    expect(errors).toHaveBeenCalledWith('[cron:prices] degradation alert failed', down);
  });

  it('does not let a telemetry failure break the cron response', async () => {
    logUsageEventMock.mockRejectedValue(new Error('db down'));
    refreshStalePricesMock.mockResolvedValue({
      status: 'refreshed',
      lastUpdatedAt: new Date('2026-05-30T14:00:00Z'),
      summary: REFRESHED_SUMMARY,
    });
    const { GET } = await import('./route');
    const res = await GET(cronRequest(ROUTE));
    expect(res.status).toBe(200);
    expect((await res.json()).written).toBe(10);
  });
});
