import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { SDE_CACHE_TAG } from '@/data/eve-data/constants';
import { createReservedConnectionMock } from '@/db/__tests__/support/reserved-connection-mock';
import { cronRequest, TEST_CRON_SECRET } from '@/lib/__tests__/route-requests';

const getSdeMetaValueMock = vi.fn();
const setSdeMetaValueMock = vi.fn();
const getRemoteSdeVersionMock = vi.fn();
const runSdePipelineMock = vi.fn();
const summarizeMarketPricesRowCountMock = vi.fn();
const logUsageEventMock = vi.fn();
const revalidateTagMock = vi.fn();

let lockGot = true;
const { reserved: reservedTag, reserve: reserveMock } = createReservedConnectionMock(
  () => Promise.resolve([{ got: lockGot }]),
);

vi.mock('@/data/eve-data/meta', () => ({
  getSdeMetaValue: (...args: unknown[]) => getSdeMetaValueMock(...args),
  setSdeMetaValue: (...args: unknown[]) => setSdeMetaValueMock(...args),
}));

vi.mock('@/data/eve-data/source', () => ({
  getRemoteSdeVersion: (...args: unknown[]) => getRemoteSdeVersionMock(...args),
}));

vi.mock('@/composition/pipelines/sde-pipeline', () => ({
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

vi.mock('@/db/direct-database', () => ({ directDatabase: () => ({}) }));

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

const ROUTE = '/api/cron/refresh-sde';

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
    vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);
    silenceConsolePrefixes('log', ['{"scope":"cron:']);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('records a no-drift run as cron_sde/up-to-date (O-3)', async () => {
    getSdeMetaValueMock.mockResolvedValue('2026-05-01');
    getRemoteSdeVersionMock.mockResolvedValue('2026-05-01');
    const { GET } = await import('./route');
    const res = await GET(cronRequest(ROUTE));
    expect((await res.json()).status).toBe('up-to-date');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sde',
      metadata: expect.objectContaining({ outcome: 'up-to-date' }),
    });
    expect(reserveMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('records a remote-unreachable run as cron_sde/remote-unreachable (O-3)', async () => {
    getSdeMetaValueMock.mockResolvedValue('2026-05-01');
    getRemoteSdeVersionMock.mockResolvedValue(null);
    const { GET } = await import('./route');
    const res = await GET(cronRequest(ROUTE));
    expect((await res.json()).status).toBe('remote-unreachable');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sde',
      metadata: expect.objectContaining({ outcome: 'remote-unreachable' }),
    });
    expect(reserveMock).not.toHaveBeenCalled();
  });

  it('records a busy skip as cron_sde/busy when the lock is held (O-3)', async () => {
    getSdeMetaValueMock.mockResolvedValue('2026-05-01');
    getRemoteSdeVersionMock.mockResolvedValue('2026-05-08');
    lockGot = false;
    const { GET } = await import('./route');
    const res = await GET(cronRequest(ROUTE));
    expect((await res.json()).status).toBe('busy');
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_sde',
      metadata: expect.objectContaining({ outcome: 'busy' }),
    });
    expect(runSdePipelineMock).not.toHaveBeenCalled();
  });

  it('records a re-ingest as cron_sde/reingested with the pipeline summary (O-2)', async () => {
    getSdeMetaValueMock.mockResolvedValue('2026-05-01');
    getRemoteSdeVersionMock.mockResolvedValue('2026-05-08');
    lockGot = true;
    runSdePipelineMock.mockResolvedValue(PIPELINE_SUMMARY);
    const { GET } = await import('./route');
    const res = await GET(cronRequest(ROUTE));
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
    expect(revalidateTagMock.mock.calls).toEqual([[SDE_CACHE_TAG, 'max']]);
  });

  it('rejects a request without the cron bearer token', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('http://localhost:3000/api/cron/refresh-sde'));
    expect(res.status).toBe(401);
    expect(getSdeMetaValueMock).not.toHaveBeenCalled();
  });
});
