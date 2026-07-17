import { drizzle } from 'drizzle-orm/postgres-js';
import type { CronRefreshIndustryIndicesResponse } from '@/data/industry-indices/api-contract';
import { ADVISORY_LOCK_INDUSTRY_INDICES } from '@/data/industry-indices/constants';
import { refreshIndustryIndices } from '@/data/industry-indices/ingest';
import type { CronRouteDeclaration } from '@/db/cron-gate';

/**
 * Declares the daily cost-index and adjusted-price refresh as one lock-guarded
 * batch; its partial dataset outcomes remain visible in every-run telemetry.
 */
export const refreshIndustryIndicesDeclaration: CronRouteDeclaration<CronRefreshIndustryIndicesResponse> = {
  name: 'cron:industry-indices',
  action: 'cron_industry_indices',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'daily batch wakes Neon by design and preserves partial dataset history',
  },
  lock: {
    key: Number(ADVISORY_LOCK_INDUSTRY_INDICES),
    busyBody: () => ({ status: 'busy' }),
  },
  work: async ({ client }) => {
    // The shell holds the advisory lock on its reserved connection while ESI
    // fetches and chunked upserts use the shared direct pool.
    const summary = await refreshIndustryIndices(drizzle(client));

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
