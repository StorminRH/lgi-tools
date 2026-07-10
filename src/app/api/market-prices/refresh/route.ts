import type { NextRequest } from "next/server";
import {
  refreshPricesRequestSchema,
  type RefreshPricesBadRequest,
  type RefreshPricesResponse,
} from "@/data/market-prices/api-contract";
import { ON_DEMAND_REFRESH_LIMIT_PER_MINUTE } from "@/data/market-prices/constants";
import { getLivePrices } from "@/data/market-prices/refresh-on-view";
import { logUsageEvent } from "@/data/telemetry/queries";
import { rateLimitGuard } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/route-body";

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

// Worst honest case: 50 typeIds at per-type ESI concurrency 10 → up to 5
// sequential rounds of 10s-timeout fetches plus the Fuzzwork fallback
// (observed peak 38.8s). 60 covers that while bounding a hang at well under
// the 300s platform default.
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseJsonBody(request, refreshPricesRequestSchema, {
    invalidJson: () =>
      Response.json({ error: "invalid_json" } satisfies RefreshPricesBadRequest, { status: 400 }),
    invalidBody: (error) =>
      Response.json(
        { error: "invalid_request", issues: error.issues } satisfies RefreshPricesBadRequest,
        { status: 400 },
      ),
  });
  if (!parsed.ok) return parsed.response;

  const limit = await rateLimitGuard(request, {
    name: "market-prices-refresh",
    perMinute: ON_DEMAND_REFRESH_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) return limit.response;

  const typeIds = Array.from(new Set(parsed.data.typeIds));
  const { prices, degraded } = await getLivePrices(typeIds);

  if (degraded.fuzzworkFallbackCount > 0 || degraded.budgetExhausted) {
    // O-1 + S-2: surface ESI degradation on the public path via telemetry. A
    // spike of these with caller:'on-demand' is how the deferred amplification
    // concern would show. Fire-and-forget (no added latency); no Discord alert
    // from this public surface so it can't be driven to post to Discord.
    void logUsageEvent({
      action: "price_source_degraded",
      metadata: {
        caller: "on-demand",
        fetched: degraded.fetched,
        esiCount: degraded.esiCount,
        fuzzworkFallbackCount: degraded.fuzzworkFallbackCount,
        budgetExhausted: degraded.budgetExhausted,
      },
    }).catch((err) =>
      console.error("[market-prices/refresh] telemetry write failed", err),
    );
  }

  return Response.json({
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
  } satisfies RefreshPricesResponse);
}
