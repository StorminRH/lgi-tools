import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  getPreferencesForUserMock: vi.fn(),
  upsertPreferenceMock: vi.fn(),
}));

vi.mock('@/features/auth/route-guards', () => ({
  requireUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/features/auth/session', () => ({
  getCurrentUserId: vi.fn(),
}));
vi.mock('@/data/preferences/queries', () => ({
  getPreferencesForUser: (...args: unknown[]) => h.getPreferencesForUserMock(...args),
  upsertPreference: (...args: unknown[]) => h.upsertPreferenceMock(...args),
}));

import type { NextRequest } from 'next/server';
import { POST } from './route';

function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost:3000/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const VALID_BODY = { key: 'sites.view', value: 'table' };

describe('POST /api/preferences', () => {
  beforeEach(() => {
    h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
    h.getPreferencesForUserMock.mockReset();
    h.upsertPreferenceMock.mockReset().mockResolvedValue(undefined);
  });

  it('returns 401 for an anonymous caller', async () => {
    h.requireUserIdMock.mockResolvedValue({
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(401);
    expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(makeRequest('{not valid json'));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid JSON');
    expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown preference key', async () => {
    const res = await POST(makeRequest({ key: 'sites.theme', value: 'dark' }));

    expect(res.status).toBe(400);
    expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the value does not match the key', async () => {
    const res = await POST(makeRequest({ key: 'sites.view', value: 'grid' }));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe('invalid value for key');
    expect(h.upsertPreferenceMock).not.toHaveBeenCalled();
  });

  it('upserts the caller preference and returns 204', async () => {
    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(h.upsertPreferenceMock).toHaveBeenCalledWith('user-1', 'sites.view', 'table');
  });
});
