import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncGscMock = vi.fn();
const pruneSearchMock = vi.fn();
const pruneInspectionsMock = vi.fn();
const pruneUsageMock = vi.fn();
const pruneAuditMock = vi.fn();
const pruneVerificationMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/data/gsc/ingest', () => ({
  syncGsc: (...args: unknown[]) => syncGscMock(...args),
}));

vi.mock('@/data/gsc/queries', () => ({
  pruneGscSearchAnalytics: (...args: unknown[]) => pruneSearchMock(...args),
  pruneGscUrlInspections: (...args: unknown[]) => pruneInspectionsMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => logUsageEventMock(...args),
  pruneUsageLogs: (...args: unknown[]) => pruneUsageMock(...args),
}));

vi.mock('@/features/auth/queries', () => ({
  pruneCorpAccessAudit: (...args: unknown[]) => pruneAuditMock(...args),
  pruneExpiredVerifications: (...args: unknown[]) => pruneVerificationMock(...args),
}));

vi.mock('@/db', () => ({ db: {}, directClient: {} }));

vi.mock('@/db/cron-gate', () => ({
  runCronJob: ({ work }: { work: () => Promise<Response> }) => work(),
}));

vi.mock('@/app/sitemap', () => ({
  getSitemapEntries: () => Promise.resolve([{ url: 'https://lgi.tools/' }]),
}));

async function importRoute() {
  return await import('./route');
}

describe('GET /api/cron/refresh-gsc housekeeping', () => {
  beforeEach(() => {
    vi.resetModules();
    syncGscMock.mockReset();
    pruneSearchMock.mockReset();
    pruneInspectionsMock.mockReset();
    pruneUsageMock.mockReset();
    pruneAuditMock.mockReset();
    pruneVerificationMock.mockReset();
    logUsageEventMock.mockReset();
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
    pruneSearchMock.mockResolvedValue(undefined);
    pruneInspectionsMock.mockResolvedValue(undefined);
    pruneAuditMock.mockResolvedValue(undefined);
    pruneVerificationMock.mockResolvedValue(undefined);
    logUsageEventMock.mockResolvedValue(undefined);
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
    expect(pruneSearchMock).toHaveBeenCalledOnce();
    expect(pruneInspectionsMock).toHaveBeenCalledOnce();
    expect(pruneAuditMock).toHaveBeenCalledOnce();
    expect(pruneVerificationMock).toHaveBeenCalledOnce();
  });
});
