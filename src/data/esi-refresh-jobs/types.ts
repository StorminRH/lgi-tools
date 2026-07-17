import type { EsiBudgetExhaustedError } from '@/lib/esi';
import type { OwnerSyncTarget } from '@/lib/owner-sync';
import type {
  ESI_REFRESH_DATASETS,
  ESI_REFRESH_JOB_STATUSES,
} from './constants';
import type { esiRefreshJobs } from './schema';

/** Closed durable refresh datasets accepted by the shared queue and worker registry. */
export type EsiRefreshDataset = (typeof ESI_REFRESH_DATASETS)[number];
/** Closed queue lifecycle states; every transition is owned by the refresh-job query module. */
export type EsiRefreshJobStatus = (typeof ESI_REFRESH_JOB_STATUSES)[number];
/**
 * Stored refresh-job record with owner identity, due time, attempt count, lifecycle status, and
 * privacy-safe failure metadata.
 */
export type EsiRefreshJob = typeof esiRefreshJobs.$inferSelect;

/** Operations count for one dataset and queue status pair. */
export interface EsiRefreshQueueStat {
  status: EsiRefreshJobStatus;
  count: number;
  oldestCreatedAt: Date;
}

/** Privacy-safe dead-letter view carrying job identity and failure taxonomy without raw owner credentials. */
export type DeadLetterRow = Pick<
  EsiRefreshJob,
  | 'id'
  | 'dataset'
  | 'ownerType'
  | 'ownerId'
  | 'resource'
  | 'budgetReason'
  | 'lastErrorCode'
  | 'attemptCount'
  | 'createdAt'
  | 'finishedAt'
>;

/**
 * Closed operator requeue outcome distinguishing a successful requeue from missing or conflicting
 * job state.
 */
export type RequeueDeadLetterOutcome =
  | { outcome: 'requeued' }
  | { outcome: 'superseded' }
  | { outcome: 'not_found' };

/** Validated queue input identifying dataset, owner type and ID, due time, and bounded reason metadata. */
export interface EnqueueEsiRefreshJobInput {
  dataset: EsiRefreshDataset;
  userId: string;
  target: OwnerSyncTarget;
  error: EsiBudgetExhaustedError;
}
