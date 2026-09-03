import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SESSION = {
  user: { id: 'eve-user-1' },
  session: {},
  characterId: 100,
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
const getCharacterCorporationIdMock = vi.fn();
const getMapIdsWithCharacterGrantMock = vi.fn();
const getMapIdsWithCorporationGrantsMock = vi.fn();
const getOwnedMapIdsMock = vi.fn();
const projectMapAccessMock = vi.fn();
const teardownMapAccessProjectionMock = vi.fn();
const purgeUserMapAccessProjectionMock = vi.fn();

vi.mock('@/platform/auth/auth', () => ({
  auth: {
    api: {
      getSession: () => getSessionMock(),
      unlinkAccount: (args: unknown) => unlinkAccountMock(args),
    },
  },
}));

vi.mock('@/platform/auth/linked-characters', () => ({
  listLinkedCharacters: (u: string) => listLinkedCharactersMock(u),
  repointActiveToOldest: (u: string) => repointActiveToOldestMock(u),
  getStoredActiveCharacterId: (u: string) => getStoredActiveCharacterIdMock(u),
}));

vi.mock('@/data/maps/queries', () => ({
  getCharacterCorporationId: () => getCharacterCorporationIdMock(),
  getMapIdsWithCharacterGrant: (characterId: number) =>
    getMapIdsWithCharacterGrantMock(characterId),
  getMapIdsWithCorporationGrants: (ids: number[]) => getMapIdsWithCorporationGrantsMock(ids),
  getOwnedMapIds: (userId: string) => getOwnedMapIdsMock(userId),
}));

vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: (mapId: string) => projectMapAccessMock(mapId),
  teardownMapAccessProjection: (mapId: string) => teardownMapAccessProjectionMock(mapId),
  purgeUserMapAccessProjection: (userId: string) => purgeUserMapAccessProjectionMock(userId),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

const teardownLocationTrackingMock = vi.hoisted(() => vi.fn());
vi.mock('@/data/location-tracking/purge', () => ({
  teardownLocationTracking: (...args: unknown[]) => teardownLocationTrackingMock(...args),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

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
    getCharacterCorporationIdMock.mockReset();
    getMapIdsWithCharacterGrantMock.mockReset();
    getMapIdsWithCorporationGrantsMock.mockReset();
    getOwnedMapIdsMock.mockReset();
    projectMapAccessMock.mockReset();
    teardownMapAccessProjectionMock.mockReset();
    purgeUserMapAccessProjectionMock.mockReset();
    teardownLocationTrackingMock.mockReset().mockResolvedValue(undefined);
    logUsageEventMock.mockResolvedValue(undefined);
    getCharacterCorporationIdMock.mockResolvedValue(null);
    getMapIdsWithCharacterGrantMock.mockResolvedValue([]);
    getMapIdsWithCorporationGrantsMock.mockResolvedValue([]);
    getOwnedMapIdsMock.mockResolvedValue([]);
    projectMapAccessMock.mockResolvedValue({
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      outcome: 'applied',
    });
  });

  it('refuses anonymous callers, the last character, and a character not linked to the caller', async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await POST(buildRequest({ characterId: '200' }))).status).toBe(401);

    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue([{ characterId: 100 }]);
    const last = await POST(buildRequest({ characterId: '100' }));
    expect(last.status).toBe(303);
    expect(locationOf(last)).toContain('error=last_character');

    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    const notLinked = await POST(buildRequest({ characterId: '999' }));
    expect(locationOf(notLinked)).toContain('error=not_linked');
    expect(unlinkAccountMock).not.toHaveBeenCalled();
  });

  it('unlinks and re-points only when the removed character was active', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    getStoredActiveCharacterIdMock.mockResolvedValue(100);
    unlinkAccountMock.mockResolvedValue({ status: true });

    const active = await POST(buildRequest({ characterId: '100' }));
    expect(active.status).toBe(303);
    expect(locationOf(active)).toBe('http://localhost:3000/characters');
    expect(unlinkAccountMock).toHaveBeenCalledWith({
      body: { providerId: 'eve', accountId: '100' },
      headers: expect.any(Headers),
    });
    expect(getMapIdsWithCharacterGrantMock).toHaveBeenCalledWith(100);
    expect(teardownLocationTrackingMock).toHaveBeenCalledWith('eve-user-1', 100);
    expect(repointActiveToOldestMock).toHaveBeenCalledWith('eve-user-1');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);

    unlinkAccountMock.mockClear();
    repointActiveToOldestMock.mockClear();
    getMapIdsWithCharacterGrantMock.mockClear();
    teardownLocationTrackingMock.mockClear();
    logUsageEventMock.mockClear();
    const inactive = await POST(buildRequest({ characterId: '200' }));
    expect(inactive.status).toBe(303);
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
    expect(getMapIdsWithCharacterGrantMock).not.toHaveBeenCalled();
  });

  it('keeps unlink success and repoint when map enumeration fails', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    getStoredActiveCharacterIdMock.mockResolvedValue(100);
    unlinkAccountMock.mockResolvedValue({ status: true });
    getMapIdsWithCharacterGrantMock.mockRejectedValue(new Error('neon enumeration failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(buildRequest({ characterId: '100' }));

    expect(res.status).toBe(303);
    expect(locationOf(res)).toBe('http://localhost:3000/characters');
    expect(repointActiveToOldestMock).toHaveBeenCalledWith('eve-user-1');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
