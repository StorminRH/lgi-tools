import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Admin force-unlink. Mock auth + the query layer so these exercise the admin
// gate, the ownership + last-character guards, the re-point, and the redirect
// without a DB.

const ADMIN_SESSION = {
  user: { id: 'admin-1' },
  characterId: 1,
  isAdmin: true,
};

const getSessionMock = vi.fn();
const accountBelongsToUserMock = vi.fn();
const deleteLinkedCharacterMock = vi.fn();
const listLinkedCharactersMock = vi.fn();
const getStoredActiveCharacterIdMock = vi.fn();
const repointActiveToOldestMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/features/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/features/auth/queries', () => ({
  accountBelongsToUser: (u: string, c: number) => accountBelongsToUserMock(u, c),
  deleteLinkedCharacter: (u: string, c: number) => deleteLinkedCharacterMock(u, c),
  listLinkedCharacters: (u: string) => listLinkedCharactersMock(u),
  getStoredActiveCharacterId: (u: string) => getStoredActiveCharacterIdMock(u),
  repointActiveToOldest: (u: string) => repointActiveToOldestMock(u),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { POST } from './route';

function buildRequest(form: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/characters/unlink', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

const TWO_CHARS = [{ characterId: 100 }, { characterId: 200 }];

describe('POST /api/admin/characters/unlink', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    accountBelongsToUserMock.mockReset();
    deleteLinkedCharacterMock.mockReset();
    listLinkedCharactersMock.mockReset();
    getStoredActiveCharacterIdMock.mockReset();
    repointActiveToOldestMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('returns 403 for a non-admin', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    const res = await POST(buildRequest({ userId: 'eve-user-2', characterId: '200' }));
    expect(res.status).toBe(403);
    expect(deleteLinkedCharacterMock).not.toHaveBeenCalled();
  });

  it('returns 400 on a malformed form', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(buildRequest({ userId: 'eve-user-2' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the character is not linked to that user', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(false);
    const res = await POST(buildRequest({ userId: 'eve-user-2', characterId: '999' }));
    expect(res.status).toBe(404);
    expect(deleteLinkedCharacterMock).not.toHaveBeenCalled();
  });

  it('refuses to remove the user\'s last character', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    listLinkedCharactersMock.mockResolvedValue([{ characterId: 100 }]);
    const res = await POST(buildRequest({ userId: 'eve-user-2', characterId: '100' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toContain('error=last_character');
    expect(deleteLinkedCharacterMock).not.toHaveBeenCalled();
  });

  it('unlinks and re-points the active character when it was the one removed', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    deleteLinkedCharacterMock.mockResolvedValue(true);
    getStoredActiveCharacterIdMock.mockResolvedValue(100);
    const res = await POST(buildRequest({ userId: 'eve-user-2', characterId: '100' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe('http://localhost:3000/admin/access/eve-user-2');
    expect(deleteLinkedCharacterMock).toHaveBeenCalledWith('eve-user-2', 100);
    expect(repointActiveToOldestMock).toHaveBeenCalledWith('eve-user-2');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-point when the removed character was not active', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    deleteLinkedCharacterMock.mockResolvedValue(true);
    getStoredActiveCharacterIdMock.mockResolvedValue(100);
    const res = await POST(buildRequest({ userId: 'eve-user-2', characterId: '200' }));
    expect(res.status).toBe(303);
    expect(repointActiveToOldestMock).not.toHaveBeenCalled();
  });
});
