import { z } from 'zod';
import { CONNECTION_PROVENANCES } from '@/data/eve-data/wormhole-contract';
import type { EliminationDeduction } from '@/data/maps/signature-eliminator';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';

const evidenceSchema = z.strictObject({
  canEdit: z.boolean(),
  signatures: z.array(
    z.strictObject({
      signatureId: z.string().min(1),
      wormholeTypeCode: z.string().nullable(),
      typeProvenance: z.enum(CONNECTION_PROVENANCES).nullable(),
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

async function postDoor<T>(
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = readEnv('CONVEX_SERVICE_SECRET');
  const siteUrl = convexUrl ? deriveConvexSiteUrl(convexUrl) : null;
  if (siteUrl === null || !secret) {
    throw new EliminationConvexUnavailableError(
      'Signature elimination unavailable: Convex URL or service secret is unset',
    );
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${siteUrl}/signature-elimination`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new EliminationConvexUnavailableError(
      'Signature elimination Convex request failed',
      { cause },
    );
  }
  if (!response.ok) {
    throw new EliminationConvexUnavailableError(
      `Signature elimination Convex door answered ${response.status}`,
    );
  }

  let decoded: unknown;
  try {
    decoded = await response.json();
  } catch (cause) {
    throw new EliminationConvexUnavailableError(
      'Signature elimination Convex door returned invalid JSON',
      { cause },
    );
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new EliminationConvexUnavailableError(
      'Signature elimination Convex door returned an invalid contract',
    );
  }
  return parsed.data;
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
