// API wire contracts owned by the market-prices slice (3.4.T).
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from './constants';
import type { DepthBand, PriceSource, RegionalDiscount } from './types';

// Postgres 32-bit `integer` ceiling. Matches the equivalent guard in
// /api/sites/[id] — defined locally on each owner because both cap at the
// column type, not at a shared platform-wide constant.
const PG_INT4_MAX = 2_147_483_647;

// ── POST /api/market-prices/refresh ─────────────────────────────────────

/**
 * Boundary validator for refresh prices request schema; successful parsing yields the normalized
 * market prices input consumed internally.
 */
export const refreshPricesRequestSchema = z.object({
  typeIds: z
    .array(z.number().int().positive().max(PG_INT4_MAX))
    .min(1)
    .max(ON_DEMAND_REFRESH_MAX_TYPE_IDS),
});

/**
 * One near-touch depth rung on the wire. cumVolume rides as a number (stays
 * under MAX_SAFE_INTEGER for realistic volumes), unlike the bigint side totals.
 */
export const wireDepthBandSchema = z.object({
  pct: z.number(),
  cumVolume: z.number(),
}) satisfies z.ZodType<DepthBand>;

/** The regional-discount callout payload — plain numbers end to end. */
export const wireRegionalDiscountSchema = z.object({
  systemId: z.number(),
  price: z.number(),
  units: z.number(),
  pct: z.number(),
}) satisfies z.ZodType<RegionalDiscount>;

/**
 * One priced row as it crosses the wire: DB bigint volumes serialized as
 * strings, timestamps as ISO-8601 strings. The `satisfies` pin keeps the
 * enum inside PriceSource; the contract test pins exact equality.
 */
export const wirePriceSchema = z.object({
  typeId: z.number(),
  bestBuy: z.number().nullable(),
  bestSell: z.number().nullable(),
  pct5Buy: z.number().nullable(),
  pct5Sell: z.number().nullable(),
  buyVolume: z.string().nullable(),
  sellVolume: z.string().nullable(),
  buyDepth: z.array(wireDepthBandSchema).nullable(),
  sellDepth: z.array(wireDepthBandSchema).nullable(),
  // `.optional()` on top of `.nullable()` is deliberate (the #203 lesson):
  // a payload cached before this field existed must still validate — its
  // absence reads as "no callout", never a contract failure.
  regionalDiscount: wireRegionalDiscountSchema.nullable().optional(),
  updatedAt: z.string(),
  staleAfter: z.string(),
  source: z.enum(['esi', 'fuzzwork-fallback', 'fuzzwork']) satisfies z.ZodType<PriceSource>,
});

/**
 * Boundary validator for refresh prices response schema; successful parsing yields the normalized
 * market prices input consumed internally.
 */
export const refreshPricesResponseSchema = z.object({ prices: z.array(wirePriceSchema) });
/** Typed market-price refresh result with source counts, freshness, and write-behind state. */
export type RefreshPricesResponse = z.infer<typeof refreshPricesResponseSchema>;

/** 400 arms; 429 is the shared RateLimitedBody (src/lib/rate-limit.ts). */
export type RefreshPricesBadRequest =
  | { error: 'invalid_json' }
  | { error: 'invalid_request'; issues: unknown[] };

/**
 * Typed endpoint definition for refresh prices endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const refreshPricesEndpoint: ApiEndpoint<
  z.input<typeof refreshPricesRequestSchema>,
  RefreshPricesResponse
> = {
  method: 'POST',
  path: '/api/market-prices/refresh',
  request: refreshPricesRequestSchema,
  response: refreshPricesResponseSchema,
};

/**
 * ── GET /api/cron/refresh-prices (authz: cron) ──────────────────────────
 * No programmatic consumer (Vercel cron reads logs only) — types pinned with
 * `satisfies` in the route. `lastUpdatedAt` is an ISO string on the wire.
 */
export type CronRefreshPricesResponse =
  | { cached: true; lastUpdatedAt: string | null }
  | { cached: false; lastUpdatedAt: string; fetched: number; written: number };
