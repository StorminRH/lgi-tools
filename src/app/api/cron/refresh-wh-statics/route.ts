import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import type { CronRefreshWhStaticsResponse } from '@/data/wh-statics/api-contract';
import {
  refreshWhStaticsDeclaration,
  type WhStaticsPreLock,
} from './declaration';

/** Weekly community-feed refresh budget, including validation and snapshot write. */
export const maxDuration = 60;

/**
 * Runs the declared statics refresh through the shared cron shell; accepts only
 * cron bearer auth and consumes no body or query parameters.
 */
// authz: cron
// input: none
export const GET = defineCronRoute<
  CronRefreshWhStaticsResponse,
  WhStaticsPreLock
>(refreshWhStaticsDeclaration);
