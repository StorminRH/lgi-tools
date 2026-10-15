import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  capabilityOutcomeMock,
  recordedCapabilityOutcomes,
} from '@/lib/__tests__/capability-outcomes';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { BetterAuthSession } from '@/composition/route-guards';

const SESSION = sessionFixture();

const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
const unlinkAccountMock = vi.fn();
const listLinkedCharactersMock = vi.fn();
const reconcileAfterCharacterRemovalMock = vi.fn();
const emitUsageEventMock = vi.fn();
const enqueueAffectedMapAccessChangesMock = vi.fn();
const projectMapAccessMock = vi.fn();
const teardownMapAccessProjectionMock = vi.fn();
const purgeUserMapAccessProjectionMock = vi.fn();
const revokeUserMapClaimsMock = vi.fn();
const eraseNetWorthHistoryMock = vi.fn();
const emitCostMetricMock = capabilityOutcomeMock();
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

vi.mock('@/platform/auth/linked-characters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/platform/auth/linked-characters')>()),
  listLinkedCharacters: (u: string) => listLinkedCharactersMock(u),
}));

vi.mock('@/platform/auth/account-purge', () => ({
  reconcileAfterCharacterRemoval: (...args: unknown[]) => reconcileAfterCharacterRemovalMock(...args),
}));

vi.mock('@/data/maps/queries', () => ({
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

vi.mock('@/data/telemetry/usage-events', () => ({
  emitUsageEvent: (scope: string, input: unknown) => emitUsageEventMock(scope, input),
}));

vi.mock('@/data/telemetry/cost-metrics', () => ({
  emitCostMetric: (action: string, metadata: Record<string, unknown>) =>
    emitCostMetricMock(action, metadata),
}));

const teardownLocationTrackingMock = vi.hoisted(() => vi.fn());
vi.mock('@/data/location-tracking/purge', () => ({
  teardownLocationTracking: (...args: unknown[]) => teardownLocationTrackingMock(...args),
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// The guard reads through getFullSession, which schedules the authorization check after the response.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
  connection: () => Promise.resolve(),
}));

import { postForm } from '@/lib/__tests__/route-requests';
import { identityProjectionRunners } from '@/composition/map-access-identity';
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
    reconcileAfterCharacterRemovalMock.mockReset().mockResolvedValue({ accountEmptied: false });
    emitUsageEventMock.mockReset();
    emitCostMetricMock.mockReset();
    enqueueAffectedMapAccessChangesMock.mockReset();
    projectMapAccessMock.mockReset();
    teardownMapAccessProjectionMock.mockReset();
    purgeUserMapAccessProjectionMock.mockReset();
    revokeUserMapClaimsMock.mockReset().mockResolvedValue(undefined);
    eraseNetWorthHistoryMock.mockReset().mockResolvedValue(undefined);
    teardownLocationTrackingMock.mockReset().mockResolvedValue(undefined);
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
    expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([
      { outcome: 'unauthenticated', code: 'unauthenticated' },
      { outcome: 'validation', code: 'last_character' },
      { outcome: 'validation', code: 'not_linked' },
    ]);
  });

  it('unlinks, then settles the account identity before the link-changed cleanup', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    unlinkAccountMock.mockResolvedValue({ status: true });

    const res = await POST(postForm(ROUTE, { characterId: '100' }));
    expect(res.status).toBe(303);
    expect(eraseNetWorthHistoryMock).toHaveBeenCalledWith('eve-user-1', 100);
    expect(locationOf(res)).toBe('http://localhost:3000/settings/characters');
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
    expect(reconcileAfterCharacterRemovalMock).toHaveBeenCalledExactlyOnceWith(
      'eve-user-1',
      100,
      identityProjectionRunners,
    );
    expect(unlinkAccountMock.mock.invocationCallOrder[0]).toBeLessThan(
      reconcileAfterCharacterRemovalMock.mock.invocationCallOrder[0]!,
    );
    expect(teardownLocationTrackingMock).toHaveBeenCalledWith('eve-user-1', 100);
    expect(reconcileAfterCharacterRemovalMock.mock.invocationCallOrder[0]).toBeLessThan(
      teardownLocationTrackingMock.mock.invocationCallOrder[0]!,
    );
    expect(emitUsageEventMock).toHaveBeenCalledExactlyOnceWith('account/characters/unlink', {
      action: 'character_unlink',
      characterId: SESSION.characterId,
      metadata: { userId: 'eve-user-1', unlinkedCharacterId: 100 },
    });
    expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([{ outcome: 'succeeded', code: 'ok' }]);
  });

  it('finishes identity and location cleanup before reporting a history-erasure failure', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    unlinkAccountMock.mockResolvedValue({ status: true });
    const failure = new Error('history deletion failed');
    eraseNetWorthHistoryMock.mockRejectedValueOnce(failure);
    await expect(POST(postForm(ROUTE, { characterId: '100' }))).rejects.toBe(failure);
    expect(reconcileAfterCharacterRemovalMock).toHaveBeenCalledWith('eve-user-1', 100, identityProjectionRunners);
    expect(teardownLocationTrackingMock).toHaveBeenCalledWith('eve-user-1', 100);
  });

  it('maps an unlinkAccount failure to a clean error redirect (not a 500)', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    unlinkAccountMock.mockRejectedValue(new Error('boom'));
    const errorSpy = silenceConsolePrefixes('error', ['[account/unlink] unlinkAccount failed']);
    const res = await POST(postForm(ROUTE, { characterId: '200' }));
    expect(res.status).toBe(303);
    expect(locationOf(res)).toContain('error=unlink_failed');
    expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([{ outcome: 'unexpected', code: 'unlink_failed' }]);
    expect(errorSpy).toHaveBeenCalledWith('[account/unlink] unlinkAccount failed', expect.any(Error));
    expect(reconcileAfterCharacterRemovalMock).not.toHaveBeenCalled();
    expect(enqueueAffectedMapAccessChangesMock.mock.calls).toEqual([[200], [200]]);
    expect(enqueueAffectedMapAccessChangesMock.mock.invocationCallOrder[1]).toBeGreaterThan(
      unlinkAccountMock.mock.invocationCallOrder[0]!,
    );
    errorSpy.mockRestore();
  });

  it('keeps the character linked when Convex revocation fails', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    enqueueAffectedMapAccessChangesMock.mockResolvedValueOnce([{ mapId: 'map-1', version: 'v1' }]);
    revokeUserMapClaimsMock.mockRejectedValue(new Error('Convex unavailable'));
    const errorSpy = silenceConsolePrefixes('error', [
      '[account/unlink] map access revocation failed',
    ]);

    const response = await POST(postForm(ROUTE, { characterId: '100' }));

    expect(locationOf(response)).toContain('error=unlink_failed');
    expect(recordedCapabilityOutcomes(emitCostMetricMock)).toEqual([{ outcome: 'unexpected', code: 'unlink_failed' }]);
    expect(revokeUserMapClaimsMock).toHaveBeenCalledWith('eve-user-1', ['map-1']);
    expect(errorSpy).toHaveBeenCalledWith('[account/unlink] map access revocation failed', expect.any(Error));
    expect(unlinkAccountMock).not.toHaveBeenCalled();
    expect(reconcileAfterCharacterRemovalMock).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('keeps the character linked when queuing the affected maps fails', async () => {
    getSessionMock.mockResolvedValue(SESSION);
    listLinkedCharactersMock.mockResolvedValue(TWO_CHARS);
    unlinkAccountMock.mockResolvedValue({ status: true });
    enqueueAffectedMapAccessChangesMock.mockRejectedValue(new Error('neon enqueue failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(postForm(ROUTE, { characterId: '100' }));

    expect(res.status).toBe(303);
    expect(locationOf(res)).toContain('error=unlink_failed');
    expect(unlinkAccountMock).not.toHaveBeenCalled();
    expect(reconcileAfterCharacterRemovalMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
