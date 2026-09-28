import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, state } = vi.hoisted(() => {
  const state = {
    results: [] as unknown[],
    calls: { delete: 0, update: 0 },
  };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const method of ['set', 'where', 'select', 'from', 'limit', 'orderBy', 'returning']) {
    chain[method] = () => chain;
  }
  chain.update = () => {
    state.calls.update += 1;
    return chain;
  };
  chain.delete = () => {
    state.calls.delete += 1;
    return chain;
  };
  return { chain, state };
});

vi.mock('@/db', () => ({ db: chain }));

const runners = {
  runBeforeUserDelete: vi.fn().mockResolvedValue(undefined),
  runBeforeCharacterUnlink: vi.fn().mockResolvedValue([]),
  runAfterFailedCharacterUnlink: vi.fn().mockResolvedValue(undefined),
  runAfterCharacterUnlink: vi.fn().mockResolvedValue(undefined),
  runAfterCharacterLinkChanged: vi.fn().mockResolvedValue(undefined),
};

import { deleteLinkedCharacter, reassignCharacter } from './admin-users';

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
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
  state.results = [[]];
  await expect(deleteLinkedCharacter('eve-user-2', 100, runners)).resolves.toBe(false);
  expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
  expect(runners.runAfterCharacterLinkChanged).not.toHaveBeenCalled();
});

it('restores claims when admin unlink delete fails', async () => {
  const failure = new Error('Neon unavailable');
  state.results = [Promise.reject(failure)];
  await expect(deleteLinkedCharacter('eve-user-2', 100, runners)).rejects.toBe(failure);
  expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
});

describe('reassignCharacter', () => {
  it('deletes the source user when moving its last character', async () => {
    state.results = [[{ id: 'moved' }], [], undefined];
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
    expect(runners.runAfterCharacterLinkChanged).toHaveBeenCalledWith({
      userId: 'eve-user-2',
      characterId: 100,
    });
  });

  it('keeps the source user when required collaborative purge fails', async () => {
    const failure = new Error('map purge unavailable');
    runners.runBeforeUserDelete.mockRejectedValueOnce(failure);
    state.results = [[{ id: 'moved' }], []];

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
    state.results = [Promise.reject(failure)];
    await expect(reassignCharacter({
      characterId: 100, fromUserId: 'eve-user-2', toUserId: 'admin-1', runners,
    })).rejects.toBe(failure);
    expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
    expect(state.calls.delete).toBe(0);
  });

  it('restores claims when the compare-and-swap matches no account', async () => {
    state.results = [[], [], undefined];
    await expect(reassignCharacter({
      characterId: 100, fromUserId: 'eve-user-2', toUserId: 'admin-1', runners,
    })).resolves.toEqual({ sourceDeleted: true });
    expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
  });

});
