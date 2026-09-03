import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import type { CronRefreshAffiliationsResponse } from '@/platform/auth/api-contract';
import { refreshAffiliationsDeclaration } from './declaration';

export const maxDuration = 60;

export const GET = defineCronRoute<CronRefreshAffiliationsResponse>(
  refreshAffiliationsDeclaration,
);
