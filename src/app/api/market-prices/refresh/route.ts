import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  ON_DEMAND_REFRESH_LIMIT_PER_MINUTE,
  ON_DEMAND_REFRESH_MAX_TYPE_IDS,
} from "@/data/market-prices/constants";
import { refreshPrices } from "@/data/market-prices/ingest";
import { marketPrices } from "@/data/market-prices/schema";
import { logUsageEvent } from "@/data/telemetry/queries";
import { clientIdentifier, rateLimit } from "@/lib/rate-limit";
import { inArray } from "drizzle-orm";

// Postgres 32-bit `integer` ceiling. Matches the equivalent guard in
// /api/sites/[id]/route.ts — defined locally on each route because both
// owners cap at the column type, not at a shared platform-wide constant.
const PG_INT4_MAX = 2_147_483_647;

const refreshSchema = z.object({
  typeIds: z
    .array(z.number().int().positive().max(PG_INT4_MAX))
    .min(1)
    .max(ON_DEMAND_REFRESH_MAX_TYPE_IDS),
});

// POST /api/market-prices/refresh
// Body: { typeIds: number[] }
//
// On-demand refresh trigger. Consumed by 3.0.5's Industry Planner client
// when a user opens a blueprint and one or more of its flattened-material
// rows are stale. Does NOT acquire the bulk-refresh advisory lock — that
// path is reserved for the cron's whole-set refresh; per-blueprint sets
// are small (≤ ON_DEMAND_REFRESH_MAX_TYPE_IDS) and the upsert tolerates
// concurrent writers.
//
// Rate-limited per client IP. The threshold lives in
// src/data/market-prices/constants.ts so post-ship tuning is one config
// change, not a code edit.
// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: "market-prices-refresh",
    perMinute: ON_DEMAND_REFRESH_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited", retryAfter: limit.retryAfter },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfter) },
      },
    );
  }

  const typeIds = Array.from(new Set(parsed.data.typeIds));
  const summary = await refreshPrices(db, typeIds);

  if (summary.fuzzworkFallbackCount > 0 || summary.budgetExhausted) {
    // O-1 + S-2: surface ESI degradation on the public path via telemetry. A
    // spike of these with caller:'on-demand' is how the deferred amplification
    // concern would show. Fire-and-forget (no added latency); no Discord alert
    // from this public surface so it can't be driven to post to Discord.
    void logUsageEvent({
      action: "price_source_degraded",
      metadata: {
        caller: "on-demand",
        fetched: summary.fetched,
        esiCount: summary.esiCount,
        fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
        budgetExhausted: summary.budgetExhausted,
      },
    }).catch((err) =>
      console.error("[market-prices/refresh] telemetry write failed", err),
    );
  }

  const rows = await db
    .select()
    .from(marketPrices)
    .where(inArray(marketPrices.typeId, typeIds));

  return Response.json({
    summary,
    prices: rows.map((row) => ({
      typeId: row.typeId,
      bestBuy: row.bestBuy,
      bestSell: row.bestSell,
      pct5Buy: row.pct5Buy,
      pct5Sell: row.pct5Sell,
      buyVolume: row.buyVolume?.toString() ?? null,
      sellVolume: row.sellVolume?.toString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      staleAfter: row.staleAfter.toISOString(),
      source: row.source,
    })),
  });
}
