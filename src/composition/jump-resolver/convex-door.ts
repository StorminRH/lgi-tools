import { z } from 'zod';
import {
  CONNECTION_PROVENANCES,
  WORMHOLE_DESTINATION_HINTS,
  WORMHOLE_SIZE_CLASSES,
} from '@/data/eve-data/wormhole-contract';
import { postConvexHttpDoor } from '@/lib/convex-http-door';

const emissionFactsSchema = z.strictObject({
  connectionId: z.string().min(1),
  fromSystemId: z.number().int().positive(),
  toSystemId: z.number().int().positive().nullable(),
  wormholeTypeCode: z.string().nullable(),
  typedSide: z.enum(['from', 'to']).nullable(),
  destinationProvenance: z.enum(CONNECTION_PROVENANCES).nullable(),
  observationKey: z.string().nullable(),
});

const transitionEvidenceSchema = z.strictObject({
  canEdit: z.boolean(),
  tracked: z.boolean(),
  transition: z
    .strictObject({
      fromSolarSystemId: z.number().int().positive().nullable(),
      toSolarSystemId: z.number().int().positive(),
      shipTypeId: z.number().int().positive().nullable(),
      prevFresh: z.boolean(),
      transitionObservedAt: z.number().finite(),
    })
    .nullable(),
  lastProcessedTransitionAt: z.number().finite().nullable(),
  originLive: z.boolean(),
  // Origin-side typed scanned codes (resolved AND unresolved rows) — the
  // statics-census pool. Distinct from `candidates`, which stays unresolved-only.
  scannedTypeCodes: z.array(z.string().min(1)),
  candidates: z.array(
    z.strictObject({
      id: z.string().min(1),
      wormholeTypeCode: z.string().nullable(),
      destinationHint: z.enum(WORMHOLE_DESTINATION_HINTS).optional(),
      sizeClass: z.enum(WORMHOLE_SIZE_CLASSES).nullable(),
    }),
  ),
});

const connectionEvidenceSchema = z.strictObject({
  canEdit: z.boolean(),
  connection: emissionFactsSchema.nullable(),
});

const authorResultSchema = z.union([
  z.strictObject({ status: z.literal('stale'), reason: z.string().min(1) }),
  z.strictObject({
    status: z.literal('converged'),
    reason: z.literal('processed'),
  }),
  z.strictObject({
    status: z.enum(['authored', 'converged']),
    emission: emissionFactsSchema,
  }),
]);

/** Complete authoritative connection facts returned by Convex after an identity event. */
export type ConnectionEmissionFacts = z.infer<typeof emissionFactsSchema>;

/** One consistent tracked-transition snapshot from the Convex evidence door. */
export type TransitionEvidence = z.infer<typeof transitionEvidenceSchema>;

/** One edit-authorized current connection snapshot from the Convex evidence door. */
export type ConnectionEvidence = z.infer<typeof connectionEvidenceSchema>;

/** Atomic authoring result returned by the Convex resolve door. */
export type AuthorJumpResult = z.infer<typeof authorResultSchema>;

/** Matcher decision plus the complete candidate snapshot revalidated by Convex. */
export type AuthorJumpDecision =
  | {
      readonly kind: 'resolve';
      readonly candidateId: string;
      readonly provenance: 'jump-verified' | 'assumed';
      readonly candidateIds: readonly string[];
      readonly survivors: readonly string[];
    }
  | {
      readonly kind: 'insert';
      readonly candidateIds: readonly string[];
      readonly survivors: readonly string[];
    };

/** Every argument the server supplies to the transactional jump mutation. */
export interface AuthorJumpInput {
  readonly userId: string;
  readonly mapId: string;
  readonly characterId: number;
  readonly fromSolarSystemId: number;
  readonly toSolarSystemId: number;
  readonly transitionObservedAt: number;
  readonly observedShipMassKg: number | null;
  readonly observationKey: string;
  readonly decision: AuthorJumpDecision;
}

/** Popup answer dispatched through the existing transactional resolve door. */
export type AnswerJumpInput =
  | {
      readonly operation: 'confirm';
      readonly userId: string;
      readonly mapId: string;
      readonly connectionId: string;
    }
  | {
      readonly operation: 'reassociate';
      readonly userId: string;
      readonly mapId: string;
      readonly connectionId: string;
      readonly targetConnectionId: string;
    };

/** Typed failure for an unavailable or contract-invalid Convex service door. */
export class JumpConvexUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'JumpConvexUnavailableError';
  }
}

function postDoor<T>(
  path: '/jump-evidence' | '/resolve-jump',
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  return postConvexHttpDoor({
    path,
    body,
    schema,
    error: JumpConvexUnavailableError,
    label: 'Jump resolver unavailable',
  });
}

/** Reads one consistent transition packet through the established evidence door. */
export function readTransitionEvidence(
  userId: string,
  mapId: string,
  characterId: number,
): Promise<TransitionEvidence> {
  return postDoor(
    '/jump-evidence',
    { mode: 'transition', userId, mapId, characterId },
    transitionEvidenceSchema,
  );
}

/** Reads one current edit-authorized connection through the same evidence door. */
export function readConnectionEvidence(
  userId: string,
  mapId: string,
  connectionId: string,
): Promise<ConnectionEvidence> {
  return postDoor(
    '/jump-evidence',
    { mode: 'connection', userId, mapId, connectionId },
    connectionEvidenceSchema,
  );
}

/** Dispatches one fully decided jump to the atomic Convex authoring mutation. */
export function authorJump(input: AuthorJumpInput): Promise<AuthorJumpResult> {
  return postDoor(
    '/resolve-jump',
    { operation: 'author', ...input },
    authorResultSchema,
  );
}

/** Dispatches one confirmation or correction and returns authoritative emission facts. */
export function answerJump(input: AnswerJumpInput): Promise<ConnectionEmissionFacts> {
  return postDoor('/resolve-jump', input, emissionFactsSchema);
}
