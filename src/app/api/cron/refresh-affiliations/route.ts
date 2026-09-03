import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import type { CronRefreshAffiliationsResponse } from '@/platform/auth/api-contract';
import { refreshAffiliationsDeclaration } from './declaration';

export const maxDuration = 60;

// authz: cron
// input: none
export const GET = defineCronRoute<CronRefreshAffiliationsResponse>(
  refreshAffiliationsDeclaration,
);
