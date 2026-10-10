import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, state, reset } = await vi.hoisted(async () => {
  const { createFakeQueryChain } = await import('@/db/__tests__/support/fake-query-chain');
  return createFakeQueryChain();
});

vi.mock('@/db', () => ({ db: chain, directClient: chain, resolveLockConnectionUrl: () => undefined }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => chain }));
vi.mock('./deletion-jobs', async (importOriginal) => ({
  ...await importOriginal<typeof import('./deletion-jobs')>(),
  usersHavePendingDeletion: vi.fn().mockResolvedValue(false),
}));

const runners = {
  runBeforeUserDelete: vi.fn().mockResolvedValue(undefined),
  runBeforeCharacterUnlink: vi.fn().mockResolvedValue([]),
  runAfterFailedCharacterUnlink: vi.fn().mockResolvedValue(undefined),
  runAfterCharacterUnlink: vi.fn().mockResolvedValue(undefined),
  runAfterCharacterLinkChanged: vi.fn().mockResolvedValue(undefined),
};

import { deleteLinkedCharacter, reassignCharacter } from './admin-users';

// withLockedUsers awaits a SELECT ... FOR UPDATE before the change runs.
const lockedSource = [{ id: 'eve-user-2' }];
const lockedPair = [{ id: 'admin-1' }, { id: 'eve-user-2' }];

beforeEach(() => {
  reset();
  runners.runBeforeUserDelete.mockReset().mockResolvedValue(undefined);
  runners.runBeforeCharacterUnlink.mockReset().mockResolvedValue([]);
  runners.runAfterFailedCharacterUnlink.mockReset().mockResolvedValue(undefined);
  runners.runAfterCharacterUnlink.mockReset().mockResolvedValue(undefined);
  runners.runAfterCharacterLinkChanged.mockReset().mockResolvedValue(undefined);
});

it('does not delete an admin-unlinked character when revocation fails', async () => {
  const failure = new Error('revocation unavailable');
  runners.runBeforeCharacterUnlink.mockRejectedValueOnce(failure);
  await expect(deleteLinkedCharacter('eve-user-2', 100, runners)).rejects.toBe(failure);
  expect(state.calls.delete).toBe(0);
  expect(runners.runAfterCharacterLinkChanged).not.toHaveBeenCalled();
});

it('restores claims when admin unlink finds no matching account', async () => {
  state.results = [lockedSource, []];
  await expect(deleteLinkedCharacter('eve-user-2', 100, runners)).resolves.toBe(false);
  expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
  expect(runners.runAfterCharacterLinkChanged).not.toHaveBeenCalled();
});

it('restores claims when admin unlink delete fails', async () => {
  const failure = new Error('Neon unavailable');
  state.results = [lockedSource, Promise.reject(failure)];
  await expect(deleteLinkedCharacter('eve-user-2', 100, runners)).rejects.toBe(failure);
  expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
});

describe('reassignCharacter', () => {
  it('deletes the source user when moving its last character', async () => {
    state.results = [lockedPair, [{ id: 'moved' }], [], [], lockedSource, [], undefined];
    const out = await reassignCharacter({
      characterId: 100,
      fromUserId: 'eve-user-2',
      toUserId: 'admin-1',
      runners,
    });
    expect(out).toEqual({ sourceDeleted: true });
    expect(runners.runBeforeCharacterUnlink).toHaveBeenCalledWith({
      userId: 'eve-user-2', characterId: 100,
    });
    expect(runners.runAfterCharacterUnlink).toHaveBeenCalledWith({
      userId: 'eve-user-2', characterId: 100, mapIds: [],
    });
    expect(state.calls.delete).toBe(1);
    expect(runners.runBeforeUserDelete).toHaveBeenCalledWith('eve-user-2');
    expect(runners.runAfterCharacterLinkChanged.mock.calls).toEqual([
      [{ userId: 'eve-user-2', characterId: 100 }],
      [{ userId: 'admin-1', characterId: 100 }],
    ]);
  });

  it('keeps the source user when required collaborative purge fails', async () => {
    const failure = new Error('map purge unavailable');
    runners.runBeforeUserDelete.mockRejectedValueOnce(failure);
    state.results = [lockedPair, [{ id: 'moved' }], [], []];

    await expect(
      reassignCharacter({
        characterId: 100,
        fromUserId: 'eve-user-2',
        toUserId: 'admin-1',
        runners,
      }),
    ).rejects.toBe(failure);
    expect(state.calls.delete).toBe(0);
    expect(runners.runAfterCharacterLinkChanged).not.toHaveBeenCalled();
  });

  it('does not move a character if its former map claims cannot be revoked', async () => {
    const failure = new Error('revocation unavailable');
    runners.runBeforeCharacterUnlink.mockRejectedValueOnce(failure);
    await expect(reassignCharacter({
      characterId: 100, fromUserId: 'eve-user-2', toUserId: 'admin-1', runners,
    })).rejects.toBe(failure);
    expect(state.calls.update).toBe(0);
    expect(runners.runAfterCharacterLinkChanged).not.toHaveBeenCalled();
  });

  it('restores claims when moving the account fails', async () => {
    const failure = new Error('Neon unavailable');
    state.results = [lockedPair, Promise.reject(failure)];
    await expect(reassignCharacter({
      characterId: 100, fromUserId: 'eve-user-2', toUserId: 'admin-1', runners,
    })).rejects.toBe(failure);
    expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
    expect(state.calls.delete).toBe(0);
  });

  it('restores claims when the compare-and-swap matches no account', async () => {
    state.results = [lockedPair, [], [], [], lockedSource, [], undefined];
    await expect(reassignCharacter({
      characterId: 100, fromUserId: 'eve-user-2', toUserId: 'admin-1', runners,
    })).resolves.toEqual({ sourceDeleted: true });
    expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
    expect(runners.runAfterCharacterLinkChanged.mock.calls).toEqual([[{ userId: 'eve-user-2', characterId: 100 }]]);
  });

});
