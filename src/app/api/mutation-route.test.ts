import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  unauthenticatedFailure,
  validationFailure,
} from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';

const h = vi.hoisted(() => ({
  requireSameOriginMock: vi.fn(),
}));

vi.mock('@/platform/auth/same-origin', () => ({
  requireSameOrigin: (request: Request) => h.requireSameOriginMock(request),
}));

import { runMutationRoute } from './mutation-route';

function request(): Request {
  return new Request('https://lgi.tools/api/example', { method: 'POST' });
}

describe('runMutationRoute', () => {
  beforeEach(() => {
    h.requireSameOriginMock.mockReset();
  });

  it('maps an authorization failure without observing, parsing, or handling', async () => {
    const parse = vi.fn();
    const handle = vi.fn();

    const result = await runMutationRoute(request(), {
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
    h.requireSameOriginMock.mockImplementation(() => calls.push('origin'));

    const result = await runMutationRoute(request(), {
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

  it('maps a parser failure without calling the handler', async () => {
    const handle = vi.fn();

    const result = await runMutationRoute(request(), {
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
    h.requireSameOriginMock.mockImplementation(() => calls.push('origin'));

    const result = await runMutationRoute(request(), {
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

  it('lets unexpected handler errors propagate', async () => {
    const error = new Error('mutation failed');

    await expect(runMutationRoute(request(), {
      authorize: async () => ({ ok: true as const, userId: 'user-1' }),
      handle: () => {
        throw error;
      },
    })).rejects.toBe(error);
  });
});
