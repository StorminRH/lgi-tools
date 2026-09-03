import type { EsiBudgetExhaustedError } from '@/platform/esi';
import type { OwnerSyncTarget } from '@/platform/owner-sync';
import type {
  ESI_REFRESH_DATASETS,
  ESI_REFRESH_JOB_STATUSES,
} from './constants';
import type { esiRefreshJobs } from './schema';

export type EsiRefreshDataset = (typeof ESI_REFRESH_DATASETS)[number];
export type EsiRefreshJobStatus = (typeof ESI_REFRESH_JOB_STATUSES)[number];
export type EsiRefreshJob = typeof esiRefreshJobs.$inferSelect;

export interface EsiRefreshQueueStat {
  status: EsiRefreshJobStatus;
  count: number;
  oldestCreatedAt: Date;
}

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

export type RequeueDeadLetterOutcome =
  | { outcome: 'requeued' }
  | { outcome: 'superseded' }
  | { outcome: 'not_found' };

export interface EnqueueEsiRefreshJobInput {
  dataset: EsiRefreshDataset;
  userId: string;
  target: OwnerSyncTarget;
  error: EsiBudgetExhaustedError;
}
