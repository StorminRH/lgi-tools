import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
import { int4IdSchema, positiveIdSchema } from '@/lib/id-schemas';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';

const corpStructureRowSchema = z.object({
  structureId: z.number(),
  typeId: z.number(),
  systemId: z.number(),
  securityClass: z.enum(SECURITY_CLASSES),
  name: z.string().nullable(),
});

const viewerCorpStructuresSchema = z.object({
  corporationId: z.number(),
  structures: z.array(corpStructureRowSchema),
  lastRefreshedAt: z.number().nullable(),
});

const corpStructuresResponseSchema = z.object({
  corporations: z.array(viewerCorpStructuresSchema),
});

export const corpStructuresEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/corp-structures',
  request: null,
  responses: {
    200: jsonBody(corpStructuresResponseSchema),
  },
});

export const MAX_CORP_STRUCTURE_RIGS = 3;
export const setCorpStructureRigsRequestSchema = z.object({
  corporationId: positiveIdSchema,
  structureId: positiveIdSchema,
  rigTypeIds: z.array(int4IdSchema).max(MAX_CORP_STRUCTURE_RIGS),
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
