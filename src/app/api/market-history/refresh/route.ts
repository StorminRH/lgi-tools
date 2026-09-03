import { marketRefreshRoute } from '@/app/api/market-refresh-route';
import {
  refreshHistoryEndpoint,
} from '@/data/market-history/api-contract';
import { ON_DEMAND_HISTORY_LIMIT_PER_MINUTE } from '@/data/market-history/constants';
import { getLiveHistory } from '@/data/market-history/refresh-on-view';
import { emitCostMetric } from '@/data/telemetry/cost-metrics';
import { apiResponse } from '@/transport/api-response';

/**
 * History is one ESI call per stale type at concurrency 10; the on-view trigger
 * asks for a single product type. 60 bounds a hang well under the 300s default.
 */
export const maxDuration = 60;

// authz: public
export const POST = marketRefreshRoute(
  'market.refresh-market-history',
  refreshHistoryEndpoint,
  { name: 'market-history-refresh', perMinute: ON_DEMAND_HISTORY_LIMIT_PER_MINUTE },
  (typeIds) =>
    getLiveHistory(typeIds, (result) => {
      emitCostMetric('market_history_write_behind', { ...result });
    }),
  ({ typeIds, loaded, durationMs }) => {
    const { inputs, degraded, metrics } = loaded;
    emitCostMetric('market_history_refresh', {
      ...metrics,
      budgetExhausted: degraded.budgetExhausted,
      durationMs,
    });
    if (degraded.budgetExhausted) {
      console.warn(
        JSON.stringify({
          scope: 'market-history/refresh',
          budgetExhausted: true,
          fetched: degraded.fetched,
        }),
      );
    }
    return apiResponse(refreshHistoryEndpoint, 200, {
      inputs: typeIds
        .map((typeId) => inputs.get(typeId))
        .filter((row): row is NonNullable<typeof row> => row !== undefined),
    });
  },
);
