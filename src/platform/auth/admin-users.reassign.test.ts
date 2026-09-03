import { beforeEach, describe, expect, it, vi } from 'vitest';

const { chain, state } = vi.hoisted(() => {
  const state = {
    results: [] as unknown[],
    calls: { delete: 0, update: 0 },
  };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const method of ['set', 'where', 'select', 'from', 'limit', 'orderBy']) {
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
  runAfterCharacterLinkChanged: vi.fn().mockResolvedValue(undefined),
};

import { reassignCharacter } from './admin-users';

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
  runners.runBeforeUserDelete.mockReset().mockResolvedValue(undefined);
  runners.runAfterCharacterLinkChanged.mockReset().mockResolvedValue(undefined);
});

describe('reassignCharacter', () => {
  it('deletes the source user when moving its last character', async () => {
    state.results = [undefined, [], undefined];
    const out = await reassignCharacter({
      characterId: 100,
      fromUserId: 'eve-user-2',
      toUserId: 'admin-1',
      runners,
    });
    expect(out).toEqual({ sourceDeleted: true });
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
    state.results = [undefined, []];

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

});
