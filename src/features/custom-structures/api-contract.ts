// API wire contract owned by the custom-structures slice (3.7.9). The structure
// builder calls these via apiFetch; each route imports the request schema and
// parses it — a renamed field fails tsc on both sides. apiFetch only speaks
// GET/POST, so delete is a POST sub-route, not an HTTP DELETE.
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import type { CustomStructureRow } from './types';

// Postgres 32-bit `integer` ceiling — structure/rig type ids are int4 columns.
const PG_INT4_MAX = 2_147_483_647;

export const MAX_CUSTOM_STRUCTURE_NAME_LEN = 80;
export const MAX_CUSTOM_STRUCTURE_RIGS = 3; // Upwell structures have at most 3 rig slots
export const MAX_CUSTOM_STRUCTURES_PER_USER = 50;
export const MAX_STRUCTURE_FIT_LEN = 8000; // a generous clipboard ceiling

const typeId = z.number().int().positive().max(PG_INT4_MAX);

// The shared response shape for the mutating endpoints below: the caller's full
// saved-structure list, echoed back so the builder re-renders without a refetch
// (the page provides the initial list server-side, so there is no GET endpoint).
const customStructureRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  structureTypeId: z.number(),
  rigTypeIds: z.array(z.number()),
}) satisfies z.ZodType<CustomStructureRow>;

export const customStructuresResponseSchema = z.object({
  structures: z.array(customStructureRowSchema),
});
export type CustomStructuresResponse = z.infer<typeof customStructuresResponseSchema>;

// ── POST /api/account/custom-structures ──────────────────────────────────
// Save one custom structure. The route is the trust boundary: it confirms the
// type is a real industry structure and every rig fits it (validation.ts), and
// enforces the per-user cap. Echoes back the full updated list so the client
// re-renders without a second GET.
export const createCustomStructureRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_CUSTOM_STRUCTURE_NAME_LEN),
  structureTypeId: typeId,
  rigTypeIds: z.array(typeId).max(MAX_CUSTOM_STRUCTURE_RIGS),
});
export type CreateCustomStructureRequest = z.input<typeof createCustomStructureRequestSchema>;

export const createCustomStructureEndpoint: ApiEndpoint<
  CreateCustomStructureRequest,
  CustomStructuresResponse
> = {
  method: 'POST',
  path: '/api/account/custom-structures',
  request: createCustomStructureRequestSchema,
  response: customStructuresResponseSchema,
};

// ── POST /api/account/custom-structures/delete ───────────────────────────
// Delete one of the caller's own structures (ownership-scoped in the query).
// Echoes back the updated list.
export const deleteCustomStructureRequestSchema = z.object({
  id: z.string().min(1).max(100),
});
export type DeleteCustomStructureRequest = z.input<typeof deleteCustomStructureRequestSchema>;

export const deleteCustomStructureEndpoint: ApiEndpoint<
  DeleteCustomStructureRequest,
  CustomStructuresResponse
> = {
  method: 'POST',
  path: '/api/account/custom-structures/delete',
  request: deleteCustomStructureRequestSchema,
  response: customStructuresResponseSchema,
};

// ── POST /api/account/custom-structures/parse-fit ────────────────────────
// Parse a pasted in-game structure fit into { structureTypeId, rigTypeIds } so
// the builder can pre-fill the picker. `parsed` is null when the clipboard has no
// resolvable structure header. Resolution is bounded to the known industry
// structures + rigs, so unknown lines (services, fighters, defensive rigs) drop.
export const parseStructureFitRequestSchema = z.object({
  fit: z.string().min(1).max(MAX_STRUCTURE_FIT_LEN),
});
export type ParseStructureFitRequest = z.input<typeof parseStructureFitRequestSchema>;

export const parseStructureFitResponseSchema = z.object({
  parsed: z
    .object({ structureTypeId: z.number(), rigTypeIds: z.array(z.number()) })
    .nullable(),
});
export type ParseStructureFitResponse = z.infer<typeof parseStructureFitResponseSchema>;

export const parseStructureFitEndpoint: ApiEndpoint<
  ParseStructureFitRequest,
  ParseStructureFitResponse
> = {
  method: 'POST',
  path: '/api/account/custom-structures/parse-fit',
  request: parseStructureFitRequestSchema,
  response: parseStructureFitResponseSchema,
};
