import { marketRefreshRoute } from '@/app/api/market-refresh-route';
import {
  refreshPricesEndpoint,
} from '@/data/market-prices/api-contract';
import { ON_DEMAND_REFRESH_LIMIT_PER_MINUTE } from '@/data/market-prices/constants';
import { getLivePrices } from '@/data/market-prices/refresh-on-view';
import { emitCostMetric } from '@/data/telemetry/cost-metrics';
import { apiResponse } from '@/transport/api-response';

/**
 * Worst honest case: 50 typeIds at per-type ESI concurrency 10 → up to 5
 * sequential rounds of 10s-timeout fetches plus the Fuzzwork fallback
 * (observed peak 38.8s). 60 covers that while bounding a hang at well under
 * the 300s platform default.
 */
export const maxDuration = 60;

export const POST = marketRefreshRoute(
  'market.refresh-market-prices',
  refreshPricesEndpoint,
  { name: 'market-prices-refresh', perMinute: ON_DEMAND_REFRESH_LIMIT_PER_MINUTE },
  (typeIds) =>
    getLivePrices(typeIds, (result) => {
      emitCostMetric('market_price_write_behind', { ...result });
    }),
  ({ typeIds, loaded, durationMs }) => {
    const { prices, degraded, metrics } = loaded;
    emitCostMetric('market_price_refresh', {
      ...metrics,
      budgetExhausted: degraded.budgetExhausted,
      durationMs,
    });
    if (degraded.fuzzworkFallbackCount > 0 || degraded.budgetExhausted) {
      emitCostMetric('price_source_degraded', {
        caller: 'on-demand',
        fetched: degraded.fetched,
        esiCount: degraded.esiCount,
        fuzzworkFallbackCount: degraded.fuzzworkFallbackCount,
        budgetExhausted: degraded.budgetExhausted,
      });
    }
    return apiResponse(refreshPricesEndpoint, 200, {
      prices: typeIds
        .map((typeId) => prices.get(typeId))
        .filter((row): row is NonNullable<typeof row> => row !== undefined)
        .map((row) => ({
          typeId: row.typeId,
          bestBuy: row.bestBuy,
          bestSell: row.bestSell,
          pct5Buy: row.pct5Buy,
          pct5Sell: row.pct5Sell,
          buyVolume: row.buyVolume?.toString() ?? null,
          sellVolume: row.sellVolume?.toString() ?? null,
          buyDepth: row.buyDepth,
          sellDepth: row.sellDepth,
          regionalDiscount: row.regionalDiscount,
          updatedAt: row.updatedAt.toISOString(),
          staleAfter: row.staleAfter.toISOString(),
          source: row.source,
        })),
    });
  },
);
