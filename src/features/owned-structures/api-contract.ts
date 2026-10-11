import { z } from 'zod';
import { UPWELL_RIG_SLOTS } from '@/data/eve-data/structures';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
import { int4IdSchema, positiveIdSchema } from '@/lib/id-schemas';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';

export const setCorpStructureRigsRequestSchema = z.object({
  corporationId: positiveIdSchema,
  structureId: positiveIdSchema,
  rigTypeIds: z.array(int4IdSchema).max(UPWELL_RIG_SLOTS),
  taxPct: z.number().min(0).max(MAX_FACILITY_TAX_PCT).nullable().optional(),
});
const corpStructureRigsResponseSchema = z.object({
  structureId: z.number(),
  rigTypeIds: z.array(z.number()),
  taxPct: z.number().nullable(),
});
export const setCorpStructureRigsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/corp-structures/rigs',
  request: setCorpStructureRigsRequestSchema,
  responses: {
    200: jsonBody(corpStructureRigsResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'invalid_structure'),
    401: problem('unauthenticated'),
    403: problem('not_corp_member', 'not_station_manager', 'cross_origin'),
  },
});
