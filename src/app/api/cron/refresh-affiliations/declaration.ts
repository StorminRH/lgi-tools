import type { CronRefreshAffiliationsResponse } from '@/features/auth/api-contract';
import {
  ADVISORY_LOCK_AFFILIATION_REFRESH,
  refreshAffiliations,
} from '@/features/auth/affiliation';
import { listStaleLinkedCharacterIds } from '@/features/auth/affiliation-store';
import type { CronRouteDeclaration } from '@/db/cron-gate';

/**
 * Declares the nightly stale-affiliation backstop as a lock-guarded batch job;
 * daily cadence intentionally records busy, empty, and refreshed runs.
 */
export const refreshAffiliationsDeclaration: CronRouteDeclaration<CronRefreshAffiliationsResponse> = {
  name: 'cron:affiliations',
  action: 'cron_affiliations',
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
    // The lock stays on the shell's reserved connection; enumeration, ESI, and
    // upserts use their owning clients without holding a transaction open.
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
