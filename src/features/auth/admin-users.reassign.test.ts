import { beforeEach, describe, expect, it, vi } from 'vitest';

// reassignCharacter's branch decision — delete the emptied source user, or keep
// it when it still owns other characters. The Drizzle calls are stubbed with a
// chainable thenable: every builder method returns the same object, and awaiting
// it resolves the next queued result (FIFO, one per `await` the helper runs).
// Built inside vi.hoisted so the (hoisted) vi.mock factory can reference it.
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

import { reassignCharacter } from './admin-users';

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
});

describe('reassignCharacter', () => {
  it('deletes the source user when moving its last character', async () => {
    // awaits: move account → select-remaining (empty) → delete user.
    state.results = [undefined, [], undefined];
    const out = await reassignCharacter({
      characterId: 100,
      fromUserId: 'eve-user-2',
      toUserId: 'admin-1',
    });
    expect(out).toEqual({ sourceDeleted: true });
    expect(state.calls.delete).toBe(1);
  });

  it('keeps the source user when it still owns other characters', async () => {
    // awaits: move account → select-remaining (one row) → stored-active (999, so
    // the moved char wasn't active → no re-point).
    state.results = [undefined, [{ id: 'acc-other' }], [{ activeCharacterId: 999 }]];
    const out = await reassignCharacter({
      characterId: 100,
      fromUserId: 'eve-user-2',
      toUserId: 'admin-1',
    });
    expect(out).toEqual({ sourceDeleted: false });
    expect(state.calls.delete).toBe(0);
  });
});
