import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import { UPWELL_RIG_SLOTS } from '@/data/eve-data/structures';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
import { int4IdSchema, positiveIdSchema } from '@/lib/id-schemas';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';
import type { CorpStructurePageStructure, CorpStructurePageView, CorpStructuresPageResult } from './types';

const corpStructurePageStructureSchema = z.object({
  structureId: z.number(),
  typeId: z.number(),
  systemId: z.number(),
  securityClass: z.enum(SECURITY_CLASSES),
  name: z.string().nullable(),
  rigTypeIds: z.array(z.number()),
  taxPct: z.number().nullable(),
}) satisfies z.ZodType<CorpStructurePageStructure>;

const corpStructurePageViewSchema = z.object({
  corporationId: z.number(),
  corporationName: z.string(),
  structureAccess: z.enum(['none', 'use', 'manage']),
  canManageSharing: z.boolean(),
  sharing: z.enum(['on', 'off']),
  structures: z.array(corpStructurePageStructureSchema),
  lastRefreshedAt: z.number().nullable(),
}) satisfies z.ZodType<CorpStructurePageView>;

const corpStructuresResponseSchema = z.object({
  corporations: z.array(corpStructurePageViewSchema),
  refreshing: z.boolean(),
}) satisfies z.ZodType<CorpStructuresPageResult>;

/** The structures drawer's and the corporation settings page's live read: what their server render was given, checked back for newer data. */
export const corpStructuresEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/corp-structures',
  request: null,
  responses: {
    200: jsonBody(corpStructuresResponseSchema),
  },
});

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
