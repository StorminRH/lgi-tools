import { z } from 'zod';
import { enteredBonusesSchema } from '@/data/industry-math/entered-bonuses';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
import { int4IdSchema, positiveIdSchema } from '@/lib/id-schemas';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';
import type { ParsedStructureFit } from './structure-fit-parse';
import type { CustomStructureRow } from './types';

export const MAX_CUSTOM_STRUCTURE_NAME_LEN = 80;
export const MAX_CUSTOM_STRUCTURE_RIGS = 3;
export const MAX_CUSTOM_STRUCTURES_PER_USER = 50;
const MAX_STRUCTURE_FIT_LEN = 8000;

const facilityTaxPct = z.number().min(0).max(MAX_FACILITY_TAX_PCT);

const customStructureRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  structureTypeId: z.number(),
  rigTypeIds: z.array(z.number()),
  systemId: z.number().nullable(),
  taxPct: z.number().nullable(),
  bonuses: enteredBonusesSchema.nullable(),
}) satisfies z.ZodType<CustomStructureRow>;

const customStructuresResponseSchema = z.object({
  structures: z.array(customStructureRowSchema),
});
const customStructureFields = {
  name: z.string().trim().min(1).max(MAX_CUSTOM_STRUCTURE_NAME_LEN),
  structureTypeId: int4IdSchema,
  rigTypeIds: z.array(int4IdSchema).max(MAX_CUSTOM_STRUCTURE_RIGS),
  systemId: int4IdSchema.nullable().default(null),
  taxPct: facilityTaxPct.nullable().default(null),
  bonuses: enteredBonusesSchema.nullable().default(null),
};

/** Entered bonuses are the whole answer: a row with them carries no rigs. */
function enteredBonusesExcludeRigs(
  body: { rigTypeIds: number[]; bonuses: unknown },
  ctx: z.RefinementCtx,
): void {
  if (body.bonuses !== null && body.rigTypeIds.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['rigTypeIds'], message: 'entered bonuses carry no rigs' });
  }
}

export const createCustomStructureRequestSchema = z
  .object(customStructureFields)
  .superRefine(enteredBonusesExcludeRigs);
export const createCustomStructureEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/custom-structures',
  request: createCustomStructureRequestSchema,
  responses: {
    201: jsonBody(customStructuresResponseSchema.extend({ createdId: z.string().uuid() })),
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

export const updateCustomStructureRequestSchema = z
  .object({ id: z.string().min(1).max(100), ...customStructureFields })
  .superRefine(enteredBonusesExcludeRigs);
export const updateCustomStructureEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/custom-structures/update',
  request: updateCustomStructureRequestSchema,
  responses: {
    200: jsonBody(customStructuresResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'invalid_structure', 'unknown_system'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});

export const parseStructureFitRequestSchema = z.object({
  fit: z.string().min(1).max(MAX_STRUCTURE_FIT_LEN),
});
const parseStructureFitResponseSchema = z.object({
  parsed: z
    .object({ structureTypeId: z.number(), name: z.string().nullable(), rigTypeIds: z.array(z.number()) })
    .nullable(),
}) satisfies z.ZodType<{ parsed: ParsedStructureFit | null }>;
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

export const MIN_STRUCTURE_SEARCH_LENGTH = 3;

export const searchStructuresRequestSchema = z.strictObject({
  search: z.string().trim().min(MIN_STRUCTURE_SEARCH_LENGTH).max(MAX_CUSTOM_STRUCTURE_NAME_LEN),
});

const structureSearchResultSchema = z.strictObject({
  structureId: positiveIdSchema,
  name: z.string().min(1),
  systemId: int4IdSchema,
  structureTypeId: int4IdSchema.nullable(),
});

const searchStructuresResponseSchema = z.strictObject({
  results: z.array(structureSearchResultSchema),
});

export type StructureSearchResult = z.infer<typeof structureSearchResultSchema>;

export const searchStructuresEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/custom-structures/search',
  request: searchStructuresRequestSchema,
  responses: {
    200: jsonBody(searchStructuresResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    503: problem('structure_search_unavailable'),
  },
});
