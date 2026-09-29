import { beforeEach, expect, it, vi } from 'vitest';

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
}));
vi.mock('@/platform/auth/affiliation', () => ({}));

import { checkCharacterAuthorizations } from './character-authorization';

const change = { id: 'alice-account', characterId: '42', changedAt: new Date('2026-09-28T12:00:00Z') };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.hasAuthorizationWork.mockResolvedValue(true);
  mocks.listAuthorizationAccessChanges.mockResolvedValue([]);
  mocks.listDueAuthorizations.mockResolvedValue([]);
  mocks.readPendingMapAccessChanges.mockResolvedValue([]);
  mocks.claimAuthorization.mockResolvedValue(true);
});

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

it('skips work for healthy visits but lets cron drain previously queued map changes', async () => {
  mocks.hasAuthorizationWork.mockResolvedValue(false);
  await checkCharacterAuthorizations('alice');
  expect(mocks.readPendingMapAccessChanges).not.toHaveBeenCalled();
  expect(mocks.suspendOverdueAuthorizations).not.toHaveBeenCalled();
  expect(mocks.listDueAuthorizations).not.toHaveBeenCalled();
  await checkCharacterAuthorizations();
  expect(mocks.readPendingMapAccessChanges).toHaveBeenCalledOnce();
  expect(mocks.getFreshAccessTokenForCharacter).not.toHaveBeenCalled();
});
