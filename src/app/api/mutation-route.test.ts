import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  forbiddenFailure,
  unauthenticatedFailure,
  validationFailure,
} from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';
import { defineEndpoint, emptyBody, problem } from '@/transport/endpoint';

const h = vi.hoisted(() => ({
  requireSameOriginMock: vi.fn(),
  recordCapabilityOutcomeMock: vi.fn(),
}));

vi.mock('@/platform/auth/same-origin', () => ({
  requireSameOrigin: (request: Request) => h.requireSameOriginMock(request),
}));
vi.mock('@/data/telemetry/capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/telemetry/capability')>()),
  recordCapabilityOutcome: (...args: unknown[]) => h.recordCapabilityOutcomeMock(...args),
}));

import { allowAnonymous, runMutationRoute } from './mutation-route';

function request(): Request {
  return new Request('https://lgi.tools/api/example', { method: 'POST' });
}

describe('runMutationRoute', () => {
  beforeEach(() => {
    h.requireSameOriginMock.mockReset().mockReturnValue({ ok: true });
  });

  it('maps an authorization failure without observing, parsing, or handling', async () => {
    const parse = vi.fn();
    const handle = vi.fn();

    const result = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      authorize: async () => ({
        ok: false,
        failure: unauthenticatedFailure(),
      }),
      parse,
      handle,
    });

    expect(problemBodySchema.parse(await result.json())).toMatchObject({
      status: 401,
      code: 'unauthenticated',
    });
    expect(h.requireSameOriginMock).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it('runs a bodyless mutation in boundary order', async () => {
    const calls: string[] = [];
    const authorization = { ok: true as const, session: { userId: 'user-1' } };
    const response = new Response(null, { status: 204 });
    h.requireSameOriginMock.mockImplementation(() => {
      calls.push('origin');
      return { ok: true };
    });

    const result = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      authorize: async () => {
        calls.push('authorize');
        return authorization;
      },
      handle: (received) => {
        calls.push('handle');
        expect(received).toBe(authorization);
        return response;
      },
    });

    expect(result).toBe(response);
    expect(calls).toEqual(['authorize', 'origin', 'handle']);
  });

  it('maps an origin failure without parsing or handling', async () => {
    const parse = vi.fn();
    const handle = vi.fn();
    h.requireSameOriginMock.mockReturnValue({
      ok: false,
      failure: forbiddenFailure(
        'cross_origin',
        'Cross-origin requests are not allowed',
      ),
    });

    const result = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      authorize: async () => ({ ok: true as const, userId: 'user-1' }),
      parse,
      handle,
    });

    expect(result.status).toBe(403);
    expect(result.headers.get('Content-Type')).toBe('application/problem+json');
    expect(problemBodySchema.parse(await result.json())).toMatchObject({
      type: 'https://lgi.tools/problems/forbidden',
      status: 403,
      code: 'cross_origin',
    });
    expect(parse).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it('maps a parser failure without calling the handler', async () => {
    const handle = vi.fn();

    const result = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      authorize: async () => ({ ok: true as const, userId: 'user-1' }),
      parse: async () => ({
        ok: false,
        failure: validationFailure('invalid_json', 'Invalid JSON'),
      }),
      handle,
    });

    expect(problemBodySchema.parse(await result.json())).toMatchObject({
      status: 400,
      code: 'invalid_json',
      detail: 'Invalid JSON',
    });
    expect(h.requireSameOriginMock).toHaveBeenCalledOnce();
    expect(handle).not.toHaveBeenCalled();
  });

  it('passes the exact authorization and parsed body to the handler in order', async () => {
    const calls: string[] = [];
    const authorization = { ok: true as const, userId: 'user-1' };
    const body = { value: 42 };
    const response = Response.json({ ok: true });
    h.requireSameOriginMock.mockImplementation(() => {
      calls.push('origin');
      return { ok: true };
    });

    const result = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      authorize: async () => {
        calls.push('authorize');
        return authorization;
      },
      parse: async () => {
        calls.push('parse');
        return { ok: true, data: body };
      },
      handle: (receivedAuthorization, receivedBody) => {
        calls.push('handle');
        expect(receivedAuthorization).toBe(authorization);
        expect(receivedBody).toBe(body);
        return response;
      },
    });

    expect(result).toBe(response);
    expect(calls).toEqual(['authorize', 'origin', 'parse', 'handle']);
  });

  it('lets an anonymous caller reach the handler only through the origin gate', async () => {
    const handle = vi.fn(() => new Response(null, { status: 204 }));
    const options = {
      capability: 'feedback.submit-feedback' as const,
      authorize: allowAnonymous,
      handle,
    };

    const accepted = await runMutationRoute(request(), options);
    expect(accepted.status).toBe(204);
    expect(handle).toHaveBeenCalledWith({ ok: true });

    handle.mockClear();
    h.requireSameOriginMock.mockReturnValue({
      ok: false,
      failure: forbiddenFailure('cross_origin', 'Cross-origin requests are not allowed'),
    });
    const refused = await runMutationRoute(request(), options);
    expect(problemBodySchema.parse(await refused.json())).toMatchObject({
      status: 403,
      code: 'cross_origin',
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it('records a handler failure only while the client is still waiting for it', async () => {
    h.recordCapabilityOutcomeMock.mockReset();
    const controller = new AbortController();
    const options = {
      capability: 'maps.search-characters' as const,
      authorize: async () => ({ ok: true as const, userId: 'user-1' }),
      handle: () => new Response(null, { status: 503 }),
    };
    const searchFrom = (signal: AbortSignal) =>
      new Request('https://lgi.tools/api/example', { method: 'POST', signal });

    expect((await runMutationRoute(searchFrom(controller.signal), options)).status).toBe(503);
    expect(h.recordCapabilityOutcomeMock).toHaveBeenCalledExactlyOnceWith(
      'maps.search-characters',
      expect.objectContaining({ outcome: 'dependency_unavailable' }),
    );

    controller.abort();
    expect((await runMutationRoute(searchFrom(controller.signal), options)).status).toBe(503);
    expect(h.recordCapabilityOutcomeMock).toHaveBeenCalledOnce();

    // A client that gives up on a timer showed the failure, so its route opts back in.
    const timed = { ...options, capability: 'maps.resolve-jump' as const, recordAbortedFailures: true };
    expect((await runMutationRoute(searchFrom(controller.signal), timed)).status).toBe(503);
    expect(h.recordCapabilityOutcomeMock).toHaveBeenLastCalledWith(
      'maps.resolve-jump',
      expect.objectContaining({ outcome: 'dependency_unavailable' }),
    );
  });

  it('lets unexpected handler errors propagate', async () => {
    const error = new Error('mutation failed');

    await expect(runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      authorize: async () => ({ ok: true as const, userId: 'user-1' }),
      handle: () => {
        throw error;
      },
    })).rejects.toBe(error);
  });
});

describe('runMutationRoute preflight', () => {
  beforeEach(() => {
    h.requireSameOriginMock.mockReset().mockReturnValue({ ok: true });
  });

  it('runs preflight before authorization and short-circuits on its response', async () => {
    const calls: string[] = [];
    const authorize = vi.fn(async () => {
      calls.push('authorize');
      return { ok: true as const };
    });
    const throttled = new Response(null, { status: 429 });

    const result = await runMutationRoute(request(), {
      capability: 'account.switch-active-character',
      preflight: async () => {
        calls.push('preflight');
        return throttled;
      },
      authorize,
      handle: () => new Response(null, { status: 204 }),
    });

    expect(result).toBe(throttled);
    expect(calls).toEqual(['preflight']);
    expect(authorize).not.toHaveBeenCalled();
    expect(h.requireSameOriginMock).not.toHaveBeenCalled();
  });

  it('proceeds through the normal stages when preflight returns null', async () => {
    const calls: string[] = [];
    const response = new Response(null, { status: 204 });

    const result = await runMutationRoute(request(), {
      capability: 'account.switch-active-character',
      preflight: async () => {
        calls.push('preflight');
        return null;
      },
      authorize: async () => {
        calls.push('authorize');
        return { ok: true as const };
      },
      handle: () => {
        calls.push('handle');
        return response;
      },
    });

    expect(result).toBe(response);
    expect(calls).toEqual(['preflight', 'authorize', 'handle']);
  });
});

describe('runMutationRoute with an endpoint', () => {
  const contract = defineEndpoint({
    method: 'POST',
    path: '/api/example',
    request: z.object({ value: z.number() }),
    responses: {
      204: emptyBody(),
      400: problem('invalid_json', 'invalid_body'),
      401: problem('unauthenticated'),
      403: problem('cross_origin'),
    },
  });
  const crossOrigin = forbiddenFailure('cross_origin', 'Cross-origin requests are not allowed');
  const signedIn = async () => ({ ok: true as const, userId: 'user-1' });

  beforeEach(() => {
    h.requireSameOriginMock.mockReset().mockReturnValue({ ok: true });
  });

  it('serializes each declared stage failure at the status its category derives', async () => {
    const handle = vi.fn(() => new Response(null, { status: 204 }));

    const unauthenticated = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      endpoint: contract,
      authorize: async () => ({ ok: false, failure: unauthenticatedFailure() }),
      handle,
    });
    h.requireSameOriginMock.mockReturnValueOnce({ ok: false, failure: crossOrigin });
    const refused = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      endpoint: contract,
      authorize: signedIn,
      handle,
    });
    const invalid = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      endpoint: contract,
      authorize: signedIn,
      parse: async () => ({
        ok: false,
        failure: validationFailure('invalid_body', 'value: Required'),
      }),
      handle,
    });

    const bodies = await Promise.all(
      [unauthenticated, refused, invalid].map(async (response) => ({
        status: response.status,
        body: problemBodySchema.parse(await response.json()),
      })),
    );
    expect(bodies).toMatchObject([
      { status: 401, body: { status: 401, code: 'unauthenticated' } },
      { status: 403, body: { status: 403, code: 'cross_origin' } },
      { status: 400, body: { status: 400, code: 'invalid_body', detail: 'value: Required' } },
    ]);
    expect(handle).not.toHaveBeenCalled();
  });

  it('throws, as apiResponse does, when the contract omits a stage code', async () => {
    const withoutCrossOrigin = defineEndpoint({
      method: 'POST',
      path: '/api/example',
      request: null,
      responses: {
        204: emptyBody(),
        401: problem('unauthenticated'),
        403: problem('map_admin_required'),
      },
    });
    h.requireSameOriginMock.mockReturnValue({ ok: false, failure: crossOrigin });
    const handle = vi.fn(() => new Response(null, { status: 204 }));

    await expect(runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      endpoint: withoutCrossOrigin,
      authorize: signedIn,
      handle,
    })).rejects.toThrow('Status 403 does not declare problem code cross_origin');
    expect(handle).not.toHaveBeenCalled();

    const contractless = await runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      authorize: signedIn,
      handle,
    });
    expect(problemBodySchema.parse(await contractless.json())).toMatchObject({
      status: 403,
      code: 'cross_origin',
    });
  });

  it('throws when the contract declares no problem at a stage failure status', async () => {
    const publicContract = defineEndpoint({
      method: 'POST',
      path: '/api/example',
      request: null,
      responses: { 204: emptyBody(), 403: problem('cross_origin') },
    });

    await expect(runMutationRoute(request(), {
      capability: 'planner.create-saved-plan',
      endpoint: publicContract,
      authorize: async () => ({ ok: false, failure: unauthenticatedFailure() }),
      handle: () => new Response(null, { status: 204 }),
    })).rejects.toThrow('Endpoint POST /api/example does not declare a problem at status 401');
  });
});
