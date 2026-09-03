import type { EsiRefreshWorkerSummary } from '@/data/esi-refresh-jobs/api-contract';
import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import { drainEsiRefreshJobsDeclaration } from './declaration';

export const maxDuration = 300;

// authz: cron
// input: none
export const GET = defineCronRoute<EsiRefreshWorkerSummary>(
  drainEsiRefreshJobsDeclaration,
);
