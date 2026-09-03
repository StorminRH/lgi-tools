import { z } from 'zod';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import { ON_DEMAND_HISTORY_MAX_TYPE_IDS } from './constants';
import type { MarketHistoryInputs } from './types';

const PG_INT4_MAX = 2_147_483_647;

export const refreshHistoryRequestSchema = z.object({
  typeIds: z
    .array(z.number().int().positive().max(PG_INT4_MAX))
    .min(1)
    .max(ON_DEMAND_HISTORY_MAX_TYPE_IDS),
});

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

const refreshHistoryResponseSchema = z.object({
  inputs: z.array(wireHistoryInputsSchema),
});
export const refreshHistoryEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/market-history/refresh',
  request: refreshHistoryRequestSchema,
  responses: {
    200: jsonBody(refreshHistoryResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    429: problem('rate_limited'),
  },
});
