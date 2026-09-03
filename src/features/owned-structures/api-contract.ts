import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
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

export const setCorpStructureSharingRequestSchema = z.object({
  corporationId: z.number().int().positive(),
  enabled: z.boolean(),
});

const corpStructureSharingResponseSchema = z.object({
  corporationId: z.number(),
  enabled: z.boolean(),
});

export const setCorpStructureSharingEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/corp-structures/sharing',
  request: setCorpStructureSharingRequestSchema,
  responses: {
    200: jsonBody(corpStructureSharingResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('not_corp_member', 'not_station_manager', 'cross_origin'),
  },
});

const PG_INT4_MAX = 2_147_483_647;

export const MAX_CORP_STRUCTURE_RIGS = 3;

export const setCorpStructureRigsRequestSchema = z.object({
  corporationId: z.number().int().positive(),
  structureId: z.number().int().positive(),
  rigTypeIds: z.array(z.number().int().positive().max(PG_INT4_MAX)).max(MAX_CORP_STRUCTURE_RIGS),

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
