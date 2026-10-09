import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { settle } from '@/lib/__tests__/hook-runtime';

vi.mock('@/composition/account-lifecycle/tracking-merge-retry', () => ({
  reconcileTrackingMerges: vi.fn().mockResolvedValue({ processed: 0, failed: 0 }),
}));

const mocks = vi.hoisted(() => ({
  hasAuthorizationWork: vi.fn(),
  suspendOverdueAuthorizations: vi.fn(),
  listAuthorizationAccessChanges: vi.fn(),
  acknowledgeAuthorizationAccessChange: vi.fn(),
  listDueAuthorizations: vi.fn(),
  claimAuthorization: vi.fn(),
  getFreshAccessTokenForCharacter: vi.fn(),
  enqueueAffectedMapAccessChanges: vi.fn(),
  readPendingMapAccessChanges: vi.fn(),
  acknowledgeMapAccessChanges: vi.fn(),
  projectMapAccess: vi.fn(),
  refreshAffiliationsWithOutcome: vi.fn(),
}));
vi.mock('@/platform/auth/authorization-store', () => ({
  hasAuthorizationWork: mocks.hasAuthorizationWork,
  suspendOverdueAuthorizations: mocks.suspendOverdueAuthorizations,
  listAuthorizationAccessChanges: mocks.listAuthorizationAccessChanges,
  acknowledgeAuthorizationAccessChange: mocks.acknowledgeAuthorizationAccessChange,
  listDueAuthorizations: mocks.listDueAuthorizations,
  claimAuthorization: mocks.claimAuthorization,
}));
vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: mocks.getFreshAccessTokenForCharacter,
}));
vi.mock('@/data/maps/queries', () => ({
  enqueueAffectedMapAccessChanges: mocks.enqueueAffectedMapAccessChanges,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  MAX_PENDING_BATCH: 100,
  readPendingMapAccessChanges: mocks.readPendingMapAccessChanges,
  acknowledgeMapAccessChanges: mocks.acknowledgeMapAccessChanges,
}));
vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome,
}));
vi.mock('./map-access-projection', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  projectMapAccess: mocks.projectMapAccess,
}));

import { checkCharacterAuthorizations } from './character-authorization';

const change = { id: 'alice-account', characterId: '42', changedAt: new Date('2026-09-28T12:00:00Z') };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.hasAuthorizationWork.mockResolvedValue(true);
  mocks.listAuthorizationAccessChanges.mockResolvedValue([]);
  mocks.listDueAuthorizations.mockResolvedValue([]);
  mocks.readPendingMapAccessChanges.mockResolvedValue([]);
  mocks.claimAuthorization.mockResolvedValue(true);
  mocks.projectMapAccess.mockResolvedValue({ outcome: 'applied' });
});

afterEach(() => { vi.restoreAllMocks(); });

it('persists access changes before acknowledging them, then drains the map outbox', async () => {
  mocks.listAuthorizationAccessChanges.mockResolvedValueOnce([change]);
  await checkCharacterAuthorizations('alice');
  expect(mocks.enqueueAffectedMapAccessChanges).toHaveBeenCalledWith(42);
  expect(mocks.acknowledgeAuthorizationAccessChange).toHaveBeenCalledWith(change.id, change.changedAt);
  expect(mocks.enqueueAffectedMapAccessChanges.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.acknowledgeAuthorizationAccessChange.mock.invocationCallOrder[0]!,
  );
  expect(mocks.acknowledgeAuthorizationAccessChange.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.readPendingMapAccessChanges.mock.invocationCallOrder[0]!,
  );
});

it('retains the access-change marker when persisting the outbox fails', async () => {
  mocks.listAuthorizationAccessChanges.mockResolvedValueOnce([change]);
  mocks.enqueueAffectedMapAccessChanges.mockRejectedValueOnce(new Error('database unavailable'));
  await expect(checkCharacterAuthorizations('alice')).rejects.toThrow('database unavailable');
  expect(mocks.acknowledgeAuthorizationAccessChange).not.toHaveBeenCalled();
  expect(mocks.getFreshAccessTokenForCharacter).not.toHaveBeenCalled();
});

it('publishes newly confirmed invalid authorization in the same worker run', async () => {
  mocks.listDueAuthorizations.mockResolvedValue([{ id: change.id, characterId: '42' }]);
  mocks.getFreshAccessTokenForCharacter.mockImplementation(async () => {
    mocks.listAuthorizationAccessChanges.mockResolvedValueOnce([change]);
    return { kind: 'reauth_required' };
  });
  await checkCharacterAuthorizations('alice');
  expect(mocks.getFreshAccessTokenForCharacter).toHaveBeenCalledWith(42, { forceRefresh: true });
  expect(mocks.getFreshAccessTokenForCharacter.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.enqueueAffectedMapAccessChanges.mock.invocationCallOrder[0]!,
  );
  expect(mocks.enqueueAffectedMapAccessChanges.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.readPendingMapAccessChanges.mock.invocationCallOrder[1]!,
  );
});

it('stops claiming due characters once a claim fails and leaves the run failed', async () => {
  const due = Array.from({ length: 8 }, (_, i) => ({ id: `account-${i}`, characterId: String(100 + i) }));
  mocks.listDueAuthorizations.mockResolvedValue(due);
  mocks.claimAuthorization.mockImplementation(async (id: string) => {
    if (id === 'account-0') throw new Error('authorization store unavailable');
    return true;
  });

  await expect(checkCharacterAuthorizations('alice')).rejects.toThrow('authorization store unavailable');
  await settle();

  expect(mocks.claimAuthorization.mock.calls.map(([id]) => id)).toEqual([
    'account-0',
    'account-1',
    'account-2',
    'account-3',
  ]);
  expect(mocks.getFreshAccessTokenForCharacter.mock.calls.map(([characterId]) => characterId)).toEqual([101, 102, 103]);
  expect(mocks.suspendOverdueAuthorizations).toHaveBeenCalledOnce();
});

it('checks queued access changes on a healthy visit without refreshing authorization', async () => {
  mocks.hasAuthorizationWork.mockResolvedValue(false);
  await checkCharacterAuthorizations('alice');
  expect(mocks.readPendingMapAccessChanges).toHaveBeenCalledOnce();
  expect(mocks.projectMapAccess).not.toHaveBeenCalled();
  expect(mocks.suspendOverdueAuthorizations).not.toHaveBeenCalled();
  expect(mocks.listDueAuthorizations).not.toHaveBeenCalled();
  expect(mocks.getFreshAccessTokenForCharacter).not.toHaveBeenCalled();
});

it('delivers a failed queued revocation on a later healthy visit', async () => {
  const pending = [{ mapId: 'revoked-map', version: 'revocation-version' }];
  mocks.hasAuthorizationWork.mockResolvedValue(false);
  mocks.readPendingMapAccessChanges.mockResolvedValue(pending);
  mocks.projectMapAccess.mockRejectedValueOnce(new Error('Convex unavailable'));
  silenceConsolePrefixes('error', ['[map-affiliation-access] projection retained for retry']);

  await checkCharacterAuthorizations('alice');
  expect(mocks.acknowledgeMapAccessChanges).toHaveBeenLastCalledWith([], pending);

  await checkCharacterAuthorizations('alice');
  expect(mocks.projectMapAccess).toHaveBeenCalledTimes(2);
  expect(mocks.projectMapAccess).toHaveBeenLastCalledWith('revoked-map', { timeoutMs: 4_000 });
  expect(mocks.acknowledgeMapAccessChanges).toHaveBeenLastCalledWith(pending, []);
  expect(mocks.listAuthorizationAccessChanges).not.toHaveBeenCalled();
  expect(mocks.acknowledgeAuthorizationAccessChange).not.toHaveBeenCalled();
  expect(mocks.suspendOverdueAuthorizations).not.toHaveBeenCalled();
  expect(mocks.listDueAuthorizations).not.toHaveBeenCalled();
  expect(mocks.getFreshAccessTokenForCharacter).not.toHaveBeenCalled();
  expect(mocks.refreshAffiliationsWithOutcome).not.toHaveBeenCalled();
});
