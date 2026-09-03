import type { CronRefreshPricesResponse } from '@/data/market-prices/api-contract';
import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import { refreshPricesDeclaration } from './declaration';

/**
 * Worst observed sweep is ~37s (a full stale set: ESI batches + Fuzzwork
 * fallback); 120 gives that headroom while still bounding a hang at well
 * under the 300s platform default.
 */
export const maxDuration = 120;

// authz: cron
// input: none
export const GET = defineCronRoute<CronRefreshPricesResponse>(
  refreshPricesDeclaration,
);
