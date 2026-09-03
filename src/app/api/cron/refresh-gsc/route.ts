import type { CronRefreshGscResponse } from '@/data/gsc/api-contract';
import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import { refreshGscDeclaration } from './declaration';

// authz: cron
// input: none
export const GET = defineCronRoute<CronRefreshGscResponse>(
  refreshGscDeclaration,
);
