import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { purgeEligibleMaps } from '@/composition/map-purge';
import type { CronPurgeMapsResponse } from '@/data/maps/api-contract';
import { ADVISORY_LOCKS } from '@/db/advisory-lock';

export const purgeMapsDeclaration: CronRouteDeclaration<CronPurgeMapsResponse> = {
  name: 'cron:purge-maps',
  action: 'cron_map_purge',
  capability: 'cron.purge-maps',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'daily grace enforcement intentionally wakes Neon and records every run',
  },
  lock: {
    key: ADVISORY_LOCKS.mapPurge,
    busyBody: () => ({ status: 'busy' }),
  },
  work: async () => {
    const result = await purgeEligibleMaps();
    return {
      outcome: 'purged',
      workDone: result.tombstoned > 0,
      telemetry: result,
      body: { status: 'purged', ...result },
    };
  },
};
