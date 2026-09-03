import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/platform/auth/auth', () => ({
  auth: { api: { getSession: () => getSessionMock() } },
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  accountBelongsToUser: (u: string, c: number) => accountBelongsToUserMock(u, c),
  listLinkedCharacters: (u: string) => listLinkedCharactersMock(u),
  getStoredActiveCharacterId: (u: string) => getStoredActiveCharacterIdMock(u),
  repointActiveToOldest: (u: string) => repointActiveToOldestMock(u),
}));

vi.mock('@/platform/auth/admin-users', () => ({
  deleteLinkedCharacter: (...args: unknown[]) => deleteLinkedCharacterMock(...args),
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

  it('refuses non-admins, a malformed form, an unowned character, and the last character', async () => {
    getSessionMock.mockResolvedValue({ ...ADMIN_SESSION, isAdmin: false });
    expect(
      (await POST(buildRequest({ userId: 'eve-user-2', characterId: '200' }))).status,
    ).toBe(403);

    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    expect((await POST(buildRequest({ userId: 'eve-user-2' }))).status).toBe(400);

    accountBelongsToUserMock.mockResolvedValue(false);
    expect(
      (await POST(buildRequest({ userId: 'eve-user-2', characterId: '999' }))).status,
    ).toBe(404);

    accountBelongsToUserMock.mockResolvedValue(true);
    listLinkedCharactersMock.mockResolvedValue([{ characterId: 100 }]);
    const last = await POST(buildRequest({ userId: 'eve-user-2', characterId: '100' }));
    expect(last.status).toBe(303);
    expect(locationOf(last)).toContain('error=last_character');
    expect(deleteLinkedCharacterMock).not.toHaveBeenCalled();
  });

  it('unlinks and re-points only when the removed character was active', async () => {
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    accountBelongsToUserMock.mockResolvedValue(true);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    deleteLinkedCharacterMock.mockResolvedValue(true);
    getStoredActiveCharacterIdMock.mockResolvedValue(100);

    const active = await POST(buildRequest({ userId: 'eve-user-2', characterId: '100' }));
    expect(active.status).toBe(303);
    expect(locationOf(active)).toBe('http://localhost:3000/admin/access/eve-user-2');
    expect(deleteLinkedCharacterMock).toHaveBeenCalledWith(
      'eve-user-2',
      100,
      expect.objectContaining({
        runBeforeUserDelete: expect.any(Function),
        runAfterCharacterLinkChanged: expect.any(Function),
      }),
    );
    expect(repointActiveToOldestMock).toHaveBeenCalledWith('eve-user-2');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);

    repointActiveToOldestMock.mockClear();
    const inactive = await POST(buildRequest({ userId: 'eve-user-2', characterId: '200' }));
    expect(inactive.status).toBe(303);
    expect(repointActiveToOldestMock).not.toHaveBeenCalled();
  });
});
