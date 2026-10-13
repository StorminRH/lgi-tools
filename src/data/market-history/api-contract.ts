import { z } from 'zod';
import { int4IdSchema } from '@/lib/id-schemas';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import { ON_DEMAND_HISTORY_MAX_TYPE_IDS } from './constants';
import type { MarketHistoryInputs } from './types';

export const refreshHistoryRequestSchema = z.object({
  typeIds: z
    .array(int4IdSchema)
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
