import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import type { CronPurgeMapsResponse } from '@/data/maps/api-contract';
import { purgeMapsDeclaration } from './declaration';

export const maxDuration = 300;

export const GET = defineCronRoute<CronPurgeMapsResponse>(purgeMapsDeclaration);
