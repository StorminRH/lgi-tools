import type { CronRefreshGscResponse } from '@/data/gsc/api-contract';
import { DOMAIN_EVENT_RETENTION_DAYS } from '@/data/domain-events/constants';
import { pruneDomainEvents } from '@/data/domain-events/queries';
import { SNAPSHOT_RETENTION_DAYS } from '@/data/esi-snapshots/constants';
import { ESI_REFRESH_JOB_RETENTION_DAYS } from '@/data/esi-refresh-jobs/constants';
import { pruneEsiRefreshJobs } from '@/data/esi-refresh-jobs/queries';
import { ADVISORY_LOCK_GSC_SYNC, GSC_RETENTION_DAYS } from '@/data/gsc/constants';
import { syncGsc } from '@/data/gsc/ingest';
import { pruneGscSearchAnalytics, pruneGscUrlInspections } from '@/data/gsc/queries';
import { USAGE_LOG_RETENTION_DAYS } from '@/data/telemetry/constants';
import { logUsageEvent, pruneUsageLogs } from '@/data/telemetry/queries';
import { db, directClient } from '@/db';
import { runCronJob } from '@/db/cron-gate';
import { pruneEsiSnapshots } from '@/db/esi-snapshot-retention';
import {
  CORP_ACCESS_AUDIT_RETENTION_DAYS,
  VERIFICATION_RETENTION_DAYS,
} from '@/features/auth/constants';
import { pruneCorpAccessAudit } from '@/features/auth/affiliation-store';
import { pruneExpiredVerifications } from '@/features/auth/verification-retention';
import { swallow } from '@/lib/cron';
import { getSitemapEntries } from '@/app/sitemap';

// Vercel-cron endpoint, scheduled in vercel.json ("0 9 * * *" — daily, clear of
// the 11:30 prices sweep and the daily SDE run). Vercel's cron invoker sends
// GET with `Authorization: Bearer ${CRON_SECRET}`; reject anything else with 401
// so the URL stays inert if scraped.
//
// Pulls Google Search Console snapshots into our own tables; the admin
// dashboard reads only the stored copy. A failed/throttled sync degrades to the
// last snapshot (the page shows last-known, not broken) and is logged here.
// Runs under the shared cron gate's advisory lock, which skips an overlapping
// run of itself — under Vercel's at-least-once cron delivery a duplicate
// dispatch would otherwise double-pull the quota'd GSC API. The daily
// retention prunes piggyback on the same lock, so the tables stay bounded with
// no extra cron slot.
//
// Logging the sync OUTCOME to usage_logs is cron observability — same as
// cron_prices/cron_sde — not GSC data mixed into telemetry; the GSC data itself
// lives only in the gsc_* tables. No GSC config → the sync no-ops (skipped).
// No user input — bearer-auth only, body and query params ignored.

const LOCK_KEY_NUM = Number(ADVISORY_LOCK_GSC_SYNC);

/**
 * Handles GET requests for /api/cron/refresh-gsc; this route owns its authorization, boundary
 * validation, and typed response mapping.
 */
// authz: cron
export async function GET(req: Request): Promise<Response> {
  const start = Date.now();
  return runCronJob({
    req,
    lockKey: LOCK_KEY_NUM,
    onBusy: async () => {
      // Another invocation holds the lock — skip rather than double-pull GSC.
      console.log(JSON.stringify({ scope: 'cron:gsc', outcome: 'skipped', reason: 'busy' }));
      await swallow(
        '[cron:gsc] telemetry write failed',
        logUsageEvent({ action: 'cron_gsc', metadata: { outcome: 'skipped', reason: 'busy' } }),
      );
      return Response.json({
        status: 'skipped',
        reason: 'busy',
        searchRows: 0,
        sitemaps: 0,
        urlsInspected: 0,
        errors: [],
        durationMs: Date.now() - start,
      } satisfies CronRefreshGscResponse);
    },
    work: async () => {
      // Daily housekeeping runs inside the lock so a duplicate cron cannot race
      // the same retention sweep. Each prune is swallowed independently so one
      // hiccup neither prevents the remaining tables pruning nor fails the sync.
      // It runs before sitemap/GSC work so an upstream outage cannot suspend
      // unrelated retention policies.
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

      // The fetch + upserts run on the directClient pool; the lock stays on the
      // gate's reserved connection. The GSC HTTP calls happen with no
      // transaction open.
      const sitemapUrls = (await getSitemapEntries()).map((entry) => entry.url);
      const summary = await syncGsc(directClient, sitemapUrls);

      // Structured boundary line (runtime logs) + durable telemetry row. `outcome`
      // mirrors the price cron so a skipped/failed/partial run is distinguishable
      // from a healthy sync in the record.
      console.log(
        JSON.stringify({
          scope: 'cron:gsc',
          outcome: summary.status,
          searchRows: summary.searchRows,
          sitemaps: summary.sitemaps,
          urlsInspected: summary.urlsInspected,
          errorCount: summary.errors.length,
          durationMs: summary.durationMs,
        }),
      );
      await swallow(
        '[cron:gsc] telemetry write failed',
        logUsageEvent({
          action: 'cron_gsc',
          metadata: {
            outcome: summary.status,
            reason: summary.reason,
            searchRows: summary.searchRows,
            sitemaps: summary.sitemaps,
            urlsInspected: summary.urlsInspected,
            errorCount: summary.errors.length,
            durationMs: summary.durationMs,
          },
        }),
      );

      return Response.json(summary satisfies CronRefreshGscResponse);
    },
  });
}
