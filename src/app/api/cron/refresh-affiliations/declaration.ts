import type { CronRefreshAffiliationsResponse } from '@/platform/auth/api-contract';
import {
  ADVISORY_LOCK_AFFILIATION_REFRESH,
  refreshAffiliations,
} from '@/platform/auth/affiliation';
import { listStaleLinkedCharacterIds } from '@/platform/auth/affiliation-store';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';

export const refreshAffiliationsDeclaration: CronRouteDeclaration<CronRefreshAffiliationsResponse> = {
  name: 'cron:affiliations',
  action: 'cron_affiliations',
  capability: 'cron.refresh-affiliations',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'daily batch wakes Neon by design and preserves every-run history',
  },
  lock: {
    key: Number(ADVISORY_LOCK_AFFILIATION_REFRESH),
    busyBody: () => ({ status: 'busy' }),
  },
  work: async () => {

    const staleIds = await listStaleLinkedCharacterIds();
    const refreshed = await refreshAffiliations(staleIds);

    return {
      outcome: 'refreshed',
      workDone: staleIds.length > 0,
      telemetry: {
        stale: staleIds.length,
        refreshed,
      },
      body: {
        status: 'refreshed',
        stale: staleIds.length,
        refreshed,
      },
    };
  },
};
