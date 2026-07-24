import { describe, expect, it } from 'vitest';
import {
  conflictFailure,
  dependencyUnavailableFailure,
  forbiddenFailure,
  notFoundFailure,
  rateLimitedFailure,
  unauthenticatedFailure,
  unexpectedFailure,
  validationFailure,
} from './failure';
import { problemBody, problemBodySchema, problemResponse } from './problem';

describe('problem mapper', () => {
  it('maps every failure category to the complete stable problem shape', () => {
    const failures = [
      validationFailure(),
      unauthenticatedFailure(),
      forbiddenFailure(),
      notFoundFailure(),
      conflictFailure(),
      rateLimitedFailure(9),
      dependencyUnavailableFailure(),
      unexpectedFailure(),
    ];

    expect(
      failures.map((failure) => problemBody(failure, `correlation-${failure.category}`)),
    ).toEqual([
      expect.objectContaining({ status: 400, code: 'validation' }),
      expect.objectContaining({ status: 401, code: 'unauthenticated' }),
      expect.objectContaining({ status: 403, code: 'forbidden' }),
      expect.objectContaining({ status: 404, code: 'not_found' }),
      expect.objectContaining({ status: 409, code: 'conflict' }),
      expect.objectContaining({
        status: 429,
        code: 'rate_limited',
        retryAfterSeconds: 9,
      }),
      expect.objectContaining({ status: 503, code: 'dependency_unavailable' }),
      expect.objectContaining({ status: 500, code: 'unexpected' }),
    ]);
    for (const failure of failures) {
      expect(
        problemBodySchema.safeParse(problemBody(failure, 'correlation-id')).success,
      ).toBe(true);
    }
  });

  it('uses the explicit dependency status override for upstream failures', () => {
    expect(
      problemBody(dependencyUnavailableFailure('discord_failed', 502), 'id').status,
    ).toBe(502);
  });

  it('mints a fresh correlation id for each response', async () => {
    const first = problemBodySchema.parse(await problemResponse(forbiddenFailure()).json());
    const second = problemBodySchema.parse(await problemResponse(forbiddenFailure()).json());
    expect(first.correlationId).not.toBe(second.correlationId);
  });

  it('keeps causes, stack traces, and raw dependency messages out of the body', async () => {
    const secret = 'internal-secret-dependency-message';
    const response = problemResponse(unexpectedFailure('unexpected', new Error(secret)));
    const body = await response.text();

    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(body).not.toContain(secret);
    expect(body).not.toContain('stack');
    expect(problemBodySchema.parse(JSON.parse(body))).toEqual({
      type: 'https://lgi.tools/problems/unexpected',
      title: 'Unexpected error',
      status: 500,
      code: 'unexpected',
      correlationId: expect.any(String),
    });
  });

  it('keeps Retry-After aligned with the problem body', async () => {
    const response = problemResponse(rateLimitedFailure(14));
    const body = problemBodySchema.parse(await response.json());
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('14');
    expect(body.retryAfterSeconds).toBe(14);
  });
});
