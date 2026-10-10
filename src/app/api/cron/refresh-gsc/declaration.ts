import { getSitemapEntries } from '@/composition/sitemap';
import type { CronRefreshGscResponse } from '@/data/gsc/api-contract';
import { ADVISORY_LOCK_GSC_SYNC } from '@/data/gsc/constants';
import { syncGsc } from '@/data/gsc/ingest';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';

export const refreshGscDeclaration: CronRouteDeclaration<CronRefreshGscResponse> = {
  name: 'cron:gsc',
  action: 'cron_gsc',
  capability: 'cron.refresh-gsc',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'daily batch wakes Neon by design and preserves skipped or partial syncs',
  },
  lock: {
    key: Number(ADVISORY_LOCK_GSC_SYNC),
    busyBody: (durationMs) => ({
      status: 'skipped',
      reason: 'busy',
      searchRows: 0,
      sitemaps: 0,
      urlsInspected: 0,
      errors: [],
      durationMs,
    }),
  },
  work: async ({ database }) => {
    const sitemapUrls = (await getSitemapEntries()).map((entry) => entry.url);
    const summary = await syncGsc(database, sitemapUrls);

    return {
      outcome: summary.status,
      workDone: summary.status !== 'skipped',
      telemetry: {
        reason: summary.reason,
        searchRows: summary.searchRows,
        sitemaps: summary.sitemaps,
        urlsInspected: summary.urlsInspected,
        errorCount: summary.errors.length,
      },
      body: summary,
    };
  },
};
