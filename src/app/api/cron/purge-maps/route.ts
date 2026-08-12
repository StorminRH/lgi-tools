import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import type { CronPurgeMapsResponse } from '@/data/maps/api-contract';
import { purgeMapsDeclaration } from './declaration';

/** Maximum wall time for one bounded daily purge invocation. */
export const maxDuration = 300;

/** Runs the daily grace-expiry and requested-purge sweep. */
// authz: cron
// input: none
export const GET = defineCronRoute<CronPurgeMapsResponse>(purgeMapsDeclaration);
