import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  getPreferencesForUserMock: vi.fn(),
  upsertPreferenceMock: vi.fn(),
  logUsageEventMock: vi.fn(),
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
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEventMock(...args),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const ROUTE = '/api/preferences';

const VALID_BODY = { key: 'sites.view', value: 'table' };

describe('POST /api/preferences', () => {
  beforeEach(() => {
    h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
    h.getPreferencesForUserMock.mockReset();
    h.upsertPreferenceMock.mockReset().mockResolvedValue(undefined);
    h.logUsageEventMock.mockReset().mockResolvedValue(undefined);
  });

  it('returns 401 for an anonymous caller', async () => {
    h.requireUserIdMock.mockResolvedValue({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });

    const res = await POST(postJson(ROUTE, VALID_BODY));

    expect(res.status).toBe(401);
    expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(postJson(ROUTE, '{not valid json'));

    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_json',
      detail: 'Invalid JSON',
    });
    expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown preference key', async () => {
    const res = await POST(postJson(ROUTE, { key: 'sites.theme', value: 'dark' }));

    expect(res.status).toBe(400);
    expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the value does not match the key', async () => {
    const res = await POST(postJson(ROUTE, { key: 'sites.view', value: 'grid' }));

    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_value',
      detail: 'invalid value for key',
    });
    expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
  });

  it('upserts the caller preference and returns 204', async () => {
    const res = await POST(postJson(ROUTE, VALID_BODY, { origin: 'http://localhost:3000' }));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(h.upsertPreferenceMock).toHaveBeenCalledWith('user-1', 'sites.view', 'table');
  });

});
