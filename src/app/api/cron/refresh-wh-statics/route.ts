import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import type { CronRefreshWhStaticsResponse } from '@/data/wh-statics/api-contract';
import {
  refreshWhStaticsDeclaration,
  type WhStaticsPreLock,
} from './declaration';

export const maxDuration = 60;

// authz: cron
// input: none
export const GET = defineCronRoute<
  CronRefreshWhStaticsResponse,
  WhStaticsPreLock
>(refreshWhStaticsDeclaration);
