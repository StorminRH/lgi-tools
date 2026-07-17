import { getSitemapEntries } from '@/app/sitemap';
import { DOMAIN_EVENT_RETENTION_DAYS } from '@/data/domain-events/constants';
import { pruneDomainEvents } from '@/data/domain-events/queries';
import { ESI_REFRESH_JOB_RETENTION_DAYS } from '@/data/esi-refresh-jobs/constants';
import { pruneEsiRefreshJobs } from '@/data/esi-refresh-jobs/queries';
import { SNAPSHOT_RETENTION_DAYS } from '@/data/esi-snapshots/constants';
import type { CronRefreshGscResponse } from '@/data/gsc/api-contract';
import {
  ADVISORY_LOCK_GSC_SYNC,
  GSC_RETENTION_DAYS,
} from '@/data/gsc/constants';
import { syncGsc } from '@/data/gsc/ingest';
import {
  pruneGscSearchAnalytics,
  pruneGscUrlInspections,
} from '@/data/gsc/queries';
import { USAGE_LOG_RETENTION_DAYS } from '@/data/telemetry/constants';
import { pruneUsageLogs } from '@/data/telemetry/queries';
import { db } from '@/db';
import type { CronRouteDeclaration } from '@/db/cron-gate';
import { pruneEsiSnapshots } from '@/db/esi-snapshot-retention';
import { pruneCorpAccessAudit } from '@/features/auth/affiliation-store';
import {
  CORP_ACCESS_AUDIT_RETENTION_DAYS,
  VERIFICATION_RETENTION_DAYS,
} from '@/features/auth/constants';
import { pruneExpiredVerifications } from '@/features/auth/verification-retention';
import { swallow } from '@/lib/cron';

/**
 * Declares the daily GSC sync and its piggybacked retention sweep as one
 * lock-guarded batch. Each prune is isolated and runs before upstream work so
 * an external outage cannot suspend unrelated retention policies.
 */
export const refreshGscDeclaration: CronRouteDeclaration<CronRefreshGscResponse> = {
  name: 'cron:gsc',
  action: 'cron_gsc',
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
  work: async ({ client }) => {
    await swallow(
      '[cron:gsc] domain_events prune failed',
      pruneDomainEvents(db, DOMAIN_EVENT_RETENTION_DAYS),
    );
    await swallow(
      '[cron:gsc] usage_logs prune failed',
      pruneUsageLogs(USAGE_LOG_RETENTION_DAYS),
    );
    await swallow(
      '[cron:gsc] search analytics prune failed',
      pruneGscSearchAnalytics(db, GSC_RETENTION_DAYS),
    );
    await swallow(
      '[cron:gsc] URL inspection prune failed',
      pruneGscUrlInspections(db, GSC_RETENTION_DAYS),
    );
    await swallow(
      '[cron:gsc] corp access audit prune failed',
      pruneCorpAccessAudit(db, CORP_ACCESS_AUDIT_RETENTION_DAYS),
    );
    await swallow(
      '[cron:gsc] expired verification prune failed',
      pruneExpiredVerifications(db, VERIFICATION_RETENTION_DAYS),
    );
    await swallow(
      '[cron:gsc] ESI snapshot prune failed',
      pruneEsiSnapshots(db, SNAPSHOT_RETENTION_DAYS),
    );
    await swallow(
      '[cron:gsc] ESI refresh job prune failed',
      pruneEsiRefreshJobs(db, ESI_REFRESH_JOB_RETENTION_DAYS),
    );

    const sitemapUrls = (await getSitemapEntries()).map((entry) => entry.url);
    const summary = await syncGsc(client, sitemapUrls);

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
