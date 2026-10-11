import { z } from 'zod';
import {
  CONNECTION_PROVENANCES,
  WORMHOLE_DESTINATION_HINTS,
  WORMHOLE_SIZE_CLASSES,
} from '@/data/eve-data/wormhole-contract';
import { defineConvexDoor } from '@/lib/convex-door-contract';
import { positiveIdSchema } from '@/lib/id-schemas';
import { MAP_CLAIM_PURGE_BATCH, MAP_ROLES } from './access-contract';
import { CONNECTION_DOOR_SIDES } from './connection-hallway';
import type { JumpMatchOutcome } from './hole-matching';
import type { EliminationDeduction } from './signature-eliminator';

// The Convex HTTP doors the map owner calls, one per operation. Convex parses
// each request with `door.request` and Next parses each reply with
// `door.response`. Convex bundles this module, so it imports zod, lib and pure
// data contracts only.

const nonEmptyString = z.string().min(1);
const countSchema = z.number().int().nonnegative();
const revisionSchema = z.number().int().positive();
const userMapFields = { userId: nonEmptyString, mapId: nonEmptyString };

// Jump resolution

const emissionFactsSchema = z.strictObject({
  connectionId: nonEmptyString,
  fromSystemId: positiveIdSchema,
  toSystemId: positiveIdSchema.nullable(),
  wormholeTypeCode: z.string().nullable(),
  typedSide: z.enum(CONNECTION_DOOR_SIDES).nullable(),
  destinationProvenance: z.enum(CONNECTION_PROVENANCES).nullable(),
  observationKey: z.string().nullable(),
});

export const jumpTransitionEvidenceDoor = defineConvexDoor({
  path: '/jump-evidence',
  request: z.strictObject({
    mode: z.literal('transition'),
    ...userMapFields,
    characterId: positiveIdSchema,
  }),
  response: z.strictObject({
    canEdit: z.boolean(),
    tracked: z.boolean(),
    transition: z
      .strictObject({
        fromSolarSystemId: positiveIdSchema.nullable(),
        toSolarSystemId: positiveIdSchema,
        shipTypeId: positiveIdSchema.nullable(),
        prevFresh: z.boolean(),
        transitionObservedAt: z.number().finite(),
      })
      .nullable(),
    lastProcessedTransitionAt: z.number().finite().nullable(),
    originLive: z.boolean(),
    scannedTypeCodes: z.array(nonEmptyString),
    candidates: z.array(
      z.strictObject({
        id: nonEmptyString,
        wormholeTypeCode: z.string().nullable(),
        destinationHint: z.enum(WORMHOLE_DESTINATION_HINTS).optional(),
        sizeClass: z.enum(WORMHOLE_SIZE_CLASSES).nullable(),
      }),
    ),
  }),
});

export const jumpConnectionEvidenceDoor = defineConvexDoor({
  path: '/jump-evidence',
  request: z.strictObject({
    mode: z.literal('connection'),
    ...userMapFields,
    connectionId: nonEmptyString,
  }),
  response: z.strictObject({
    canEdit: z.boolean(),
    connection: emissionFactsSchema.nullable(),
  }),
});

/** The matcher's outcome plus every candidate it weighed, as Convex re-checks it. */
const jumpDecisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('resolve'),
    candidateId: nonEmptyString,
    provenance: z.enum(['jump-verified', 'assumed']),
    candidateIds: z.array(nonEmptyString),
    survivors: z.array(nonEmptyString),
  }),
  z.object({
    kind: z.literal('insert'),
    candidateIds: z.array(nonEmptyString),
    survivors: z.array(nonEmptyString),
  }),
]) satisfies z.ZodType<JumpMatchOutcome & { readonly candidateIds: readonly string[] }>;

export const authorJumpDoor = defineConvexDoor({
  path: '/resolve-jump',
  request: z.object({
    operation: z.literal('author'),
    ...userMapFields,
    characterId: positiveIdSchema,
    fromSolarSystemId: positiveIdSchema,
    toSolarSystemId: positiveIdSchema,
    transitionObservedAt: z.number().finite(),
    observedShipMassKg: z.number().finite().positive().nullable(),
    observationKey: nonEmptyString,
    decision: jumpDecisionSchema,
  }),
  response: z.union([
    z.strictObject({ status: z.literal('stale'), reason: nonEmptyString }),
    z.strictObject({ status: z.literal('converged'), reason: z.literal('processed') }),
    z.strictObject({
      status: z.enum(['authored', 'converged']),
      emission: emissionFactsSchema,
    }),
  ]),
});

export const confirmJumpDoor = defineConvexDoor({
  path: '/resolve-jump',
  request: z.object({
    operation: z.literal('confirm'),
    ...userMapFields,
    connectionId: nonEmptyString,
  }),
  response: emissionFactsSchema,
});

export const reassociateJumpDoor = defineConvexDoor({
  path: '/resolve-jump',
  request: z.object({
    operation: z.literal('reassociate'),
    ...userMapFields,
    connectionId: nonEmptyString,
    targetConnectionId: nonEmptyString,
  }),
  response: emissionFactsSchema,
});

// Signature elimination

const eliminationDeductionSchema = z.union([
  z.strictObject({
    signatureId: nonEmptyString,
    typeCode: nonEmptyString,
    provenance: z.literal('assumed'),
  }),
  z.strictObject({
    signatureId: nonEmptyString,
    connectionId: nonEmptyString,
    provenance: z.literal('assumed'),
    expectedTypeCode: nonEmptyString.nullable(),
  }),
]) satisfies z.ZodType<EliminationDeduction>;

export const eliminationEvidenceDoor = defineConvexDoor({
  path: '/signature-elimination',
  request: z.strictObject({
    operation: z.literal('evidence'),
    ...userMapFields,
    systemId: positiveIdSchema,
  }),
  response: z.strictObject({
    canEdit: z.boolean(),
    signatures: z.array(
      z.strictObject({
        signatureId: nonEmptyString,
        wormholeTypeCode: z.string().nullable(),
        typeProvenance: z.enum(CONNECTION_PROVENANCES).nullable(),
        observationKey: z.string().nullable(),
      }),
    ),
    connections: z.array(
      z.strictObject({
        connectionId: nonEmptyString,
        wormholeTypeCode: z.string().nullable(),
        linkedSignature: z.boolean(),
      }),
    ),
  }),
});

export const applyEliminationDoor = defineConvexDoor({
  path: '/signature-elimination',
  request: z.strictObject({
    operation: z.literal('apply'),
    ...userMapFields,
    systemId: positiveIdSchema,
    deductions: z.array(eliminationDeductionSchema).min(1),
  }),
  response: z.array(
    z.strictObject({
      signatureId: nonEmptyString,
      outcome: z.enum(['applied', 'unchanged', 'protected', 'stale']),
      observationKey: z.string().nullable(),
    }),
  ),
});

// Map access projection

const projectionCountFields = {
  inserted: countSchema,
  updated: countSchema,
  deleted: countSchema,
  unchanged: countSchema,
};
const characterScopedField = { characterScoped: z.literal(true).optional() };
const deletedResponseSchema = z.strictObject({ deleted: countSchema });

/**
 * A map's full claim set. `characters` is sent only for character-scoped maps;
 * its absence keeps Convex on account-level tracking. The reply is strict so an
 * older Convex that drops `characterScoped` cannot pass for a current one.
 */
export const projectMapAccessDoor = defineConvexDoor({
  path: '/project-map-access',
  request: z
    .object({
      mapId: nonEmptyString,
      revision: revisionSchema,
      claims: z.array(
        z.object({
          userId: z.string(),
          roles: z.array(z.enum(MAP_ROLES)).min(1),
          characters: z
            .array(z.object({ characterId: positiveIdSchema, name: z.string() }))
            .optional(),
        }),
      ),
    })
    .superRefine((body, ctx) => {
      const seen = new Set<string>();
      for (const [index, claim] of body.claims.entries()) {
        if (seen.has(claim.userId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['claims', index, 'userId'],
            message: 'duplicate userId',
          });
        }
        seen.add(claim.userId);
      }
    }),
  response: z.discriminatedUnion('outcome', [
    z.strictObject({ ...projectionCountFields, ...characterScopedField, outcome: z.literal('applied') }),
    z.strictObject({ ...projectionCountFields, ...characterScopedField, outcome: z.literal('duplicate') }),
    z.strictObject({ ...projectionCountFields, outcome: z.literal('stale') }),
    z.strictObject({ ...projectionCountFields, outcome: z.literal('unscoped-refused') }),
  ]),
});

export const purgeMapAccessDoor = defineConvexDoor({
  path: '/purge-map-access',
  request: z.object({ userId: nonEmptyString }),
  response: deletedResponseSchema,
});

export const purgeUserMapClaimsDoor = defineConvexDoor({
  path: '/purge-user-map-claims',
  request: z.object({
    userId: nonEmptyString,
    revision: revisionSchema,
    mapIds: z.array(nonEmptyString).min(1).max(MAP_CLAIM_PURGE_BATCH),
  }),
  response: deletedResponseSchema,
});

export const purgeMapChainDoor = defineConvexDoor({
  path: '/purge-map-chain',
  request: z.object({ mapId: nonEmptyString }),
  response: z.strictObject({ deleted: countSchema, remaining: z.literal(false) }),
});

/** Service-only freeze and snapshot for the character-scoping backfill. */
export const mapTrackingSnapshotDoor = defineConvexDoor({
  path: '/map-tracking-snapshot',
  request: z.object({ mapId: nonEmptyString }),
  response: z.strictObject({
    tracked: z.array(z.strictObject({ userId: z.string(), characterId: positiveIdSchema })),
  }),
});
