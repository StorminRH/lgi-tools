import type { CronRefreshIndustryIndicesResponse } from '@/data/industry-indices/api-contract';
import { refreshIndustryIndices } from '@/data/industry-indices/ingest';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { ADVISORY_LOCKS } from '@/db/advisory-lock';

export const refreshIndustryIndicesDeclaration: CronRouteDeclaration<CronRefreshIndustryIndicesResponse> = {
  name: 'cron:industry-indices',
  action: 'cron_industry_indices',
  capability: 'cron.refresh-industry-indices',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'daily batch wakes Neon by design and preserves partial dataset history',
  },
  lock: {
    key: ADVISORY_LOCKS.industryIndices,
    busyBody: () => ({ status: 'busy' }),
  },
  work: async ({ database }) => {
    const summary = await refreshIndustryIndices(database);

    return {
      outcome: 'refreshed',
      workDone:
        summary.costIndices.written > 0
        || summary.adjustedPrices.written > 0,
      telemetry: {
        costIndices: summary.costIndices,
        adjustedPrices: summary.adjustedPrices,
      },
      body: {
        status: 'refreshed',
        costIndices: {
          ok: summary.costIndices.ok,
          written: summary.costIndices.written,
        },
        adjustedPrices: {
          ok: summary.adjustedPrices.ok,
          written: summary.adjustedPrices.written,
        },
      },
    };
  },
};
