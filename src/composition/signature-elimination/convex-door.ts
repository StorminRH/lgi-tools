import { z } from 'zod';
import { CONNECTION_PROVENANCES } from '@/data/eve-data/wormhole-contract';
import type { EliminationDeduction } from '@/data/maps/signature-eliminator';
import { postConvexHttpDoor } from '@/lib/convex-http-door';

const evidenceSchema = z.strictObject({
  canEdit: z.boolean(),
  signatures: z.array(
    z.strictObject({
      signatureId: z.string().min(1),
      wormholeTypeCode: z.string().nullable(),
      typeProvenance: z.enum(CONNECTION_PROVENANCES).nullable(),
      observationKey: z.string().nullable(),
    }),
  ),
  connections: z.array(
    z.strictObject({
      connectionId: z.string().min(1),
      wormholeTypeCode: z.string().nullable(),
      linkedSignature: z.boolean(),
    }),
  ),
});

const outcomesSchema = z.array(
  z.strictObject({
    signatureId: z.string().min(1),
    outcome: z.enum(['applied', 'unchanged', 'protected', 'stale']),
    observationKey: z.string().nullable(),
  }),
);

/** Bounded endpoint-local evidence returned by the Convex service door. */
export type EliminationEvidence = z.infer<typeof evidenceSchema>;

/** Per-deduction transactional outcome returned by the Convex write door. */
export type EliminationWriteOutcome = z.infer<typeof outcomesSchema>[number];

/** Typed failure for an unavailable or contract-invalid elimination door. */
export class EliminationConvexUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EliminationConvexUnavailableError';
  }
}

function postDoor<T>(body: unknown, schema: z.ZodType<T>): Promise<T> {
  return postConvexHttpDoor({
    path: '/signature-elimination',
    body,
    schema,
    error: EliminationConvexUnavailableError,
    label: 'Signature elimination unavailable',
  });
}

/** Reads one access-checked live evidence snapshot for a map system. */
export function readEliminationEvidence(
  userId: string,
  mapId: string,
  systemId: number,
): Promise<EliminationEvidence> {
  return postDoor(
    { operation: 'evidence', userId, mapId, systemId },
    evidenceSchema,
  );
}

/** Applies one assumed-tier deduction batch through the transactional door. */
export function applyEliminationDeductions(input: {
  readonly userId: string;
  readonly mapId: string;
  readonly systemId: number;
  readonly deductions: readonly EliminationDeduction[];
}): Promise<EliminationWriteOutcome[]> {
  return postDoor(
    { operation: 'apply', ...input, deductions: [...input.deductions] },
    outcomesSchema,
  );
}
