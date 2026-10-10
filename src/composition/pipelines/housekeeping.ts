import { retryRequestedDeletions } from '@/composition/account-lifecycle/account-purge';
import { reconcileTrackingMerges } from '@/composition/account-lifecycle/tracking-merge-retry';
import { pruneTrackingMergeReceipts } from '@/composition/account-lifecycle/tracking-receipt-retention';
import { scopeLegacyMaps } from '@/composition/map-character-scoping';
import { DOMAIN_EVENT_RETENTION_DAYS } from '@/data/domain-events/constants';
import { pruneDomainEvents } from '@/data/domain-events/queries';
import { ENTITY_NAME_RETENTION_DAYS, pruneEntityNames } from '@/data/eve-data/entity-names-store';
import { ESI_REFRESH_JOB_RETENTION_DAYS } from '@/data/esi-refresh-jobs/constants';
import { pruneEsiRefreshJobs } from '@/data/esi-refresh-jobs/queries';
import { SNAPSHOT_RETENTION_DAYS } from '@/data/esi-snapshots/constants';
import { GSC_RETENTION_DAYS } from '@/data/gsc/constants';
import { pruneGscSearchAnalytics, pruneGscUrlInspections } from '@/data/gsc/queries';
import { pruneStaleMarketHistory } from '@/data/market-history/ingest';
import { USAGE_LOG_RETENTION_DAYS } from '@/data/telemetry/constants';
import { pruneUsageLogs } from '@/data/telemetry/queries';
import { WH_STATICS_SNAPSHOT_RETENTION_DAYS } from '@/data/wh-statics/constants';
import { pruneWhStaticsSnapshots } from '@/data/wh-statics/queries';
import { db } from '@/db';
import type { BatchedDeleteResult } from '@/lib/batched-delete';
import { errorMessage } from '@/lib/failure';
import { pruneCorpAccessAudit } from '@/platform/auth/affiliation-store';
import {
  CORP_ACCESS_AUDIT_RETENTION_DAYS,
  SESSION_RETENTION_DAYS,
  VERIFICATION_RETENTION_DAYS,
} from '@/platform/auth/constants';
import {
  pruneExpiredSessions,
  pruneExpiredVerifications,
} from '@/platform/auth/verification-retention';
import { pruneEsiSnapshots } from './esi-snapshot-retention';

/** Time the deletes share; a delete stopped by it reports unfinished and resumes tomorrow. */
const DELETE_BUDGET_MS = 60_000;
const DELETION_RETRY_BUDGET_MS = 30_000;
const RECEIPT_CLEANUP_BUDGET_MS = 10_000;
const CHARACTER_SCOPING_BUDGET_MS = 30_000;

export interface HousekeepingDeleteResult {
  readonly task: string;
  readonly deleted: number;
  readonly finished: boolean;
  readonly error: string | null;
}

export interface HousekeepingRetryResult {
  readonly task: string;
  readonly succeeded: number;
  readonly failed: number;
  readonly error: string | null;
}

export interface HousekeepingSummary {
  readonly status: 'cleaned' | 'partial';
  readonly deletes: readonly HousekeepingDeleteResult[];
  readonly retries: readonly HousekeepingRetryResult[];
}

interface DeleteTask {
  readonly task: string;
  readonly run: (now: Date, deadline: number) => Promise<BatchedDeleteResult>;
}

const DELETE_TASKS: readonly DeleteTask[] = [
  {
    task: 'domain_events',
    run: (now, deadline) => pruneDomainEvents(db, DOMAIN_EVENT_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'usage_logs',
    run: (now, deadline) => pruneUsageLogs(USAGE_LOG_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'gsc_search_analytics',
    run: (now, deadline) => pruneGscSearchAnalytics(db, GSC_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'gsc_url_inspection',
    run: (now, deadline) => pruneGscUrlInspections(db, GSC_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'corp_access_audit',
    run: (now, deadline) =>
      pruneCorpAccessAudit(db, CORP_ACCESS_AUDIT_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'verification',
    run: (now, deadline) =>
      pruneExpiredVerifications(db, VERIFICATION_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'session',
    run: (now, deadline) => pruneExpiredSessions(db, SESSION_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'esi_snapshots',
    run: (now, deadline) => pruneEsiSnapshots(db, SNAPSHOT_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'esi_refresh_jobs',
    run: (now, deadline) =>
      pruneEsiRefreshJobs(db, ESI_REFRESH_JOB_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'wh_statics_snapshots',
    run: (now, deadline) =>
      pruneWhStaticsSnapshots(db, WH_STATICS_SNAPSHOT_RETENTION_DAYS, now, deadline),
  },
  {
    task: 'market_history',
    run: (now, deadline) => pruneStaleMarketHistory(db, now, deadline),
  },
  {
    task: 'eve_entity_names',
    run: (now, deadline) => pruneEntityNames(db, ENTITY_NAME_RETENTION_DAYS, now, deadline),
  },
];

async function runDelete(
  task: DeleteTask,
  now: Date,
  deadline: number,
): Promise<HousekeepingDeleteResult> {
  try {
    const result = await task.run(now, deadline);
    return { task: task.task, deleted: result.deleted, finished: result.finished, error: null };
  } catch (error) {
    console.error(`[housekeeping] ${task.task} failed`, error);
    return { task: task.task, deleted: 0, finished: false, error: errorMessage(error) };
  }
}

async function runRetry(
  task: string,
  run: () => Promise<{ succeeded: number; failed: number }>,
): Promise<HousekeepingRetryResult> {
  try {
    return { task, ...(await run()), error: null };
  } catch (error) {
    console.error(`[housekeeping] ${task} failed`, error);
    return { task, succeeded: 0, failed: 0, error: errorMessage(error) };
  }
}

/**
 * Daily cleanup. Every delete and retry runs even when an earlier one fails;
 * any failure marks the run partial so it shows as failed.
 */
export async function runHousekeeping(now: Date = new Date()): Promise<HousekeepingSummary> {
  const deleteDeadline = Date.now() + DELETE_BUDGET_MS;
  const deletes: HousekeepingDeleteResult[] = [];
  for (const task of DELETE_TASKS) {
    deletes.push(await runDelete(task, now, deleteDeadline));
  }

  const retries = [
    await runRetry('requested_deletions', async () => {
      const result = await retryRequestedDeletions(Date.now() + DELETION_RETRY_BUDGET_MS);
      return { succeeded: result.retried, failed: result.failed };
    }),
    await runRetry('tracking_merges', async () => {
      const result = await reconcileTrackingMerges();
      return { succeeded: result.processed, failed: result.failed };
    }),
    await runRetry('character_scoping', () =>
      scopeLegacyMaps(Date.now() + CHARACTER_SCOPING_BUDGET_MS)),
  ];

  deletes.push(await runDelete({
    task: 'account_merge_tracking_receipts',
    run: pruneTrackingMergeReceipts,
  }, now, Date.now() + RECEIPT_CLEANUP_BUDGET_MS));

  const failed =
    deletes.some((result) => result.error !== null)
    || retries.some((result) => result.error !== null || result.failed > 0);
  return { status: failed ? 'partial' : 'cleaned', deletes, retries };
}
