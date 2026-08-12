import { z } from 'zod';
import { defineEndpoint, jsonBody, problem } from '@/transport/endpoint';
import { MAP_ACCESS_OWNER_TYPES } from './access-contract';

const mapIdSchema = z.string().trim().min(1).max(200);
const connectionIdSchema = z.string().trim().min(1).max(200);

/** Maximum durable display-name length accepted at the create boundary. */
export const MAX_MAP_NAME_LENGTH = 120;
/** Maximum number of explicit principal grants accepted in one create statement. */
export const MAX_MAP_CREATE_GRANTS = 100;

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
export const createMapResponseSchema = z.strictObject({ mapId: mapIdSchema });

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

/** Untrusted request for one map/system signature-elimination pass. */
export const signatureEliminationRequestSchema = z.strictObject({
  mapId: mapIdSchema,
  systemId: z.number().int().positive().safe(),
});

/** One honest elimination outcome returned to the acting mapper client. */
export const signatureEliminationResponseSchema = z.discriminatedUnion('status', [
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
export const jumpResolverResponseSchema = z.discriminatedUnion('status', [
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
