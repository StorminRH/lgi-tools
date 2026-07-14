import type { EsiBudgetExhaustedError } from '@/lib/esi';
import type { OwnerSyncTarget } from '@/lib/owner-sync';
import type {
  ESI_REFRESH_DATASETS,
  ESI_REFRESH_JOB_STATUSES,
} from './constants';
import type { esiRefreshJobs } from './schema';

export type EsiRefreshDataset = (typeof ESI_REFRESH_DATASETS)[number];
export type EsiRefreshJobStatus = (typeof ESI_REFRESH_JOB_STATUSES)[number];
export type EsiRefreshJob = typeof esiRefreshJobs.$inferSelect;

export interface EnqueueEsiRefreshJobInput {
  dataset: EsiRefreshDataset;
  userId: string;
  target: OwnerSyncTarget;
  error: EsiBudgetExhaustedError;
}
