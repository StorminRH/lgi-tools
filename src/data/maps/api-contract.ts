import { z } from 'zod';
import { int4IdSchema, positiveIdSchema } from '@/lib/id-schemas';
import { defineEndpoint, emptyBody, jsonBody, problem } from '@/transport/endpoint';
import { MAP_ACCESS_OWNER_TYPES, MAP_CREATE_ROLES, MAP_ROLES } from './access-contract';

/** maps.id is a Postgres uuid; a malformed id must fail here, not at the SQL cast. */
const mapIdSchema = z.uuid();
const connectionIdSchema = z.string().trim().min(1).max(200);

export const MAX_MAP_NAME_LENGTH = 120;
export const MAX_MAP_CREATE_GRANTS = 100;
const MAX_MAP_CREATOR_CHARACTERS = 32;
export const MIN_CHARACTER_SEARCH_LENGTH = 3;
export const MAX_CHARACTER_SEARCH_LENGTH = 100;

const createMapGrantSchema = z.strictObject({
  ownerType: z.enum(MAP_ACCESS_OWNER_TYPES),
  ownerId: positiveIdSchema,
  role: z.enum(MAP_CREATE_ROLES),
});

/** Creator picks receive viewer grants; creator Admin belongs to the user. Picks may not repeat in `grants`. */
export const createMapRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(MAX_MAP_NAME_LENGTH),
    creatorCharacterIds: z.array(positiveIdSchema).min(1).max(MAX_MAP_CREATOR_CHARACTERS),
    grants: z.array(createMapGrantSchema).max(MAX_MAP_CREATE_GRANTS),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    for (const [index, characterId] of body.creatorCharacterIds.entries()) {
      const key = `character:${characterId}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['creatorCharacterIds', index],
          message: 'duplicate creator character',
        });
      }
      seen.add(key);
    }
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

export type CreateMapRequest = z.infer<typeof createMapRequestSchema>;

const createMapResponseSchema = z.strictObject({ mapId: mapIdSchema });

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

export const searchCharactersRequestSchema = z.strictObject({
  search: z
    .string()
    .trim()
    .min(MIN_CHARACTER_SEARCH_LENGTH)
    .max(MAX_CHARACTER_SEARCH_LENGTH),
});

const characterSearchResultSchema = z.strictObject({
  characterId: positiveIdSchema,
  name: z.string().min(1),
  portraitUrl: z.string().url(),
});

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

export type SearchCharactersResponse = z.infer<typeof searchCharactersResponseSchema>;

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

export const signatureEliminationRequestSchema = z
  .strictObject({
    mapId: mapIdSchema,
    systemIds: z.array(int4IdSchema).min(1).max(2),
  })
  .superRefine((body, ctx) => {
    if (body.systemIds.length !== new Set(body.systemIds).size) {
      ctx.addIssue({
        code: 'custom',
        path: ['systemIds'],
        message: 'duplicate system id',
      });
    }
  });

const signatureEliminationSystemResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('applied'),
    systemId: int4IdSchema,
    signatureIds: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    status: z.literal('quiet'),
    systemId: int4IdSchema,
  }),
  z.strictObject({
    status: z.literal('statics-unavailable'),
    systemId: int4IdSchema,
  }),
  z.strictObject({
    status: z.literal('observations-unavailable'),
    systemId: int4IdSchema,
  }),
]);

const signatureEliminationResponseSchema = z.strictObject({
  results: z.array(signatureEliminationSystemResultSchema).min(1).max(2),
});

export type SignatureEliminationRequest = z.infer<
  typeof signatureEliminationRequestSchema
>;

export type SignatureEliminationResponse = z.infer<
  typeof signatureEliminationResponseSchema
>;

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
  ownerId: positiveIdSchema,
});

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
  z.strictObject({
    operation: z.literal('block'),
    mapId: mapIdSchema,
    characterId: positiveIdSchema,
  }),
  z.strictObject({
    operation: z.literal('unblock'),
    mapId: mapIdSchema,
    characterId: positiveIdSchema,
  }),
]);

export type MapBlockRequest = Extract<UpdateMapAccessRequest, { operation: 'block' | 'unblock' }>;
export type MapGrantRequest = Exclude<UpdateMapAccessRequest, MapBlockRequest>;

export type UpdateMapAccessRequest = z.infer<typeof updateMapAccessRequestSchema>;

export const updateMapAccessEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/maps/access',
  request: updateMapAccessRequestSchema,
  responses: {
    204: emptyBody(),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    403: problem('cross_origin', 'map_admin_required'),
    409: problem('map_creator_character_required', 'map_block_owner', 'map_block_self'),
    503: problem('map_projection_unavailable'),
  },
});

export const mapLifecycleRequestSchema = z.strictObject({ mapId: mapIdSchema });

export type MapLifecycleRequest = z.infer<typeof mapLifecycleRequestSchema>;

export type CronPurgeMapsResponse =
  | { readonly status: 'busy' }
  | {
      readonly status: 'purged';
      readonly selected: number;
      readonly tombstoned: number;
      readonly deletedDocuments: number;
      readonly projectionPending: number;
    };

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

export const jumpResolverRequestSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('doorbell'),
    mapId: mapIdSchema,
    characterId: positiveIdSchema,
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

export type JumpResolverRequest = z.infer<typeof jumpResolverRequestSchema>;

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

export type JumpResolverResponse = z.infer<typeof jumpResolverResponseSchema>;

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
