import { afterEach, beforeEach, expect, test, vi } from 'vitest';
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
vi.mock('@/composition/map-affiliation-access', () => ({
  refreshAffiliationsAndReconcile: h.refreshAffiliationsMock,
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
  vi.restoreAllMocks();
});

test('refuses missing secret, missing bearer, and invalid body, then returns the linked-character projection without token material', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('CONVEX_SERVICE_SECRET', '');
  const misconfigured = await POST(makeRequest(VALID_BODY, `Bearer ${SECRET}`));
  expect(misconfigured.status).toBe(500);
  expect(problemBodySchema.parse(await misconfigured.json())).toMatchObject({
    code: 'not_configured',
    detail: 'service authentication is not configured',
  });
  expect(h.listLinkedCharactersMock).not.toHaveBeenCalled();

  vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
  const unauthenticated = await POST(makeRequest(VALID_BODY));
  expect(unauthenticated.status).toBe(401);
  expect(problemBodySchema.parse(await unauthenticated.json())).toMatchObject({
    code: 'unauthenticated',
  });
  expect(h.listLinkedCharactersMock).not.toHaveBeenCalled();

  const invalid = await POST(makeRequest({}, `Bearer ${SECRET}`));
  expect(invalid.status).toBe(400);
  expect(problemBodySchema.parse(await invalid.json())).toMatchObject({
    code: 'invalid_body',
  });
  expect(h.listLinkedCharactersMock).not.toHaveBeenCalled();

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
