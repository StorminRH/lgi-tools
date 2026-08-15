import { z } from 'zod';
import { defineEndpoint, emptyBody, jsonBody, problem } from '@/transport/endpoint';
import { MAP_ACCESS_OWNER_TYPES, MAP_ROLES } from './access-contract';

const mapIdSchema = z.string().trim().min(1).max(200);
const connectionIdSchema = z.string().trim().min(1).max(200);

/** Maximum durable display-name length accepted at the create boundary. */
export const MAX_MAP_NAME_LENGTH = 120;
/** Maximum number of explicit principal grants accepted in one create statement. */
export const MAX_MAP_CREATE_GRANTS = 100;
/** Minimum normalized character-search length accepted by both ESI search paths. */
export const MIN_CHARACTER_SEARCH_LENGTH = 3;
/** Maximum normalized character-search length accepted by the exact-name fallback. */
export const MAX_CHARACTER_SEARCH_LENGTH = 100;

const createMapGrantSchema = z.strictObject({
  ownerType: z.enum(MAP_ACCESS_OWNER_TYPES),
  ownerId: z.number().int().positive().safe(),
  role: z.enum(['viewer', 'editor']),
});

/** Untrusted request to atomically create one durable map and its delegated grants. */
export const createMapRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(MAX_MAP_NAME_LENGTH),
    grants: z.array(createMapGrantSchema).max(MAX_MAP_CREATE_GRANTS),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    for (const [index, grant] of body.grants.entries()) {
      const key = `${grant.ownerType}:${grant.ownerId}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['grants', index],
          message: 'duplicate map principal',
        });
      }
      seen.add(key);
    }
  });

/** Validated map-creation request accepted by the durable transaction owner. */
export type CreateMapRequest = z.infer<typeof createMapRequestSchema>;

/** Successful map creation response used by the first-run handoff. */
const createMapResponseSchema = z.strictObject({ mapId: mapIdSchema });

/** First-party endpoint for one authenticated atomic map creation. */
export const createMapEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/create',
  request: createMapRequestSchema,
  responses: {
    201: jsonBody(createMapResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    429: problem('rate_limited'),
    503: problem('map_projection_unavailable'),
  },
});

/** Untrusted character-search request normalized before any linked-token or ESI work. */
export const searchCharactersRequestSchema = z.strictObject({
  search: z
    .string()
    .trim()
    .min(MIN_CHARACTER_SEARCH_LENGTH)
    .max(MAX_CHARACTER_SEARCH_LENGTH),
});

const characterSearchResultSchema = z.strictObject({
  characterId: z.number().int().positive().safe(),
  name: z.string().min(1),
  portraitUrl: z.string().url(),
});

/** Character-search result with an explicit capability mode for the consuming typeahead. */
const searchCharactersResponseSchema = z.discriminatedUnion('mode', [
  z.strictObject({
    mode: z.literal('typeahead'),
    results: z.array(characterSearchResultSchema),
  }),
  z.strictObject({
    mode: z.literal('exact'),
    results: z.array(characterSearchResultSchema),
  }),
]);

/** Validated character-search request accepted by server composition. */
export type SearchCharactersRequest = z.infer<typeof searchCharactersRequestSchema>;
/** Typed scoped or exact character-search response consumed by the access editor. */
export type SearchCharactersResponse = z.infer<typeof searchCharactersResponseSchema>;

/** Authenticated first-party endpoint for scoped character search with exact fallback. */
export const searchCharactersEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/search-characters',
  request: searchCharactersRequestSchema,
  responses: {
    200: jsonBody(searchCharactersResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
    503: problem('character_search_unavailable'),
  },
});

/** Untrusted request for one map/system signature-elimination pass. */
export const signatureEliminationRequestSchema = z.strictObject({
  mapId: mapIdSchema,
  systemId: z.number().int().positive().safe(),
});

/** One honest elimination outcome returned to the acting mapper client. */
const signatureEliminationResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('applied'),
    signatureIds: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({ status: z.literal('quiet') }),
  z.strictObject({ status: z.literal('statics-unavailable') }),
]);

/** Typed signature-elimination request accepted by server composition. */
export type SignatureEliminationRequest = z.infer<
  typeof signatureEliminationRequestSchema
>;

/** Closed signature-elimination result consumed by client triggers. */
export type SignatureEliminationResponse = z.infer<
  typeof signatureEliminationResponseSchema
>;

/** First-party endpoint for one authenticated signature-elimination pass. */
export const signatureEliminationEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/signature-elimination',
  request: signatureEliminationRequestSchema,
  responses: {
    200: jsonBody(signatureEliminationResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});

const mapAccessPrincipalSchema = z.strictObject({
  ownerType: z.enum(MAP_ACCESS_OWNER_TYPES),
  ownerId: z.number().int().positive().safe(),
});

/** One admin-authored durable grant upsert or exact principal revocation. */
export const updateMapAccessRequestSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('upsert'),
    mapId: mapIdSchema,
    grant: mapAccessPrincipalSchema.extend({ role: z.enum(MAP_ROLES) }),
  }),
  z.strictObject({
    operation: z.literal('revoke'),
    mapId: mapIdSchema,
    principal: mapAccessPrincipalSchema,
  }),
]);

/** Validated set-shaped map grant mutation accepted by the access authority path. */
export type UpdateMapAccessRequest = z.infer<typeof updateMapAccessRequestSchema>;

/** Authenticated admin-only endpoint for durable grant edits plus re-projection. */
export const updateMapAccessEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/access',
  request: updateMapAccessRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin', 'map_admin_required'),
    503: problem('map_projection_unavailable'),
  },
});

/** One durable map lifecycle mutation target. */
export const mapLifecycleRequestSchema = z.strictObject({ mapId: z.uuid() });

/** Validated delete, restore, or purge-request target. */
export type MapLifecycleRequest = z.infer<typeof mapLifecycleRequestSchema>;

/** Wire response for the daily bounded map-purge cron. */
export type CronPurgeMapsResponse =
  | { readonly status: 'busy' }
  | {
      readonly status: 'purged';
      readonly selected: number;
      readonly tombstoned: number;
      readonly deletedDocuments: number;
      readonly projectionPending: number;
    };

/** Authenticated admin-only endpoint that begins the thirty-day undo window. */
export const deleteMapEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/delete',
  request: mapLifecycleRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin', 'map_admin_required'),
  },
});

/** Authenticated admin-only endpoint that restores an in-grace archived map. */
export const restoreMapEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/restore',
  request: mapLifecycleRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin', 'map_restore_unavailable'),
  },
});

/** Creator-only endpoint that fast-forwards an archived map into the next sweep. */
export const purgeMapNowEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/purge-now',
  request: mapLifecycleRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin', 'map_creator_required'),
  },
});

/** Untrusted jump-resolver request; identity and movement facts never enter through this body. */
export const jumpResolverRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('doorbell'),
    mapId: mapIdSchema,
    characterId: z.number().int().positive().safe(),
  }),
  z.strictObject({
    kind: z.literal('confirm'),
    mapId: mapIdSchema,
    connectionId: connectionIdSchema,
    targetConnectionId: connectionIdSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal('typed-hole'),
    mapId: mapIdSchema,
    connectionId: connectionIdSchema,
  }),
]);

/** One validated request accepted by the jump-resolver composition. */
export type JumpResolverRequest = z.infer<typeof jumpResolverRequestSchema>;

/** Closed workflow result returned to the doorbell observer and authoring UI. */
const jumpResolverResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('processed'),
    outcome: z.enum(['authored', 'converged', 'confirmed', 'reassociated', 'typed-hole']),
    emitted: z.boolean(),
  }),
  z.strictObject({ status: z.literal('stale'), reason: z.string().min(1) }),
  z.strictObject({ status: z.literal('skipped'), reason: z.string().min(1) }),
  z.strictObject({ status: z.literal('retry'), reason: z.string().min(1) }),
]);

/** One jump-resolver workflow response. */
export type JumpResolverResponse = z.infer<typeof jumpResolverResponseSchema>;

/** Typed first-party contract for automatic jump authoring and its identity follow-ups. */
export const jumpResolverEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/jump',
  request: jumpResolverRequestSchema,
  responses: {
    200: jsonBody(jumpResolverResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin'),
  },
});
