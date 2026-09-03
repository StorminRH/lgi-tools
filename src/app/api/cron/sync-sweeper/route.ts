import type { CronSyncSweeperResponse } from '@/data/convex/api-contract';
import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import { syncSweeperDeclaration } from './declaration';

export const GET = defineCronRoute<CronSyncSweeperResponse>(
  syncSweeperDeclaration,
);
