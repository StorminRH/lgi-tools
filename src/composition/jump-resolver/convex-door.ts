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

export type ConnectionEmissionFacts = z.infer<typeof emissionFactsSchema>;

export type TransitionEvidence = z.infer<typeof transitionEvidenceSchema>;

export type ConnectionEvidence = z.infer<typeof connectionEvidenceSchema>;

export type AuthorJumpResult = z.infer<typeof authorResultSchema>;

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

export function authorJump(input: AuthorJumpInput): Promise<AuthorJumpResult> {
  return postDoor(
    '/resolve-jump',
    { operation: 'author', ...input },
    authorResultSchema,
  );
}

export function answerJump(input: AnswerJumpInput): Promise<ConnectionEmissionFacts> {
  return postDoor('/resolve-jump', input, emissionFactsSchema);
}
