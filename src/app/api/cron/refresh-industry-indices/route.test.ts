import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { createReservedConnectionMock } from '@/db/__tests__/support/reserved-connection-mock';
import { cronRequest, TEST_CRON_SECRET } from '@/lib/__tests__/route-requests';

const refreshIndustryIndicesMock = vi.fn();
const logUsageEventMock = vi.fn();
const dbMock = { handle: 'direct-database' };

const { reserved: reservedTag, reserve: reserveMock } = createReservedConnectionMock(
  () => Promise.resolve([{ got: true }]),
);

vi.mock('@/data/industry-indices/ingest', () => ({
  refreshIndustryIndices: (...args: unknown[]) =>
    refreshIndustryIndicesMock(...args),
}));

vi.mock('@/data/telemetry/log', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/db', () => ({
  directClient: { reserve: (...args: unknown[]) => reserveMock(...args) },
}));

vi.mock('@/db/direct-database', () => ({ directDatabase: () => dbMock }));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

const ROUTE = '/api/cron/refresh-industry-indices';

const SUMMARY = {
  costIndices: { ok: true, written: 7, durationMs: 12 },
  adjustedPrices: { ok: false, written: 0, durationMs: 34 },
  durationMs: 46,
};

describe('GET /api/cron/refresh-industry-indices', () => {
  beforeEach(() => {
    vi.resetModules();
    refreshIndustryIndicesMock.mockReset();
    logUsageEventMock.mockReset().mockResolvedValue(undefined);
    reserveMock.mockClear();
    reservedTag.mockClear();
    vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);
    silenceConsolePrefixes('log', ['{"scope":"cron:']);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects a request without the cron bearer token', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost:3000/api/cron/refresh-industry-indices'),
    );

    expect(response.status).toBe(401);
    expect(reserveMock).not.toHaveBeenCalled();
    expect(refreshIndustryIndicesMock).not.toHaveBeenCalled();
  });

  it('takes no lock: an overlapping run refreshes as well, since the ESI reads and upserts are idempotent', async () => {
    refreshIndustryIndicesMock.mockResolvedValue(SUMMARY);
    const { GET } = await import('./route');
    const response = await GET(cronRequest(ROUTE));

    expect(response.status).toBe(200);
    expect(refreshIndustryIndicesMock).toHaveBeenCalledWith(dbMock);
    expect(reserveMock).not.toHaveBeenCalled();
    expect(reservedTag).not.toHaveBeenCalled();
  });

  it('returns the dataset summary and records each dataset outcome', async () => {
    refreshIndustryIndicesMock.mockResolvedValue(SUMMARY);
    const { GET } = await import('./route');
    const response = await GET(cronRequest(ROUTE));

    expect(refreshIndustryIndicesMock).toHaveBeenCalledWith(dbMock);
    expect(await response.json()).toEqual({
      status: 'refreshed',
      costIndices: { ok: true, written: 7 },
      adjustedPrices: { ok: false, written: 0 },
    });
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_industry_indices',
      metadata: {
        outcome: 'refreshed',
        costIndices: SUMMARY.costIndices,
        adjustedPrices: SUMMARY.adjustedPrices,
        durationMs: expect.any(Number),
      },
    });
  });
});
