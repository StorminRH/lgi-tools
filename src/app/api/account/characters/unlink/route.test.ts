import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The route removes a linked character and re-points the active one if needed.
// Mock auth + the query layer so these exercise the last-character guard, the
// re-point, and the error mapping without a DB or a real EVE call.

const SESSION = {
  user: { id: 'eve-user-1' },
  session: {},
  characterId: 100, // active character
  name: 'Alice',
  portraitUrl: 'a',
  role: 'USER' as const,
  isAdmin: false,
};

const getSessionMock = vi.fn();
const unlinkAccountMock = vi.fn();
const listLinkedCharactersMock = vi.fn();
const repointActiveToOldestMock = vi.fn();
const getStoredActiveCharacterIdMock = vi.fn();
const logUsageEventMock = vi.fn();

vi.mock('@/features/auth/auth', () => ({
  auth: {
    api: {
      getSession: () => getSessionMock(),
      unlinkAccount: (args: unknown) => unlinkAccountMock(args),
    },
  },
}));

vi.mock('@/features/auth/linked-characters', () => ({
  listLinkedCharacters: (u: string) => listLinkedCharactersMock(u),
  repointActiveToOldest: (u: string) => repointActiveToOldestMock(u),
  getStoredActiveCharacterId: (u: string) => getStoredActiveCharacterIdMock(u),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

// Static import — the mocks above are hoisted, and the route module holds no
// per-test state (only the mocked functions vary, reset in beforeEach), so a
// single import avoids the heavy per-test re-import the resetModules pattern costs.
import { POST } from './route';

function buildRequest(form: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/characters/unlink', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
}

const TWO_CHARS = [{ characterId: 100 }, { characterId: 200 }];

function locationOf(res: Response): string {
  return res.headers.get('location') ?? '';
}

describe('POST /api/account/characters/unlink', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    unlinkAccountMock.mockReset();
    listLinkedCharactersMock.mockReset();
    repointActiveToOldestMock.mockReset();
    getStoredActiveCharacterIdMock.mockReset();
    logUsageEventMock.mockReset();
    logUsageEventMock.mockResolvedValue(undefined);
  });

  it('returns 401 when there is no session', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await POST(buildRequest({ characterId: '200' }));
    expect(res.status).toBe(401);
    expect(unlinkAccountMock).not.toHaveBeenCalled();
  });

  it('refuses to unlink the only/last character', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue([{ characterId: 100 }]);
    const res = await POST(buildRequest({ characterId: '100' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toContain('error=last_character');
    expect(unlinkAccountMock).not.toHaveBeenCalled();
  });

  it('refuses a character not linked to the caller', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    const res = await POST(buildRequest({ characterId: '999' }));
    expect(locationOf(res)).toContain('error=not_linked');
    expect(unlinkAccountMock).not.toHaveBeenCalled();
  });

  it('unlinks and re-points the active character to the oldest remaining one', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    getStoredActiveCharacterIdMock.mockResolvedValue(100); // active = the char being unlinked
    unlinkAccountMock.mockResolvedValue({ status: true });
    const res = await POST(buildRequest({ characterId: '100' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe('http://localhost:3000/characters');
    expect(unlinkAccountMock).toHaveBeenCalledWith({
      body: { providerId: 'eve', accountId: '100' },
      headers: expect.any(Headers),
    });
    expect(repointActiveToOldestMock).toHaveBeenCalledWith('eve-user-1');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-point when unlinking a non-active character', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    getStoredActiveCharacterIdMock.mockResolvedValue(100); // active = 100, unlinking 200
    unlinkAccountMock.mockResolvedValue({ status: true });
    const res = await POST(buildRequest({ characterId: '200' }));
    expect(res.status).toBe(303);
    expect(repointActiveToOldestMock).not.toHaveBeenCalled();
  });

  it('maps an unlinkAccount failure to a clean error redirect (not a 500)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    unlinkAccountMock.mockRejectedValue(new Error('boom'));
    const res = await POST(buildRequest({ characterId: '200' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toContain('error=unlink_failed');
    expect(repointActiveToOldestMock).not.toHaveBeenCalled();
  });
});
