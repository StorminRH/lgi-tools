import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSdeMetaValueMock = vi.fn();
const setSdeMetaValueMock = vi.fn();
const getRemoteSdeVersionMock = vi.fn();
const runSdePipelineMock = vi.fn();
const summarizeMarketPricesRowCountMock = vi.fn();
const logUsageEventMock = vi.fn();
const revalidateTagMock = vi.fn();

// Reserved-connection stub: a tagged-template fn (the lock SQL) carrying a
// `.release()`. `lockGot` flips the advisory-lock acquisition per test.
let lockGot = true;
const reservedTag = vi.fn(() => Promise.resolve([{ got: lockGot }]));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(reservedTag as any).release = vi.fn();
const reserveMock = vi.fn((..._args: unknown[]) => Promise.resolve(reservedTag));

vi.mock('@/data/eve-data/queries', () => ({
  getSdeMetaValue: (...args: unknown[]) => getSdeMetaValueMock(...args),
  setSdeMetaValue: (...args: unknown[]) => setSdeMetaValueMock(...args),
}));

vi.mock('@/data/eve-data/source', () => ({
  getRemoteSdeVersion: (...args: unknown[]) => getRemoteSdeVersionMock(...args),
}));

vi.mock('@/db/sde-pipeline', () => ({
  runSdePipeline: (...args: unknown[]) => runSdePipelineMock(...args),
  summarizeMarketPricesRowCount: (...args: unknown[]) =>
    summarizeMarketPricesRowCountMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/db', () => ({
  directClient: { reserve: (...args: unknown[]) => reserveMock(...args) },
}));

vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => ({}) }));

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

async function importRoute() {
  return await import('./route');
}

function authedRequest(): Request {
  return new Request('http://localhost:3000/api/cron/refresh-sde', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

const PIPELINE_SUMMARY = {
  ingest: { typesWritten: 5500, durationMs: 30000 },
  resolve: { blueprintsResolved: 4000, skipped: false, durationMs: 60000 },
  seed: { tracked: 5500, missing: 0, inserted: 0 },
  durationMs: 120000,
};

describe('GET /api/cron/refresh-sde', () => {
  beforeEach(() => {
    vi.resetModules();
    getSdeMetaValueMock.mockReset();
    setSdeMetaValueMock.mockReset();
    getRemoteSdeVersionMock.mockReset();
    runSdePipelineMock.mockReset();
    summarizeMarketPricesRowCountMock.mockReset();
    logUsageEventMock.mockReset();
    revalidateTagMock.mockReset();
    reserveMock.mockClear();
    reservedTag.mockClear();
    lockGot = true;
    logUsageEventMock.mockResolvedValue(undefined);
    setSdeMetaValueMock.mockResolvedValue(undefined);
    summarizeMarketPricesRowCountMock.mockResolvedValue({ total: 5595, priced: 4898 });
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('records a no-drift run as cron_sde/up-to-date (O-3)', async () => {
    getSdeMetaValueMock.mockResolvedValue('2026-05-01');
    getRemoteSdeVersionMock.mockResolvedValue('2026-05-01');
    const { GET } = await importRoute();
    const res = await GET(authedRequest());
    expect((await res.json()).status).toBe('up-to-date');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sde',
      metadata: expect.objectContaining({ outcome: 'up-to-date' }),
    });
    expect(reserveMock).not.toHaveBeenCalled();
  });

  it('records a busy skip as cron_sde/busy when the lock is held (O-3)', async () => {
    getSdeMetaValueMock.mockResolvedValue('2026-05-01');
    getRemoteSdeVersionMock.mockResolvedValue('2026-05-08'); // drift
    lockGot = false;
    const { GET } = await importRoute();
    const res = await GET(authedRequest());
    expect((await res.json()).status).toBe('busy');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sde',
      metadata: expect.objectContaining({ outcome: 'busy' }),
    });
    expect(runSdePipelineMock).not.toHaveBeenCalled();
  });

  it('records a re-ingest as cron_sde/reingested with the pipeline summary (O-2)', async () => {
    getSdeMetaValueMock.mockResolvedValue('2026-05-01');
    getRemoteSdeVersionMock.mockResolvedValue('2026-05-08'); // drift
    lockGot = true;
    runSdePipelineMock.mockResolvedValue(PIPELINE_SUMMARY);
    const { GET } = await importRoute();
    const res = await GET(authedRequest());
    expect((await res.json()).status).toBe('reingested');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sde',
      metadata: expect.objectContaining({
        outcome: 'reingested',
        sdeVersionBefore: '2026-05-01',
        sdeVersionAfter: '2026-05-08',
        summary: PIPELINE_SUMMARY,
      }),
    });
  });

  it('rejects a request without the cron bearer token', async () => {
    const { GET } = await importRoute();
    const res = await GET(new Request('http://localhost:3000/api/cron/refresh-sde'));
    expect(res.status).toBe(401);
    expect(getSdeMetaValueMock).not.toHaveBeenCalled();
  });
});
