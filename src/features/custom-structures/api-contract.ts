// API wire contract owned by the custom-structures slice (3.7.9). The structure
// builder calls these via apiFetch; each route imports the request schema and
// parses it — a renamed field fails tsc on both sides. apiFetch only speaks
// GET/POST, so delete is a POST sub-route, not an HTTP DELETE.
import { z } from 'zod';
import { MAX_FACILITY_TAX_PCT } from '@/data/industry-math/fees';
import type { ApiEndpoint } from '@/lib/api-client';
import type { CustomStructureRow } from './types';

// Postgres 32-bit `integer` ceiling — structure/rig type ids are int4 columns.
const PG_INT4_MAX = 2_147_483_647;

/** Maximum custom-structure name length in Unicode code units, shared by validation and the UI. */
export const MAX_CUSTOM_STRUCTURE_NAME_LEN = 80;
/**
 * Inclusive upper bound for custom structure rigs; validation and UI limits share this value.
 */
export const MAX_CUSTOM_STRUCTURE_RIGS = 3; // Upwell structures have at most 3 rig slots
/**
 * Inclusive upper bound for custom structures per user; validation and UI limits share this value.
 */
export const MAX_CUSTOM_STRUCTURES_PER_USER = 50;
/**
 * Boundary validator for max structure fit len; successful parsing yields the normalized custom
 * structures input consumed internally.
 */
export const MAX_STRUCTURE_FIT_LEN = 8000; // a generous clipboard ceiling

const typeId = z.number().int().positive().max(PG_INT4_MAX);

// Facility tax entry: a percent with decimals, bounded by the in-game cap
// (0–10%). The bound lives once, in the fee leaf.
const facilityTaxPct = z.number().min(0).max(MAX_FACILITY_TAX_PCT);

// The shared response shape for the mutating endpoints below: the caller's full
// saved-structure list, echoed back so the builder re-renders without a refetch
// (the page provides the initial list server-side, so there is no GET endpoint).
const customStructureRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  structureTypeId: z.number(),
  rigTypeIds: z.array(z.number()),
  systemId: z.number().nullable(),
  taxPct: z.number().nullable(),
}) satisfies z.ZodType<CustomStructureRow>;

/**
 * Boundary validator for custom structures response schema; successful parsing yields the
 * normalized custom structures input consumed internally.
 */
export const customStructuresResponseSchema = z.object({
  structures: z.array(customStructureRowSchema),
});
/**
 * Validated custom structures owned by the authenticated user, in the server's canonical row
 * shape.
 */
export type CustomStructuresResponse = z.infer<typeof customStructuresResponseSchema>;

/**
 * ── POST /api/account/custom-structures ──────────────────────────────────
 * Save one custom structure. The route is the trust boundary: it confirms the
 * type is a real industry structure and every rig fits it (validation.ts), and
 * enforces the per-user cap. Echoes back the full updated list so the client
 * re-renders without a second GET.
 */
export const createCustomStructureRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAX_CUSTOM_STRUCTURE_NAME_LEN),
  structureTypeId: typeId,
  rigTypeIds: z.array(typeId).max(MAX_CUSTOM_STRUCTURE_RIGS),
  // The optional system pin — null (the default) saves a portable structure.
  // The route confirms a non-null id is a real solar system.
  systemId: typeId.nullable().default(null),
  // The optional facility tax — null (the default) means never entered, so the
  // fee path assumes the 0.25% NPC baseline. Default-null is safe on create
  // (there is no stored value to clobber).
  taxPct: facilityTaxPct.nullable().default(null),
});
/**
 * Create payload for a user-owned structure, including its location, facility type, rigs, and
 * optional tax override.
 */
export type CreateCustomStructureRequest = z.input<typeof createCustomStructureRequestSchema>;

/**
 * Typed endpoint definition for create custom structure endpoint; method, path, request, and
 * response contracts remain coupled here.
 */
export const createCustomStructureEndpoint: ApiEndpoint<
  CreateCustomStructureRequest,
  CustomStructuresResponse
> = {
  method: 'POST',
  path: '/api/account/custom-structures',
  request: createCustomStructureRequestSchema,
  response: customStructuresResponseSchema,
};

/**
 * ── POST /api/account/custom-structures/delete ───────────────────────────
 * Delete one of the caller's own structures (ownership-scoped in the query).
 * Echoes back the updated list.
 */
export const deleteCustomStructureRequestSchema = z.object({
  id: z.string().min(1).max(100),
});
/**
 * Delete payload identifying the user-owned custom structure to remove.
 */
export type DeleteCustomStructureRequest = z.input<typeof deleteCustomStructureRequestSchema>;

/**
 * Typed endpoint definition for delete custom structure endpoint; method, path, request, and
 * response contracts remain coupled here.
 */
export const deleteCustomStructureEndpoint: ApiEndpoint<
  DeleteCustomStructureRequest,
  CustomStructuresResponse
> = {
  method: 'POST',
  path: '/api/account/custom-structures/delete',
  request: deleteCustomStructureRequestSchema,
  response: customStructuresResponseSchema,
};

/**
 * ── POST /api/account/custom-structures/set-pin ──────────────────────────
 * Pin one of the caller's own structures to a system, or unpin it (null).
 * Ownership-scoped in the query like delete; the route confirms a non-null
 * system exists. Echoes back the updated list.
 */
export const setCustomStructurePinRequestSchema = z.object({
  id: z.string().min(1).max(100),
  systemId: typeId.nullable(),
});
/**
 * Pin mutation payload; a null system id clears the structure's planner pin.
 */
export type SetCustomStructurePinRequest = z.input<typeof setCustomStructurePinRequestSchema>;

/**
 * Typed endpoint definition for set custom structure pin endpoint; method, path, request, and
 * response contracts remain coupled here.
 */
export const setCustomStructurePinEndpoint: ApiEndpoint<
  SetCustomStructurePinRequest,
  CustomStructuresResponse
> = {
  method: 'POST',
  path: '/api/account/custom-structures/set-pin',
  request: setCustomStructurePinRequestSchema,
  response: customStructuresResponseSchema,
};

/**
 * ── POST /api/account/custom-structures/set-tax ──────────────────────────
 * Set or clear (null) the facility tax on one of the caller's own structures.
 * Ownership-scoped in the query like set-pin (a foreign id is a no-op). An
 * entered 0 is a real 0% rate, distinct from null/never-entered. Echoes back
 * the updated list.
 */
export const setCustomStructureTaxRequestSchema = z.object({
  id: z.string().min(1).max(100),
  taxPct: facilityTaxPct.nullable(),
});
/**
 * Tax mutation payload; a null percentage restores the structure's default facility tax.
 */
export type SetCustomStructureTaxRequest = z.input<typeof setCustomStructureTaxRequestSchema>;

/**
 * Typed endpoint definition for set custom structure tax endpoint; method, path, request, and
 * response contracts remain coupled here.
 */
export const setCustomStructureTaxEndpoint: ApiEndpoint<
  SetCustomStructureTaxRequest,
  CustomStructuresResponse
> = {
  method: 'POST',
  path: '/api/account/custom-structures/set-tax',
  request: setCustomStructureTaxRequestSchema,
  response: customStructuresResponseSchema,
};

/**
 * ── POST /api/account/custom-structures/parse-fit ────────────────────────
 * Parse a pasted in-game structure fit into \{ structureTypeId, rigTypeIds \} so
 * the builder can pre-fill the picker. `parsed` is null when the clipboard has no
 * resolvable structure header. Resolution is bounded to the known industry
 * structures + rigs, so unknown lines (services, fighters, defensive rigs) drop.
 */
export const parseStructureFitRequestSchema = z.object({
  fit: z.string().min(1).max(MAX_STRUCTURE_FIT_LEN),
});
/**
 * Raw in-game structure fit text accepted for bounded server-side parsing.
 */
export type ParseStructureFitRequest = z.input<typeof parseStructureFitRequestSchema>;

/**
 * Boundary validator for parse structure fit response schema; successful parsing yields the
 * normalized custom structures input consumed internally.
 */
export const parseStructureFitResponseSchema = z.object({
  parsed: z
    .object({ structureTypeId: z.number(), rigTypeIds: z.array(z.number()) })
    .nullable(),
});
/**
 * Parsed fit result with the resolved structure, system, and rig identities; unresolved fit parts
 * remain null rather than being guessed.
 */
export type ParseStructureFitResponse = z.infer<typeof parseStructureFitResponseSchema>;

/**
 * Typed endpoint definition for parse structure fit endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const parseStructureFitEndpoint: ApiEndpoint<
  ParseStructureFitRequest,
  ParseStructureFitResponse
> = {
  method: 'POST',
  path: '/api/account/custom-structures/parse-fit',
  request: parseStructureFitRequestSchema,
  response: parseStructureFitResponseSchema,
};
