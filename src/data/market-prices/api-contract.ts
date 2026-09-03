import { z } from 'zod';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from './constants';
import type { DepthBand, PriceSource, RegionalDiscount } from './types';

const PG_INT4_MAX = 2_147_483_647;

export const refreshPricesRequestSchema = z.object({
  typeIds: z
    .array(z.number().int().positive().max(PG_INT4_MAX))
    .min(1)
    .max(ON_DEMAND_REFRESH_MAX_TYPE_IDS),
});

const wireDepthBandSchema = z.object({
  pct: z.number(),
  cumVolume: z.number(),
}) satisfies z.ZodType<DepthBand>;

const wireRegionalDiscountSchema = z.object({
  systemId: z.number(),
  price: z.number(),
  units: z.number(),
  pct: z.number(),
}) satisfies z.ZodType<RegionalDiscount>;

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

  regionalDiscount: wireRegionalDiscountSchema.nullable().optional(),
  updatedAt: z.string(),
  staleAfter: z.string(),
  source: z.enum(['esi', 'fuzzwork-fallback', 'fuzzwork']) satisfies z.ZodType<PriceSource>,
});

const refreshPricesResponseSchema = z.object({ prices: z.array(wirePriceSchema) });

export const refreshPricesEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/market-prices/refresh',
  request: refreshPricesRequestSchema,
  responses: {
    200: jsonBody(refreshPricesResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    429: problem('rate_limited'),
  },
});

export type CronRefreshPricesResponse =
  | { cached: true; lastUpdatedAt: string | null }
  | { cached: false; lastUpdatedAt: string; fetched: number; written: number };
