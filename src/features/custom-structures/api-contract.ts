import { z } from 'zod';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';
import type { CustomStructureRow } from './types';

const PG_INT4_MAX = 2_147_483_647;

export const MAX_CUSTOM_STRUCTURE_NAME_LEN = 80;

export const MAX_CUSTOM_STRUCTURE_RIGS = 3;

export const MAX_CUSTOM_STRUCTURES_PER_USER = 50;

const MAX_STRUCTURE_FIT_LEN = 8000;

const typeId = z.number().int().positive().max(PG_INT4_MAX);

const facilityTaxPct = z.number().min(0).max(MAX_FACILITY_TAX_PCT);

const customStructureRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  structureTypeId: z.number(),
  rigTypeIds: z.array(z.number()),
  systemId: z.number().nullable(),
  taxPct: z.number().nullable(),
}) satisfies z.ZodType<CustomStructureRow>;

const customStructuresResponseSchema = z.object({
  structures: z.array(customStructureRowSchema),
});

export const createCustomStructureRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_CUSTOM_STRUCTURE_NAME_LEN),
  structureTypeId: typeId,
  rigTypeIds: z.array(typeId).max(MAX_CUSTOM_STRUCTURE_RIGS),

  systemId: typeId.nullable().default(null),

  taxPct: facilityTaxPct.nullable().default(null),
});

export const createCustomStructureEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/custom-structures',
  request: createCustomStructureRequestSchema,
  responses: {
    201: jsonBody(customStructuresResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'invalid_structure', 'unknown_system'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    409: problem('structure_limit'),
  },
});

export const deleteCustomStructureRequestSchema = z.object({
  id: z.string().min(1).max(100),
});

export const deleteCustomStructureEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/custom-structures/delete',
  request: deleteCustomStructureRequestSchema,
  responses: {
    200: jsonBody(customStructuresResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});

export const setCustomStructurePinRequestSchema = z.object({
  id: z.string().min(1).max(100),
  systemId: typeId.nullable(),
});

export const setCustomStructurePinEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/custom-structures/set-pin',
  request: setCustomStructurePinRequestSchema,
  responses: {
    200: jsonBody(customStructuresResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'unknown_system'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});

export const setCustomStructureTaxRequestSchema = z.object({
  id: z.string().min(1).max(100),
  taxPct: facilityTaxPct.nullable(),
});

export const setCustomStructureTaxEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/custom-structures/set-tax',
  request: setCustomStructureTaxRequestSchema,
  responses: {
    200: jsonBody(customStructuresResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});

export const parseStructureFitRequestSchema = z.object({
  fit: z.string().min(1).max(MAX_STRUCTURE_FIT_LEN),
});

const parseStructureFitResponseSchema = z.object({
  parsed: z
    .object({ structureTypeId: z.number(), rigTypeIds: z.array(z.number()) })
    .nullable(),
});

export const parseStructureFitEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/custom-structures/parse-fit',
  request: parseStructureFitRequestSchema,
  responses: {
    200: jsonBody(parseStructureFitResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
  },
});
