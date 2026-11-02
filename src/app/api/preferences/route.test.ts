import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  getPreferencesForUserMock: vi.fn(),
  upsertPreferenceMock: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/composition/session', () => ({
  getCurrentUserId: vi.fn(),
}));
vi.mock('@/data/preferences/queries', () => ({
  getPreferencesForUser: (...args: unknown[]) => h.getPreferencesForUserMock(...args),
  upsertPreference: (...args: unknown[]) => h.upsertPreferenceMock(...args),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const ROUTE = '/api/preferences';

const VALID_BODY = { key: 'sites.view', value: 'table' };

function resetMocks() {
  h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.getPreferencesForUserMock.mockReset();
  h.upsertPreferenceMock.mockReset().mockResolvedValue(undefined);
}

test('POST /api/preferences refuses anonymous callers, malformed JSON, unknown keys and mismatched values before writing', async () => {
  resetMocks();
  h.requireUserIdMock.mockResolvedValueOnce({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });
  expect((await POST(postJson(ROUTE, VALID_BODY))).status).toBe(401);

  const malformed = await POST(postJson(ROUTE, '{not valid json'));
  expect(malformed.status).toBe(400);
  expect(problemBodySchema.parse(await malformed.json())).toMatchObject({ code: 'invalid_json' });

  expect((await POST(postJson(ROUTE, { key: 'sites.theme', value: 'dark' }))).status).toBe(400);

  const mismatched = await POST(postJson(ROUTE, { key: 'sites.view', value: 'grid' }));
  expect(mismatched.status).toBe(400);
  expect(problemBodySchema.parse(await mismatched.json())).toMatchObject({ code: 'invalid_value' });

  expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
});

test('POST /api/preferences upserts the caller preference and returns 204', async () => {
  resetMocks();
  const res = await POST(postJson(ROUTE, VALID_BODY, { origin: 'http://localhost:3000' }));

  expect(res.status).toBe(204);
  expect(await res.text()).toBe('');
  expect(h.upsertPreferenceMock).toHaveBeenCalledWith('user-1', 'sites.view', 'table');
});
