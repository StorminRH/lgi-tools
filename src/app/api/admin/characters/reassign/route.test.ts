import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Admin reassign. Mock auth + the query layer so these exercise the admin gate,
// the self-guard, the ownership check, and that the destination is fixed to the
// caller — without a DB.

const ADMIN_SESSION = {
  user: { id: 'admin-1' },
  characterId: 1,
  isAdmin: true,
};

const getSessionMock = vi.fn();
const accountBelongsToUserMock = vi.fn();
const reassignCharacterMock = vi.fn();
const reconcileAfterCharacterRemovalMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/features/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/features/auth/linked-characters', () => ({
  accountBelongsToUser: (u: string, c: number) => accountBelongsToUserMock(u, c),
}));

vi.mock('@/features/auth/admin-users', () => ({
  reassignCharacter: (args: unknown) => reassignCharacterMock(args),
}));

vi.mock('@/features/auth/account-purge', () => ({
  reconcileAfterCharacterRemoval: (userId: string, characterId: number) =>
    reconcileAfterCharacterRemovalMock(userId, characterId),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { POST } from './route';

function buildRequest(form: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/characters/reassign', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

describe('POST /api/admin/characters/reassign', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    accountBelongsToUserMock.mockReset();
    reassignCharacterMock.mockReset();
    reconcileAfterCharacterRemovalMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('returns 403 for a non-admin', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    const res = await POST(buildRequest({ fromUserId: 'eve-user-2', characterId: '200' }));
    expect(res.status).toBe(403);
    expect(reassignCharacterMock).not.toHaveBeenCalled();
  });

  it('returns 400 on a malformed form', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(buildRequest({ characterId: '200' }));
    expect(res.status).toBe(400);
  });

  it('refuses a no-op move onto the same account', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(buildRequest({ fromUserId: 'admin-1', characterId: '200' }));
    expect(res.status).toBe(400);
    expect(reassignCharacterMock).not.toHaveBeenCalled();
  });

  it('returns 404 when the character is not linked to the source user', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(false);
    const res = await POST(buildRequest({ fromUserId: 'eve-user-2', characterId: '200' }));
    expect(res.status).toBe(404);
    expect(reassignCharacterMock).not.toHaveBeenCalled();
  });

  it('moves the character onto the caller and redirects to the caller\'s detail page', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    reassignCharacterMock.mockResolvedValue({ sourceDeleted: true });
    const res = await POST(buildRequest({ fromUserId: 'eve-user-2', characterId: '200' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe('http://localhost:3000/admin/access/admin-1');
    expect(reassignCharacterMock).toHaveBeenCalledWith({
      characterId: 200,
      fromUserId: 'eve-user-2',
      toUserId: 'admin-1',
    });
    expect(reconcileAfterCharacterRemovalMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });

  it('rebinds the source identity after moving one of several characters', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    reassignCharacterMock.mockResolvedValue({ sourceDeleted: false });
    reconcileAfterCharacterRemovalMock.mockResolvedValue({ accountEmptied: false });

    const res = await POST(buildRequest({ fromUserId: 'eve-user-2', characterId: '200' }));

    expect(res.status).toBe(303);
    expect(reconcileAfterCharacterRemovalMock).toHaveBeenCalledWith('eve-user-2', 200);
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });
});
