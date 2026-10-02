import type { CronBatchResponse } from '@/composition/pipelines/api-contract';
import {
  cronBatchStep,
  defineCronBatchRoute,
} from '@/composition/pipelines/cron-gate';
import { drainEsiRefreshJobsDeclaration } from '../drain-esi-refresh-jobs/declaration';
import { housekeepingDeclaration } from '../housekeeping/declaration';
import { purgeMapsDeclaration } from '../purge-maps/declaration';
import { refreshIndustryIndicesDeclaration } from '../refresh-industry-indices/declaration';
import { refreshPricesDeclaration } from '../refresh-prices/declaration';
import { refreshWhStaticsDeclaration } from '../refresh-wh-statics/declaration';
import { revalueNetWorthDeclaration } from '../revalue-net-worth/declaration';

/**
 * The daily Vercel cron. Hobby fires it anywhere in the 12:00 UTC hour, after
 * CCP's 11:00 downtime; running the steps in one invocation keeps their order
 * fixed. The ESI refresh queue drains after the price sweeps so deferred
 * holdings land before net worth is revalued at the new prices. Housekeeping
 * runs last under its own time budget, so a backlog never delays the
 * refreshes. The SDE refresh keeps its own later window and invocation.
 */
export const maxDuration = 300;

const isMonday = (now: Date): boolean => now.getUTCDay() === 1;

// authz: cron
// input: none
export const GET = defineCronBatchRoute<CronBatchResponse>([
  cronBatchStep(purgeMapsDeclaration),
  cronBatchStep(refreshPricesDeclaration),
  cronBatchStep(refreshIndustryIndicesDeclaration),
  cronBatchStep(drainEsiRefreshJobsDeclaration),
  cronBatchStep(revalueNetWorthDeclaration),
  cronBatchStep(refreshWhStaticsDeclaration, isMonday),
  cronBatchStep(housekeepingDeclaration),
]);
