import type { NextRequest } from "next/server";
import {
  refreshPricesEndpoint,
} from "@/data/market-prices/api-contract";
import { ON_DEMAND_REFRESH_LIMIT_PER_MINUTE } from "@/data/market-prices/constants";
import { getLivePrices } from "@/data/market-prices/refresh-on-view";
import { emitCostMetric } from "@/data/telemetry/cost-metrics";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiResponse } from "@/transport/api-response";
import { readJsonBody } from "@/transport/route-body";

// POST /api/market-prices/refresh
// Body: { typeIds: number[] }
//
// On-demand live-price read. Consumed by the Industry Planner client when a
// user opens a blueprint and one or more of its rows are stale. Runs the
// refresh-on-view engine: read the DB seed, fetch live (coalesced across
// concurrent viewers of the same item via the short-term shared cache), return
// the freshest value, and persist the fresh rows back as the new seed behind
// the response. Does NOT acquire the bulk-refresh advisory lock — that path is
// the cron's whole-set refresh.
//
// Rate-limited per client IP. The threshold lives in
// src/data/market-prices/constants.ts so post-ship tuning is one config
// change, not a code edit.
// authz: public

/**
 * Worst honest case: 50 typeIds at per-type ESI concurrency 10 → up to 5
 * sequential rounds of 10s-timeout fetches plus the Fuzzwork fallback
 * (observed peak 38.8s). 60 covers that while bounding a hang at well under
 * the 300s platform default.
 */
export const maxDuration = 60;

/**
 * Handles POST requests for /api/market-prices/refresh; this route owns its authorization,
 * boundary validation, and typed response mapping.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, refreshPricesEndpoint.request);
  if (!parsed.ok) return apiResponse(refreshPricesEndpoint, 400, parsed.failure);

  const limit = await checkRateLimit(request, {
    name: "market-prices-refresh",
    perMinute: ON_DEMAND_REFRESH_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) return apiResponse(refreshPricesEndpoint, 429, limit.failure);

  const typeIds = Array.from(new Set(parsed.data.typeIds));
  const startedAt = Date.now();
  const { prices, degraded, metrics } = await getLivePrices(typeIds, (result) => {
    emitCostMetric("market_price_write_behind", { ...result });
  });

  emitCostMetric("market_price_refresh", {
    ...metrics,
    budgetExhausted: degraded.budgetExhausted,
    durationMs: Date.now() - startedAt,
  });

  if (degraded.fuzzworkFallbackCount > 0 || degraded.budgetExhausted) {
    // O-1 + S-2: surface ESI degradation on the public path via telemetry. A
    // spike of these with caller:'on-demand' is how the deferred amplification
    // concern would show. Lifecycle-safe after-response write; no Discord alert
    // from this public surface so it can't be driven to post to Discord.
    emitCostMetric("price_source_degraded", {
      caller: "on-demand",
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
}
