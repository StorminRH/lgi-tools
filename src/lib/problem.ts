import { z } from 'zod';
import type { AppFailure, FailureCategory } from './failure';

/** RFC 9457-compatible problem body served by every mapped application failure. */
export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: string;
  correlationId: string;
  detail?: string;
  retryAfterSeconds?: number;
}

/** Structural client-side parser for the stable HTTP problem body. */
export const problemBodySchema: z.ZodType<ProblemBody, ProblemBody> = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  correlationId: z.string(),
  detail: z.string().optional(),
  retryAfterSeconds: z.number().int().positive().optional(),
});

/** Default HTTP status for every application-failure category. */
export const CATEGORY_STATUS = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  dependency_unavailable: 503,
  unexpected: 500,
} satisfies Record<FailureCategory, number>;

const CATEGORY_TITLE = {
  validation: 'Invalid request',
  unauthenticated: 'Authentication required',
  forbidden: 'Forbidden',
  not_found: 'Not found',
  conflict: 'Conflict',
  rate_limited: 'Too many requests',
  dependency_unavailable: 'Dependency unavailable',
  unexpected: 'Unexpected error',
} satisfies Record<FailureCategory, string>;

function statusFor(failure: AppFailure): number {
  if (failure.category === 'dependency_unavailable' && failure.status !== undefined) {
    return failure.status;
  }
  return CATEGORY_STATUS[failure.category];
}

function assertValidRetryAfterSeconds(retryAfterSeconds: number | undefined): void {
  if (
    retryAfterSeconds !== undefined &&
    (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds <= 0)
  ) {
    throw new RangeError('retryAfterSeconds must be a positive integer');
  }
}

/** Builds the safe problem body without serializing internal causes. */
export function problemBody(failure: AppFailure, correlationId: string): ProblemBody {
  assertValidRetryAfterSeconds(failure.retryAfterSeconds);
  return {
    type: `https://lgi.tools/problems/${failure.category}`,
    title: CATEGORY_TITLE[failure.category],
    status: statusFor(failure),
    code: failure.code,
    correlationId,
    ...(failure.detail === undefined ? {} : { detail: failure.detail }),
    ...(failure.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: failure.retryAfterSeconds }),
  };
}

/** Serializes a problem body with the sole problem content type and retry header owner. */
export function serializeProblem(body: ProblemBody): Response {
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: {
      'Content-Type': 'application/problem+json',
      ...(body.retryAfterSeconds === undefined
        ? {}
        : { 'Retry-After': String(body.retryAfterSeconds) }),
    },
  });
}

/** Maps one typed failure to its safe delivery-boundary problem response. */
export function problemResponse(failure: AppFailure): Response {
  return serializeProblem(problemBody(failure, crypto.randomUUID()));
}
