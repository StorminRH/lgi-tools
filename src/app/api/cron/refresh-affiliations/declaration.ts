import type { CronRefreshAffiliationsResponse } from '@/platform/auth/api-contract';
import { refreshAffiliations } from '@/platform/auth/affiliation';
import { listStaleLinkedCharacterIds } from '@/platform/auth/affiliation-store';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { reconcileAffiliationAccess } from '@/composition/map-affiliation-access';

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
    mode: 'none',
    justification: 'Atomic affiliation writes, pending generations, and Convex revisions tolerate overlap without holding a database connection across network calls.',
  },
  work: async () => {
    const staleIds = await listStaleLinkedCharacterIds();
    const refreshed = await refreshAffiliations(staleIds);
    // Drain even if nothing refreshed: failed delivery must not consume its only retry signal.
    const access = await reconcileAffiliationAccess();

    return {
      outcome: 'refreshed',
      workDone: staleIds.length > 0 || access.processed > 0,
      telemetry: {
        stale: staleIds.length,
        refreshed,
        access,
      },
      body: {
        status: 'refreshed',
        stale: staleIds.length,
        refreshed,
      },
    };
  },
};
