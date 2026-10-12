import { marketRefreshRoute } from '@/app/api/market-refresh-route';
import {
  refreshPricesEndpoint,
} from '@/data/market-prices/api-contract';
import { ON_DEMAND_REFRESH_LIMIT_PER_MINUTE } from '@/data/market-prices/constants';
import { getLivePrices } from '@/data/market-prices/refresh-on-view';
import { readPriceSourceHealth } from '@/data/market-prices/source-health';
import { emitCostMetric } from '@/data/telemetry/cost-metrics';
import { apiResponse } from '@/transport/api-response';

/**
 * A page sends every due type id in one request, up to the contract's
 * ON_DEMAND_REFRESH_MAX_TYPE_IDS ceiling, and the server makes one
 * order-book call per type, PER_TYPE_CONCURRENCY in flight, with one Neon
 * read and one batched write. If ESI hangs on every call, each round of
 * PER_TYPE_CONCURRENCY calls waits out OUTBOUND_FETCH_TIMEOUT_MS (10s),
 * so 300s covers roughly 900 due ids, less the Fuzzwork rounds after
 * them; past that the function is cut off, nothing is written, and the
 * next view asks again. No page comes near it: the largest blueprint tree
 * prices about 170 types (six rounds), and the ceiling is a safety limit
 * well above any page. The per-client limit counts type ids a minute, not
 * requests.
 */
export const maxDuration = 300;

// authz: public
export const POST = marketRefreshRoute(
  'market.refresh-market-prices',
  refreshPricesEndpoint,
  { name: 'market-prices-refresh', perMinute: ON_DEMAND_REFRESH_LIMIT_PER_MINUTE, unit: 'type-ids' },
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
    const health = readPriceSourceHealth(degraded);
    if (health.degraded) {
      emitCostMetric('price_source_degraded', { caller: 'on-demand', ...health.counts });
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
          // A row with no expiry is due at once, as the ingest stamps one that got none.
          staleAfter: (row.staleAfter ?? row.updatedAt).toISOString(),
          source: row.source,
        })),
    });
  },
);
