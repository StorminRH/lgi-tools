import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const syncGscMock = vi.fn();
const getSitemapEntriesMock = vi.fn();

vi.mock('@/data/gsc/ingest', () => ({
  syncGsc: (...args: unknown[]) => syncGscMock(...args),
}));

vi.mock('@/composition/pipelines/cron-gate', () => ({
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

describe('GET /api/cron/refresh-gsc', () => {
  beforeEach(() => {
    vi.resetModules();
    syncGscMock.mockReset().mockResolvedValue({
      status: 'skipped',
      reason: 'not_configured',
      searchRows: 0,
      sitemaps: 0,
      urlsInspected: 0,
      errors: [],
      durationMs: 1,
    });
    getSitemapEntriesMock.mockReset().mockResolvedValue([{ url: 'https://lgi.tools/' }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('syncs the sitemap URLs and returns the sync summary', async () => {
    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost:3000/api/cron/refresh-gsc'));

    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('skipped');
    expect(syncGscMock).toHaveBeenCalledWith({}, ['https://lgi.tools/']);
  });

  it('lets an upstream sitemap failure escape before syncing', async () => {
    getSitemapEntriesMock.mockRejectedValue(new Error('sitemap failed'));
    const { GET } = await import('./route');

    await expect(
      GET(new Request('http://localhost:3000/api/cron/refresh-gsc')),
    ).rejects.toThrow('sitemap failed');
    expect(syncGscMock).not.toHaveBeenCalled();
  });
});
