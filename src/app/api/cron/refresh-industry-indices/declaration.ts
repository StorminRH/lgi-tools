import type { CronRefreshIndustryIndicesResponse } from '@/data/industry-indices/api-contract';
import { refreshIndustryIndices } from '@/data/industry-indices/ingest';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';

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
    mode: 'none',
    justification:
      'no lock on any ESI call: both datasets upsert changed rows only, so an overlap with an on-view refresh is a 304 or the same rows again',
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
