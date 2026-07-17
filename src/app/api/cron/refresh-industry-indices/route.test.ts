import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refreshIndustryIndicesMock = vi.fn();
const logUsageEventMock = vi.fn();
const dbMock = {};

let lockGot = true;
const reservedTag = Object.assign(
  vi.fn(() => Promise.resolve([{ got: lockGot }])),
  { release: vi.fn() },
);
const reserveMock = vi.fn((..._args: unknown[]) => Promise.resolve(reservedTag));

vi.mock('@/data/industry-indices/constants', () => ({
  ADVISORY_LOCK_INDUSTRY_INDICES: 41,
}));

vi.mock('@/data/industry-indices/ingest', () => ({
  refreshIndustryIndices: (...args: unknown[]) =>
    refreshIndustryIndicesMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/db', () => ({
  directClient: { reserve: (...args: unknown[]) => reserveMock(...args) },
}));

vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => dbMock }));
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

async function importRoute() {
  return await import('./route');
}

function authedRequest(): Request {
  return new Request('http://localhost:3000/api/cron/refresh-industry-indices', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

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
    lockGot = true;
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects a request without the cron bearer token', async () => {
    const { GET } = await importRoute();
    const response = await GET(
      new Request('http://localhost:3000/api/cron/refresh-industry-indices'),
    );

    expect(response.status).toBe(401);
    expect(reserveMock).not.toHaveBeenCalled();
    expect(refreshIndustryIndicesMock).not.toHaveBeenCalled();
  });

  it('returns busy and records the contention metadata', async () => {
    lockGot = false;
    const { GET } = await importRoute();
    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({ status: 'busy' });
    expect(refreshIndustryIndicesMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_industry_indices',
      metadata: {
        outcome: 'busy',
        durationMs: expect.any(Number),
      },
    });
  });

  it('returns the dataset summary and records each dataset outcome', async () => {
    refreshIndustryIndicesMock.mockResolvedValue(SUMMARY);
    const { GET } = await importRoute();
    const response = await GET(authedRequest());

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
