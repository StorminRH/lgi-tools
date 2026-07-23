import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncGscMock = vi.fn();
const pruneDomainEventsMock = vi.fn();
const pruneSearchMock = vi.fn();
const pruneInspectionsMock = vi.fn();
const pruneUsageMock = vi.fn();
const pruneAuditMock = vi.fn();
const pruneVerificationMock = vi.fn();
const pruneSnapshotsMock = vi.fn();
const pruneRefreshJobsMock = vi.fn();
const logUsageEventMock = vi.fn();
const getSitemapEntriesMock = vi.fn();

vi.mock('@/data/gsc/ingest', () => ({
  syncGsc: (...args: unknown[]) => syncGscMock(...args),
}));

vi.mock('@/data/domain-events/queries', () => ({
  pruneDomainEvents: (...args: unknown[]) => pruneDomainEventsMock(...args),
}));

vi.mock('@/data/gsc/queries', () => ({
  pruneGscSearchAnalytics: (...args: unknown[]) => pruneSearchMock(...args),
  pruneGscUrlInspections: (...args: unknown[]) => pruneInspectionsMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => logUsageEventMock(...args),
  pruneUsageLogs: (...args: unknown[]) => pruneUsageMock(...args),
}));

vi.mock('@/platform/auth/affiliation-store', () => ({
  pruneCorpAccessAudit: (...args: unknown[]) => pruneAuditMock(...args),
}));

vi.mock('@/platform/auth/verification-retention', () => ({
  pruneExpiredVerifications: (...args: unknown[]) => pruneVerificationMock(...args),
}));

vi.mock('@/db/esi-snapshot-retention', () => ({
  pruneEsiSnapshots: (...args: unknown[]) => pruneSnapshotsMock(...args),
}));

vi.mock('@/data/esi-refresh-jobs/queries', () => ({
  pruneEsiRefreshJobs: (...args: unknown[]) => pruneRefreshJobsMock(...args),
}));

vi.mock('@/db', () => ({ db: {}, directClient: {} }));

vi.mock('@/db/cron-gate', () => ({
  defineCronRoute:
    (declaration: {
      work: (
        ctx: {
          client: unknown;
          record: (...args: unknown[]) => Promise<void>;
        },
        pre: unknown,
      ) => Promise<{ body: unknown }>;
    }) =>
    async () => {
      const outcome = await declaration.work(
        { client: {}, record: async () => {} },
        undefined,
      );
      return Response.json(outcome.body);
    },
}));

vi.mock('@/composition/sitemap', () => ({
  getSitemapEntries: (...args: unknown[]) => getSitemapEntriesMock(...args),
}));

async function importRoute() {
  return await import('./route');
}

describe('GET /api/cron/refresh-gsc housekeeping', () => {
  beforeEach(() => {
    vi.resetModules();
    syncGscMock.mockReset();
    pruneDomainEventsMock.mockReset();
    pruneSearchMock.mockReset();
    pruneInspectionsMock.mockReset();
    pruneUsageMock.mockReset();
    pruneAuditMock.mockReset();
    pruneVerificationMock.mockReset();
    pruneSnapshotsMock.mockReset();
    pruneRefreshJobsMock.mockReset();
    logUsageEventMock.mockReset();
    getSitemapEntriesMock.mockReset();
    syncGscMock.mockResolvedValue({
      status: 'skipped',
      reason: 'not_configured',
      searchRows: 0,
      sitemaps: 0,
      urlsInspected: 0,
      errors: [],
      durationMs: 1,
    });
    pruneUsageMock.mockResolvedValue(undefined);
    pruneDomainEventsMock.mockResolvedValue(undefined);
    pruneSearchMock.mockResolvedValue(undefined);
    pruneInspectionsMock.mockResolvedValue(undefined);
    pruneAuditMock.mockResolvedValue(undefined);
    pruneVerificationMock.mockResolvedValue(undefined);
    pruneSnapshotsMock.mockResolvedValue(undefined);
    pruneRefreshJobsMock.mockResolvedValue(undefined);
    logUsageEventMock.mockResolvedValue(undefined);
    getSitemapEntriesMock.mockResolvedValue([{ url: 'https://lgi.tools/' }]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs every prune on a skipped sync and isolates a prune failure', async () => {
    pruneSearchMock.mockRejectedValue(new Error('search prune failed'));
    const { GET } = await importRoute();

    const response = await GET(new Request('http://localhost:3000/api/cron/refresh-gsc'));

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('skipped');
    expect(pruneUsageMock).toHaveBeenCalledOnce();
    expect(pruneDomainEventsMock).toHaveBeenCalledOnce();
    expect(pruneSearchMock).toHaveBeenCalledOnce();
    expect(pruneInspectionsMock).toHaveBeenCalledOnce();
    expect(pruneAuditMock).toHaveBeenCalledOnce();
    expect(pruneVerificationMock).toHaveBeenCalledOnce();
    expect(pruneSnapshotsMock).toHaveBeenCalledOnce();
    expect(pruneRefreshJobsMock).toHaveBeenCalledOnce();
  });

  it('runs every prune before an upstream sitemap failure escapes', async () => {
    getSitemapEntriesMock.mockRejectedValue(new Error('sitemap failed'));
    const { GET } = await importRoute();

    await expect(
      GET(new Request('http://localhost:3000/api/cron/refresh-gsc')),
    ).rejects.toThrow('sitemap failed');

    expect(pruneUsageMock).toHaveBeenCalledOnce();
    expect(pruneDomainEventsMock).toHaveBeenCalledOnce();
    expect(pruneSearchMock).toHaveBeenCalledOnce();
    expect(pruneInspectionsMock).toHaveBeenCalledOnce();
    expect(pruneAuditMock).toHaveBeenCalledOnce();
    expect(pruneVerificationMock).toHaveBeenCalledOnce();
    expect(pruneSnapshotsMock).toHaveBeenCalledOnce();
    expect(pruneRefreshJobsMock).toHaveBeenCalledOnce();
    expect(syncGscMock).not.toHaveBeenCalled();
  });
});
