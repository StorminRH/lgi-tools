// API wire contract owned by the market-history slice (3.4.T pattern).
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import { ON_DEMAND_HISTORY_MAX_TYPE_IDS } from './constants';
import type { MarketHistoryInputs } from './types';

// Postgres 32-bit `integer` ceiling — type IDs cap at the column type.
const PG_INT4_MAX = 2_147_483_647;

// ── POST /api/market-history/refresh ─────────────────────────────────────

/**
 * Boundary validator for refresh history request schema; successful parsing yields the normalized
 * market history input consumed internally.
 */
export const refreshHistoryRequestSchema = z.object({
  typeIds: z
    .array(z.number().int().positive().max(PG_INT4_MAX))
    .min(1)
    .max(ON_DEMAND_HISTORY_MAX_TYPE_IDS),
});

/**
 * The typed scoring inputs as they cross the wire. Every field is already a
 * plain number/string (the bigint volume is aggregated away into ADV), so the
 * shape equals MarketHistoryInputs directly. The `satisfies` pin keeps them in
 * lockstep; the contract test asserts it.
 */
export const wireHistoryInputsSchema = z.object({
  typeId: z.number(),
  averageDailyVolume: z.array(
    z.object({ days: z.number(), adv: z.number().nullable() }),
  ),
  volumeCv: z.number().nullable(),
  priceVolatility: z.number().nullable(),
  daysCovered: z.number(),
  latestDate: z.string().nullable(),
}) satisfies z.ZodType<MarketHistoryInputs>;

/**
 * Boundary validator for refresh history response schema; successful parsing yields the normalized
 * market history input consumed internally.
 */
export const refreshHistoryResponseSchema = z.object({
  inputs: z.array(wireHistoryInputsSchema),
});
/** Typed market-history refresh result with source, freshness, and write-behind state. */
export type RefreshHistoryResponse = z.infer<typeof refreshHistoryResponseSchema>;

/** 400 arms; 429 is the shared RateLimitedBody (src/lib/rate-limit.ts). */
export type RefreshHistoryBadRequest =
  | { error: 'invalid_json' }
  | { error: 'invalid_request'; issues: unknown[] };

/**
 * Typed endpoint definition for refresh history endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const refreshHistoryEndpoint: ApiEndpoint<
  z.input<typeof refreshHistoryRequestSchema>,
  RefreshHistoryResponse
> = {
  method: 'POST',
  path: '/api/market-history/refresh',
  request: refreshHistoryRequestSchema,
  response: refreshHistoryResponseSchema,
};
