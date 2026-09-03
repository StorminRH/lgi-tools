import { z } from 'zod';
import { SECURITY_CLASSES } from '@/data/eve-data/security';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';
import { planSnapshotWireSchema } from './template-snapshot';
import type {
  AssetHolding,
  BlueprintIndexEntry,
  BuildLocationData,
  IndustryStationView,
  OwnedAssetEntry,
  OwnedAssetsResponse,
  OwnedBlueprintMeEntry,
  OwnedBlueprintsResponse,
} from './types';

const PG_INT4_MAX = 2_147_483_647;

export const blueprintIndexEntrySchema = z.object({
  blueprintTypeId: z.number(),
  productTypeId: z.number(),
  name: z.string(),
}) satisfies z.ZodType<BlueprintIndexEntry>;

const blueprintsResponseSchema = z.object({
  blueprints: z.array(blueprintIndexEntrySchema),
});
export const blueprintsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/industry/blueprints',
  request: null,
  responses: {
    200: jsonBody(blueprintsResponseSchema),
  },
});

export const buildLocationRequestSchema = z.object({
  systemId: z.number().int().positive().max(PG_INT4_MAX),
  blueprintId: z.number().int().positive().max(PG_INT4_MAX),
});

const industryStationViewSchema = z.object({
  id: z.number(),
  name: z.string().nullable(),
  operationName: z.string(),
  manufacturingCapable: z.boolean(),
  researchCapable: z.boolean(),
}) satisfies z.ZodType<IndustryStationView>;

export const buildLocationResponseSchema = z.object({
  stations: z.array(industryStationViewSchema),
  costIndices: z.object({
    manufacturing: z.number().nullable(),
    reaction: z.number().nullable(),
  }),
  adjustedPrices: z.array(
    z.object({ typeId: z.number(), adjustedPrice: z.number() }),
  ),
}) satisfies z.ZodType<BuildLocationData>;
export const buildLocationEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/industry/build-location',
  request: buildLocationRequestSchema,
  responses: {
    200: jsonBody(buildLocationResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

export const ownedBlueprintsRequestSchema = z.object({
  blueprintTypeIds: z.array(z.number().int().positive().max(PG_INT4_MAX)).max(4096),
});

const ownedBlueprintMeEntrySchema = z.object({
  blueprintTypeId: z.number(),
  me: z.number(),
  te: z.number(),
  ownerType: z.enum(['character', 'corporation']),
  ownerName: z.string(),
  locationName: z.string(),
  locationFlag: z.string(),
}) satisfies z.ZodType<OwnedBlueprintMeEntry>;

const ownedBlueprintsResponseSchema = z.object({
  blueprints: z.array(ownedBlueprintMeEntrySchema),
}) satisfies z.ZodType<OwnedBlueprintsResponse>;

export const ownedBlueprintsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/industry/owned-blueprints',
  request: ownedBlueprintsRequestSchema,
  responses: {
    200: jsonBody(ownedBlueprintsResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

export const ownedAssetsRequestSchema = z.object({
  typeIds: z.array(z.number().int().positive().max(PG_INT4_MAX)).max(4096),
});

const assetHoldingSchema = z.object({
  ownerType: z.enum(['character', 'corporation']),
  ownerName: z.string(),
  locationName: z.string(),
  locationFlag: z.string(),
  quantity: z.number(),
}) satisfies z.ZodType<AssetHolding>;

const ownedAssetEntrySchema = z.object({
  typeId: z.number(),
  ownedQty: z.number(),
  heldBy: z.array(assetHoldingSchema),
}) satisfies z.ZodType<OwnedAssetEntry>;

const ownedAssetsResponseSchema = z.object({
  assets: z.array(ownedAssetEntrySchema),
}) satisfies z.ZodType<OwnedAssetsResponse>;

export const ownedAssetsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/industry/owned-assets',
  request: ownedAssetsRequestSchema,
  responses: {
    200: jsonBody(ownedAssetsResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

export const skillLevelsRequestSchema = z.object({
  characterId: z.number().int().positive().max(PG_INT4_MAX),
});

const skillLevelsResponseSchema = z.object({
  levels: z.record(z.string(), z.number()).nullable(),
});
export const skillLevelsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/industry/skill-levels',
  request: skillLevelsRequestSchema,
  responses: {
    200: jsonBody(skillLevelsResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
  },
});

const attrMapSchema = z.record(z.string(), z.number());

export const availableStructureSchema = z.object({
  id: z.string(),
  source: z.enum(['custom', 'corp']),
  name: z.string(),
  structureTypeId: z.number(),
  groupId: z.number(),
  systemId: z.number().nullable(),
  structureAttrs: attrMapSchema,
  rigAttrs: z.array(attrMapSchema),
  securityClass: z.enum(SECURITY_CLASSES).nullable(),
  taxPct: z.number().nullable(),
});

export const availableStructuresResponseSchema = z.object({
  structures: z.array(availableStructureSchema),
});

export type AvailableStructure = z.infer<typeof availableStructureSchema>;
export type AvailableStructuresResponse = z.infer<typeof availableStructuresResponseSchema>;

export const availableStructuresEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/structures',
  request: null,
  responses: {
    200: jsonBody(availableStructuresResponseSchema),
  },
});

export const MAX_SAVED_PLAN_NAME_LEN = 80;
export const MAX_SAVED_PLANS_PER_USER = 50;
const MAX_SAVED_PLAN_SNAPSHOT_BYTES = 16_384;

const savedPlanId = z.string().min(1).max(100);
const savedPlanName = z.string().trim().min(1).max(MAX_SAVED_PLAN_NAME_LEN);

const savedPlanRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  favorite: z.boolean(),
  blueprintTypeId: z.number(),
  productTypeId: z.number(),
  productName: z.string(),
  snapshot: planSnapshotWireSchema,
  updatedAt: z.string(),
});
export type SavedPlanRow = z.infer<typeof savedPlanRowSchema>;

const savedPlansResponseSchema = z.object({
  plans: z.array(savedPlanRowSchema),
});
export const savedPlansEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/saved-plans',
  request: null,
  responses: {
    200: jsonBody(savedPlansResponseSchema),
  },
});

export const createSavedPlanRequestSchema = z.object({
  name: savedPlanName,
  snapshot: planSnapshotWireSchema.refine(
    (snap) => JSON.stringify(snap).length <= MAX_SAVED_PLAN_SNAPSHOT_BYTES,
    'snapshot too large',
  ),
});
export const createSavedPlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/saved-plans',
  request: createSavedPlanRequestSchema,
  responses: {
    201: jsonBody(savedPlansResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'unknown_blueprint'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    409: problem('template_limit'),
  },
});

export const renameSavedPlanRequestSchema = z.object({
  id: savedPlanId,
  name: savedPlanName,
});
export const renameSavedPlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/saved-plans/rename',
  request: renameSavedPlanRequestSchema,
  responses: {
    200: jsonBody(savedPlansResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});

export const favoriteSavedPlanRequestSchema = z.object({
  id: savedPlanId,
  favorite: z.boolean(),
});
export const favoriteSavedPlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/saved-plans/favorite',
  request: favoriteSavedPlanRequestSchema,
  responses: {
    200: jsonBody(savedPlansResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});

export const deleteSavedPlanRequestSchema = z.object({
  id: savedPlanId,
});
export const deleteSavedPlanEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/saved-plans/delete',
  request: deleteSavedPlanRequestSchema,
  responses: {
    200: jsonBody(savedPlansResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});
