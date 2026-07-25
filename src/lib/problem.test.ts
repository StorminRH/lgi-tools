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
import { problemBody, problemBodySchema, serializeProblem } from './problem';

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

  it('keeps causes, stack traces, and raw dependency messages out of the body', () => {
    const secret = 'internal-secret-dependency-message';
    const body = problemBody(
      unexpectedFailure('unexpected', new Error(secret)),
      'correlation-id',
    );

    expect(JSON.stringify(body)).not.toContain(secret);
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(problemBodySchema.parse(body)).toEqual({
      type: 'https://lgi.tools/problems/unexpected',
      title: 'Unexpected error',
      status: 500,
      code: 'unexpected',
      correlationId: 'correlation-id',
    });
  });

  it('serializes with the problem content type and an aligned Retry-After header', async () => {
    const response = serializeProblem(problemBody(rateLimitedFailure(14), 'correlation-id'));
    const body = problemBodySchema.parse(await response.json());
    expect(response.status).toBe(429);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(response.headers.get('Retry-After')).toBe('14');
    expect(body.retryAfterSeconds).toBe(14);
  });

  it('omits Retry-After when the failure declares none', () => {
    const response = serializeProblem(problemBody(forbiddenFailure(), 'correlation-id'));
    expect(response.headers.get('Retry-After')).toBeNull();
  });

  it.each([0, -1, 1.5])(
    'rejects invalid retryAfterSeconds %s before serialization',
    (retryAfterSeconds) => {
      expect(() =>
        problemBody(
          {
            category: 'rate_limited',
            code: 'rate_limited',
            retryAfterSeconds,
          },
          'correlation-id',
        ),
      ).toThrow(new RangeError('retryAfterSeconds must be a positive integer'));
    },
  );
});
