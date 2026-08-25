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

vi.mock('@/platform/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/admin-users', () => ({
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

  it('refuses non-admins, a malformed form, self-logout, and a missing user', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    expect((await POST(buildRequest({ userId: 'eve-user-2' }))).status).toBe(403);

    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    expect((await POST(buildRequest({}))).status).toBe(400);
    expect((await POST(buildRequest({ userId: 'admin-1' }))).status).toBe(400);

    getUserByIdMock.mockResolvedValue(null);
    expect((await POST(buildRequest({ userId: 'eve-user-2' }))).status).toBe(404);
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
