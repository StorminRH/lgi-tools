import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

const h = vi.hoisted(() => ({
  afterMock: vi.fn(),
  listLinkedCharactersMock: vi.fn(),
  refreshAffiliationsMock: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => h.afterMock(callback),
  connection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliations: h.refreshAffiliationsMock,
}));
vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: h.listLinkedCharactersMock,
}));

import { POST } from './route';

const SECRET = 'svc-secret';
const VALID_BODY = { userId: 'user-1' };

function makeRequest(body: unknown, authorization?: string): Request {
  return new Request('http://localhost/api/internal/eve-characters', {
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
  h.afterMock.mockReset();
  h.listLinkedCharactersMock.mockReset().mockResolvedValue([]);
  h.refreshAffiliationsMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/internal/eve-characters', () => {
  it('returns a 500 problem when the service secret is not configured', async () => {
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');

    const res = await POST(makeRequest(VALID_BODY, `Bearer ${SECRET}`));

    expect(res.status).toBe(500);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'not_configured',
      detail: 'CONVEX_SERVICE_SECRET not configured',
    });
    expect(h.listLinkedCharactersMock).not.toHaveBeenCalled();
  });

  it('returns a 401 problem for a missing bearer token', async () => {
    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'unauthenticated',
    });
    expect(h.listLinkedCharactersMock).not.toHaveBeenCalled();
  });

  it('returns a 400 problem for an invalid body', async () => {
    const res = await POST(makeRequest({}, `Bearer ${SECRET}`));

    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_body',
    });
    expect(h.listLinkedCharactersMock).not.toHaveBeenCalled();
  });

  it('returns the linked-character sync projection without token material', async () => {
    h.listLinkedCharactersMock.mockResolvedValue([
      {
        characterId: 90000001,
        name: 'Alice',
        portraitUrl: 'https://images.evetech.net/characters/90000001/portrait',
        scope: null,
        hasRefreshToken: false,
        linkedAt: new Date(),
        corporationId: 98000001,
        affiliationRefreshedAt: new Date(),
      },
    ]);

    const res = await POST(makeRequest(VALID_BODY, `Bearer ${SECRET}`));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      characters: [
        {
          characterId: 90000001,
          name: 'Alice',
          hasRefreshToken: false,
          corporationId: 98000001,
        },
      ],
    });
    expect(body.characters[0]).not.toHaveProperty('scope');
    expect(body.characters[0]).not.toHaveProperty('refreshToken');
    expect(h.listLinkedCharactersMock).toHaveBeenCalledWith('user-1');
    expect(h.afterMock).not.toHaveBeenCalled();
  });
});
