import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  serviceMock: vi.fn(),
  accountBelongsToUserMock: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/features/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: h.serviceMock,
}));
vi.mock('@/features/auth/linked-characters', () => ({
  accountBelongsToUser: h.accountBelongsToUserMock,
}));

import { POST } from './route';

const SECRET = 'svc-secret';
const VALID_BODY = { userId: 'user-1', characterId: 1 };

function makeRequest(body: unknown, authorization?: string): Request {
  return new Request('http://localhost/api/internal/eve-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
  h.serviceMock.mockReset();
  h.accountBelongsToUserMock.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/internal/eve-token', () => {
  it('returns 500 when the service secret is not configured', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');
    const res = await POST(makeRequest(VALID_BODY, `Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(h.serviceMock).not.toHaveBeenCalled();
  });

  it('returns 401 for a missing bearer token', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a wrong bearer token', async () => {
    const res = await POST(makeRequest(VALID_BODY, 'Bearer nope'));
    expect(res.status).toBe(401);
    expect(h.serviceMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(makeRequest('not json{', `Bearer ${SECRET}`));
    expect(res.status).toBe(400);
  });

  it.each([
    {},
    { characterId: 1 },
    { userId: '', characterId: 1 },
    { userId: 'user with spaces', characterId: 1 },
    { userId: 'user-1', characterId: 0 },
    { userId: 'user-1', characterId: -3 },
    { userId: 'user-1', characterId: 1.5 },
    { userId: 'user-1', characterId: 'x' },
  ])(
    'returns 400 for invalid body %j',
    async (body) => {
      const res = await POST(makeRequest(body, `Bearer ${SECRET}`));
      expect(res.status).toBe(400);
    },
  );

  it('returns 200 with only the access token — never the refresh token', async () => {
    h.serviceMock.mockResolvedValue({
      kind: 'ok',
      accessToken: 'fresh-access-token',
    });

    const res = await POST(makeRequest(
      { userId: 'user-1', characterId: 90000001 },
      `Bearer ${SECRET}`,
    ));
    expect(res.status).toBe(200);

    const text = await res.text();
    const body = JSON.parse(text);
    expect(body).toEqual({
      accessToken: 'fresh-access-token',
    });
    // The core custody guarantee: no refresh token key, and the word never appears.
    expect('refreshToken' in body).toBe(false);
    expect(text.toLowerCase()).not.toContain('refresh');
    expect(h.accountBelongsToUserMock).toHaveBeenCalledWith('user-1', 90000001);
    expect(h.serviceMock).toHaveBeenCalledWith(90000001);
  });

  it('returns the existing 404 envelope without vending when ownership fails', async () => {
    h.accountBelongsToUserMock.mockResolvedValue(false);

    const res = await POST(makeRequest(VALID_BODY, `Bearer ${SECRET}`));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
    expect(h.accountBelongsToUserMock).toHaveBeenCalledWith('user-1', 1);
    expect(h.serviceMock).not.toHaveBeenCalled();
  });

  it('maps not_found → 404', async () => {
    h.serviceMock.mockResolvedValue({ kind: 'not_found' });
    const res = await POST(makeRequest(VALID_BODY, `Bearer ${SECRET}`));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });

  it('maps reauth_required → 409', async () => {
    h.serviceMock.mockResolvedValue({ kind: 'reauth_required' });
    const res = await POST(makeRequest(VALID_BODY, `Bearer ${SECRET}`));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'reauth_required' });
  });

  it('maps upstream_error → 502', async () => {
    h.serviceMock.mockResolvedValue({ kind: 'upstream_error' });
    const res = await POST(makeRequest(VALID_BODY, `Bearer ${SECRET}`));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_error' });
  });
});
