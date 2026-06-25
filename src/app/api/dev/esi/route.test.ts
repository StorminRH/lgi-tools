import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The sandbox read endpoint. Mock auth, ownership, the token service, and the
// ESI gate so these exercise the production-only admin gate, the validation,
// and the outcome→kind mapping without a DB or network.

const h = vi.hoisted(() => {
  class FakeBudgetError extends Error {
    constructor(
      public remaining: number,
      public reason: string,
    ) {
      super('budget');
    }
  }
  class FakeServerError extends Error {
    constructor(public status: number) {
      super('server');
    }
  }
  return {
    getSessionMock: vi.fn(),
    accountBelongsToUserMock: vi.fn(),
    tokenServiceMock: vi.fn(),
    esiFetchMock: vi.fn(),
    FakeBudgetError,
    FakeServerError,
  };
});

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/features/auth/auth', () => ({
  auth: { api: { getSession: () => h.getSessionMock() } },
}));
vi.mock('@/features/auth/queries', () => ({
  accountBelongsToUser: (u: string, c: number) => h.accountBelongsToUserMock(u, c),
}));
vi.mock('@/features/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: (c: number) => h.tokenServiceMock(c),
}));
vi.mock('@/lib/esi', () => ({
  esiFetch: (...args: unknown[]) => h.esiFetchMock(...args),
  esiUrl: (path: string) => `https://esi.evetech.net${path}`,
  EsiBudgetExhaustedError: h.FakeBudgetError,
  EsiServerError: h.FakeServerError,
}));

import { POST } from './route';

const SESSION = { user: { id: 'user-1' }, characterId: 90000001, isAdmin: false };
const OK_TOKEN = {
  kind: 'ok',
  accessToken: 'fresh-access',
  expiresAt: new Date('2026-06-11T12:00:00Z'),
  characterId: 90000001,
  scopes: ['publicData'],
};

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/dev/esi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const READ_SKILLS = { characterId: 90000001, endpoint: 'skills' };

beforeEach(() => {
  h.getSessionMock.mockReset().mockResolvedValue(SESSION);
  h.accountBelongsToUserMock.mockReset().mockResolvedValue(true);
  h.tokenServiceMock.mockReset().mockResolvedValue(OK_TOKEN);
  h.esiFetchMock.mockReset().mockResolvedValue(
    new Response(JSON.stringify({ total_sp: 1 }), {
      status: 200,
      headers: { ETag: '"abc"', Expires: 'Thu, 11 Jun 2026 12:02:00 GMT' },
    }),
  );
  vi.stubEnv('VERCEL_ENV', 'preview');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/dev/esi', () => {
  it('returns 401 when anonymous', async () => {
    h.getSessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(READ_SKILLS));
    expect(res.status).toBe(401);
    expect(h.esiFetchMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin on production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    const res = await POST(makeRequest(READ_SKILLS));
    expect(res.status).toBe(403);
    expect(h.esiFetchMock).not.toHaveBeenCalled();
  });

  it('lets a non-admin read on preview (the page-gate mirror)', async () => {
    const res = await POST(makeRequest(READ_SKILLS));
    expect(res.status).toBe(200);
    expect(h.esiFetchMock).toHaveBeenCalledOnce();
  });

  it('lets an admin read on production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    h.getSessionMock.mockResolvedValue({ ...SESSION, isAdmin: true });
    const res = await POST(makeRequest(READ_SKILLS));
    expect(res.status).toBe(200);
  });

  it('returns 400 for an unknown endpoint id', async () => {
    const res = await POST(makeRequest({ characterId: 1, endpoint: 'wallet' }));
    expect(res.status).toBe(400);
  });

  it('returns 403 when the character is not the caller\'s', async () => {
    h.accountBelongsToUserMock.mockResolvedValue(false);
    const res = await POST(makeRequest(READ_SKILLS));
    expect(res.status).toBe(403);
    expect(h.tokenServiceMock).not.toHaveBeenCalled();
  });

  it.each(['not_found', 'reauth_required', 'upstream_error'] as const)(
    'maps a %s token result to a token_error payload, not an HTTP error',
    async (kind) => {
      h.tokenServiceMock.mockResolvedValue({ kind });
      const res = await POST(makeRequest(READ_SKILLS));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ kind: 'token_error', error: kind });
      expect(h.esiFetchMock).not.toHaveBeenCalled();
    },
  );

  it('dispatches through the gate with the bearer token, interactive, on the spec-canonical path', async () => {
    await POST(makeRequest(READ_SKILLS));
    const [url, init, opts] = h.esiFetchMock.mock.calls[0] as [
      string,
      RequestInit,
      { interactive?: boolean },
    ];
    expect(url).toBe('https://esi.evetech.net/characters/90000001/skills');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer fresh-access');
    expect(new Headers(init.headers).has('If-None-Match')).toBe(false);
    expect(opts).toEqual({ interactive: true });
  });

  it('forwards a supplied ETag as If-None-Match and reports a raw 304 with an empty body', async () => {
    h.esiFetchMock.mockResolvedValue(
      new Response(null, { status: 304, headers: { ETag: '"abc"' } }),
    );
    const res = await POST(makeRequest({ ...READ_SKILLS, ifNoneMatch: '"abc"' }));
    const [, init] = h.esiFetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get('If-None-Match')).toBe('"abc"');
    const payload = await res.json();
    expect(payload.kind).toBe('esi');
    expect(payload.status).toBe(304);
    expect(payload.bodyText).toBe('');
    expect(payload.headers.etag).toBe('"abc"');
  });

  it('surfaces the response body and cache/rate headers raw', async () => {
    const res = await POST(makeRequest(READ_SKILLS));
    const payload = await res.json();
    expect(payload.kind).toBe('esi');
    expect(payload.status).toBe(200);
    expect(payload.bodyText).toBe('{"total_sp":1}');
    expect(payload.headers.etag).toBe('"abc"');
    expect(payload.headers.expires).toBe('Thu, 11 Jun 2026 12:02:00 GMT');
    expect(payload.headers.cacheControl).toBeNull();
    expect(typeof payload.elapsedMs).toBe('number');
  });

  it('maps a gate budget refusal to a budget_exhausted payload', async () => {
    h.esiFetchMock.mockRejectedValue(new h.FakeBudgetError(0, 'scoreboard_unavailable'));
    const res = await POST(makeRequest(READ_SKILLS));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      kind: 'budget_exhausted',
      reason: 'scoreboard_unavailable',
      remaining: 0,
    });
  });

  it('maps an ESI 5xx (EsiServerError) to a server_error payload', async () => {
    h.esiFetchMock.mockRejectedValue(new h.FakeServerError(503));
    const res = await POST(makeRequest(READ_SKILLS));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: 'server_error', status: 503 });
  });
});
