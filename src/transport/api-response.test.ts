import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  conflictFailure,
  dependencyUnavailableFailure,
  forbiddenFailure,
  rateLimitedFailure,
  unauthenticatedFailure,
  unexpectedFailure,
  validationFailure,
} from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';
import {
  apiFailure,
  apiResponse,
  problemResponse,
  seeOther,
  type ResponseArgsFor,
} from './api-response';
import { currentStashedFailure, withCorrelationScope } from './correlation';
import {
  defineEndpoint,
  emptyBody,
  jsonBody,
  problem,
  textBody,
  type DeclaredStatus,
  type ResponseBodyFor,
} from './endpoint';

const endpoint = defineEndpoint({
  method: 'POST',
  path: '/api/test/typed-response',
  request: z.object({ value: z.string() }),
  responses: {
    201: jsonBody(z.object({ id: z.string() })),
    204: emptyBody(),
    400: problem('invalid_body'),
    409: textBody(),
  },
});

const otherEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/test/other',
  request: null,
  responses: {
    200: jsonBody(z.object({ count: z.number() })),
  },
});

describe('apiResponse', () => {
  it('serializes JSON, text, and empty codecs with their declared statuses', async () => {
    const json = apiResponse(endpoint, 201, { id: 'abc' });
    expect(json.status).toBe(201);
    expect(json.headers.get('Content-Type')).toContain('application/json');
    await expect(json.json()).resolves.toEqual({ id: 'abc' });

    const other = apiResponse(otherEndpoint, 200, { count: 1 });
    expect(other.status).toBe(200);
    await expect(other.json()).resolves.toEqual({ count: 1 });

    const text = apiResponse(endpoint, 409, 'already exists');
    expect(text.status).toBe(409);
    await expect(text.text()).resolves.toBe('already exists');

    const empty = apiResponse(endpoint, 204);
    expect(empty.status).toBe(204);
    expect(empty.body).toBeNull();
  });

  it('delegates problem serialization to the shared mapper', async () => {
    const response = apiResponse(
      endpoint,
      400,
      validationFailure('invalid_body', 'value: Required'),
    );
    const body = problemBodySchema.parse(await response.json());
    expect(response.status).toBe(400);
    expect(response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(body).toMatchObject({
      status: 400,
      code: 'invalid_body',
      detail: 'value: Required',
    });
  });

  it('rejects a code or category status that disagrees with the endpoint', () => {
    expect(() =>
      apiResponse(endpoint, 400, validationFailure('different_code')),
    ).toThrow(/does not declare problem code/);
    expect(() =>
      apiResponse(
        endpoint,
        400,
        dependencyUnavailableFailure('invalid_body', 503),
      ),
    ).toThrow(/maps to 503/);
  });

  it('makes undeclared statuses, wrong bodies, and body-on-empty fail typecheck', () => {
    expectTypeOf<200>().not.toExtend<DeclaredStatus<typeof endpoint>>();
    expectTypeOf<[string]>().not.toExtend<
      ResponseArgsFor<(typeof endpoint)['responses'][201]>
    >();
    expectTypeOf<[{ id: string }]>().not.toExtend<
      ResponseArgsFor<(typeof endpoint)['responses'][204]>
    >();
    expectTypeOf<{ id: string }>().not.toExtend<
      ResponseBodyFor<typeof otherEndpoint, 200>
    >();
  });
});

describe('apiFailure', () => {
  const serviceEndpoint = defineEndpoint({
    method: 'POST',
    path: '/api/test/service',
    request: null,
    responses: {
      200: jsonBody(z.object({ ok: z.literal(true) })),
      400: jsonBody(z.object({ reason: z.string() })),
      401: problem('unauthenticated'),
      409: textBody(),
      500: problem('not_configured'),
    },
  });

  it('derives the status from the failure and stashes it like apiResponse', async () => {
    const result = await withCorrelationScope(async () => {
      const response = apiFailure(
        serviceEndpoint,
        unexpectedFailure('not_configured', undefined, 'service authentication is not configured'),
      );
      return { response, stashed: currentStashedFailure() };
    });
    expect(result.response.status).toBe(500);
    expect(result.response.headers.get('Content-Type')).toBe('application/problem+json');
    expect(problemBodySchema.parse(await result.response.json())).toMatchObject({
      status: 500,
      code: 'not_configured',
      detail: 'service authentication is not configured',
    });
    expect(result.stashed).toMatchObject({ category: 'unexpected', code: 'not_configured' });

    const unauthenticated = apiFailure(serviceEndpoint, unauthenticatedFailure());
    expect(unauthenticated.status).toBe(401);
    expect(problemBodySchema.parse(await unauthenticated.json())).toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
  });

  it('throws when the endpoint declares no problem at the derived status or not this code', () => {
    expect(() => apiFailure(serviceEndpoint, forbiddenFailure())).toThrow(
      'Endpoint POST /api/test/service does not declare a problem at status 403',
    );
    expect(() =>
      apiFailure(serviceEndpoint, unauthenticatedFailure('session_expired')),
    ).toThrow('Status 401 does not declare problem code session_expired');
  });

  it('never serializes a failure through a non-problem codec at its status', () => {
    expect(() =>
      apiFailure(serviceEndpoint, validationFailure('invalid_body', 'secret detail')),
    ).toThrow('Endpoint POST /api/test/service does not declare a problem at status 400');
    expect(() => apiFailure(serviceEndpoint, conflictFailure())).toThrow(
      'does not declare a problem at status 409',
    );
  });
});

describe('problemResponse', () => {
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

describe('seeOther', () => {
  const formPost = new Request('https://lgi.tools/api/admin/role', { method: 'POST' });

  it('answers a form post with a 303 to the path on the request origin', () => {
    const plain = seeOther(formPost, '/admin/queue');
    expect(plain.status).toBe(303);
    expect(plain.headers.get('location')).toBe('https://lgi.tools/admin/queue');

    const queried = seeOther(formPost, '/admin/users', {
      query: { q: 'Pilot One', error: undefined, outcome: '' },
    });
    expect(queried.headers.get('location')).toBe(
      'https://lgi.tools/admin/users?q=Pilot+One&outcome=',
    );
  });

  it('stashes a failure reported through the redirect, and nothing for a success', async () => {
    const failed = await withCorrelationScope(async () => {
      const response = seeOther(formPost, '/settings/characters', {
        query: { error: 'unlink_failed' },
        failure: unexpectedFailure('unlink_failed', new Error('boom')),
      });
      return { location: response.headers.get('location'), stashed: currentStashedFailure() };
    });
    expect(failed).toEqual({
      location: 'https://lgi.tools/settings/characters?error=unlink_failed',
      stashed: { category: 'unexpected', code: 'unlink_failed' },
    });

    const succeeded = await withCorrelationScope(async () => {
      seeOther(formPost, '/settings/characters');
      return currentStashedFailure();
    });
    expect(succeeded).toBeNull();
  });
});
