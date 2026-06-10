import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Admin force-logout. Mock auth + the query layer so these exercise the admin
// gate, the self-guard, the not-found check, and the redirect without a DB.

const ADMIN_SESSION = {
  user: { id: 'admin-1' },
  characterId: 1,
  isAdmin: true,
};

const getSessionMock = vi.fn();
const getUserByIdMock = vi.fn();
const revokeUserSessionsMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/features/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/features/auth/queries', () => ({
  getUserById: (u: string) => getUserByIdMock(u),
  revokeUserSessions: (u: string) => revokeUserSessionsMock(u),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { POST } from './route';

function buildRequest(form: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/sessions/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

describe('POST /api/admin/sessions/revoke', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getUserByIdMock.mockReset();
    revokeUserSessionsMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('returns 403 for a non-admin', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    const res = await POST(buildRequest({ userId: 'eve-user-2' }));
    expect(res.status).toBe(403);
    expect(revokeUserSessionsMock).not.toHaveBeenCalled();
  });

  it('returns 400 on a malformed form', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
  });

  it('refuses to force-logout your own session', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(buildRequest({ userId: 'admin-1' }));
    expect(res.status).toBe(400);
    expect(revokeUserSessionsMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    getUserByIdMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ userId: 'eve-user-2' }));
    expect(res.status).toBe(404);
    expect(revokeUserSessionsMock).not.toHaveBeenCalled();
  });

  it('revokes the user\'s sessions and redirects to their detail page', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    getUserByIdMock.mockResolvedValue({ userId: 'eve-user-2', characterId: 200 });
    revokeUserSessionsMock.mockResolvedValue(3);
    const res = await POST(buildRequest({ userId: 'eve-user-2' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe('http://localhost:3000/admin/access/eve-user-2');
    expect(revokeUserSessionsMock).toHaveBeenCalledWith('eve-user-2');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });
});
