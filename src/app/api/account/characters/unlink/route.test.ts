import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const SESSION = sessionFixture();

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const unlinkAccountMock = vi.fn();
const listLinkedCharactersMock = vi.fn();
const repointActiveToOldestMock = vi.fn();
const getStoredActiveCharacterIdMock = vi.fn();
const logUsageEventMock = vi.fn();
const getOwnedMapIdsMock = vi.fn();
const enqueueAffectedMapAccessChangesMock = vi.fn();
const projectMapAccessMock = vi.fn();
const teardownMapAccessProjectionMock = vi.fn();
const purgeUserMapAccessProjectionMock = vi.fn();
const revokeUserMapClaimsMock = vi.fn();
const eraseNetWorthHistoryMock = vi.fn();
vi.mock('@/features/net-worth/purge', () => ({
  eraseNetWorthHistoryForCharacter: (...args: unknown[]) => eraseNetWorthHistoryMock(...args),
}));

vi.mock('@/composition/auth', () => ({
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
  getOwnedMapIds: (userId: string) => getOwnedMapIdsMock(userId),
  enqueueAffectedMapAccessChanges: (characterId: number) =>
    enqueueAffectedMapAccessChangesMock(characterId),
  getGrantedMapIdsForCharacter: async () => ['map-1'],
}));

vi.mock('@/composition/map-access-projection', () => ({
  projectMapAccess: (mapId: string) => projectMapAccessMock(mapId),
  teardownMapAccessProjection: (mapId: string) => teardownMapAccessProjectionMock(mapId),
  purgeUserMapAccessProjection: (userId: string) => purgeUserMapAccessProjectionMock(userId),
  revokeUserMapClaims: (...args: unknown[]) => revokeUserMapClaimsMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

const teardownLocationTrackingMock = vi.hoisted(() => vi.fn());
vi.mock('@/data/location-tracking/purge', () => ({
  teardownLocationTracking: (...args: unknown[]) => teardownLocationTrackingMock(...args),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { postForm } from '@/lib/__tests__/route-requests';
import { POST } from './route';

const ROUTE = '/api/account/characters/unlink';

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
    getOwnedMapIdsMock.mockReset();
    enqueueAffectedMapAccessChangesMock.mockReset();
    projectMapAccessMock.mockReset();
    teardownMapAccessProjectionMock.mockReset();
    purgeUserMapAccessProjectionMock.mockReset();
    revokeUserMapClaimsMock.mockReset().mockResolvedValue(undefined);
    eraseNetWorthHistoryMock.mockReset().mockResolvedValue(undefined);
    teardownLocationTrackingMock.mockReset().mockResolvedValue(undefined);
    logUsageEventMock.mockResolvedValue(undefined);
    getOwnedMapIdsMock.mockResolvedValue([]);
    enqueueAffectedMapAccessChangesMock.mockResolvedValue([]);
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
    expect((await POST(postForm(ROUTE, { characterId: '200' }))).status).toBe(401);

    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue([{ characterId: 100 }]);
    const last = await POST(postForm(ROUTE, { characterId: '100' }));
    expect(last.status).toBe(303);
    expect(locationOf(last)).toContain('error=last_character');

    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    const notLinked = await POST(postForm(ROUTE, { characterId: '999' }));
    expect(locationOf(notLinked)).toContain('error=not_linked');
    expect(unlinkAccountMock).not.toHaveBeenCalled();
  });

  it('unlinks and re-points only when the removed character was active', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    getStoredActiveCharacterIdMock.mockResolvedValue(100);
    unlinkAccountMock.mockResolvedValue({ status: true });

    const active = await POST(postForm(ROUTE, { characterId: '100' }));
    expect(active.status).toBe(303);
    expect(eraseNetWorthHistoryMock).toHaveBeenCalledWith('eve-user-1', 100);
    expect(locationOf(active)).toBe('http://localhost:3000/settings/characters');
    expect(unlinkAccountMock).toHaveBeenCalledWith({
      body: { providerId: 'eve', accountId: '100' },
      headers: expect.any(Headers),
    });
    expect(revokeUserMapClaimsMock).toHaveBeenCalledWith('eve-user-1', []);
    expect(enqueueAffectedMapAccessChangesMock).toHaveBeenCalledWith(100);
    expect(enqueueAffectedMapAccessChangesMock.mock.invocationCallOrder[0]).toBeLessThan(
      revokeUserMapClaimsMock.mock.invocationCallOrder[0]!,
    );
    expect(revokeUserMapClaimsMock.mock.invocationCallOrder[0]).toBeLessThan(
      unlinkAccountMock.mock.invocationCallOrder[0]!,
    );
    expect(teardownLocationTrackingMock).toHaveBeenCalledWith('eve-user-1', 100);
    expect(repointActiveToOldestMock).toHaveBeenCalledWith('eve-user-1');
    expect(logUsageEventMock).toHaveBeenCalledTimes(1);

    unlinkAccountMock.mockClear();
    repointActiveToOldestMock.mockClear();
    enqueueAffectedMapAccessChangesMock.mockClear();
    teardownLocationTrackingMock.mockClear();
    logUsageEventMock.mockClear();
    const inactive = await POST(postForm(ROUTE, { characterId: '200' }));
    expect(inactive.status).toBe(303);
    expect(repointActiveToOldestMock).not.toHaveBeenCalled();
  });

  it('finishes location and active-character cleanup before reporting a history-erasure failure', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    getStoredActiveCharacterIdMock.mockResolvedValue(100);
    unlinkAccountMock.mockResolvedValue({ status: true });
    const failure = new Error('history deletion failed');
    eraseNetWorthHistoryMock.mockRejectedValueOnce(failure);
    await expect(POST(postForm(ROUTE, { characterId: '100' }))).rejects.toBe(failure);
    expect(teardownLocationTrackingMock).toHaveBeenCalledWith('eve-user-1', 100);
    expect(repointActiveToOldestMock).toHaveBeenCalledWith('eve-user-1');
  });

  it('maps an unlinkAccount failure to a clean error redirect (not a 500)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    unlinkAccountMock.mockRejectedValue(new Error('boom'));
    const res = await POST(postForm(ROUTE, { characterId: '200' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toContain('error=unlink_failed');
    expect(repointActiveToOldestMock).not.toHaveBeenCalled();
    expect(enqueueAffectedMapAccessChangesMock.mock.calls).toEqual([[200], [200]]);
    expect(enqueueAffectedMapAccessChangesMock.mock.invocationCallOrder[1]).toBeGreaterThan(
      unlinkAccountMock.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps the character linked when Convex revocation fails', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    enqueueAffectedMapAccessChangesMock.mockResolvedValueOnce([{ mapId: 'map-1', version: 'v1' }]);
    revokeUserMapClaimsMock.mockRejectedValue(new Error('Convex unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(postForm(ROUTE, { characterId: '100' }));

    expect(locationOf(response)).toContain('error=unlink_failed');
    expect(revokeUserMapClaimsMock).toHaveBeenCalledWith('eve-user-1', ['map-1']);
    expect(unlinkAccountMock).not.toHaveBeenCalled();
    expect(repointActiveToOldestMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('keeps the character linked when queuing the affected maps fails', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    getStoredActiveCharacterIdMock.mockResolvedValue(100);
    unlinkAccountMock.mockResolvedValue({ status: true });
    enqueueAffectedMapAccessChangesMock.mockRejectedValue(new Error('neon enqueue failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(postForm(ROUTE, { characterId: '100' }));

    expect(res.status).toBe(303);
    expect(locationOf(res)).toContain('error=unlink_failed');
    expect(unlinkAccountMock).not.toHaveBeenCalled();
    expect(repointActiveToOldestMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
