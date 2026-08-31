import { beforeEach, describe, expect, it, vi } from 'vitest';

// nukeAccount's loop guards — the arms the real-Postgres twin
// (account-purge.db.test.ts) cannot easily express: re-enumeration until empty
// with a mid-nuke link, and the malformed-account-id skip that prevents an
// infinite loop. The branch forks themselves run in the db suite.
const { chain, state } = vi.hoisted(() => {
  const state = { results: [] as unknown[], calls: { delete: 0, update: 0 } };
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(state.results.shift()),
  };
  for (const m of ['set', 'where', 'select', 'from', 'limit', 'orderBy', 'returning', 'values']) {
    chain[m] = () => chain;
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

const runPurgeMock = vi.fn();
vi.mock('@/composition/purge/orchestrator', () => ({
  runPurge: (...args: unknown[]) => runPurgeMock(...args),
}));

const revokeMock = vi.fn();
vi.mock('@/platform/auth/eve-token-service', () => ({
  revokeCharacterToken: (id: number) => revokeMock(id),
}));

import { nukeAccount } from './account-purge';

const USER = 'eve-user-1';
const CHAR = 90000001;
const OTHER = 90000002;

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
  runPurgeMock.mockReset();
  runPurgeMock.mockResolvedValue(undefined);
  revokeMock.mockReset();
  revokeMock.mockResolvedValue(undefined);
});

describe('nukeAccount', () => {
  it('re-enumerates until empty, catching a character linked mid-nuke (no cascade orphan)', async () => {
    state.results = [
      [{ accountId: String(CHAR) }], // pass 1: one linked
      [{ accountId: String(OTHER) }], // pass 2: a newcomer linked during pass 1
      [], // pass 3: empty → loop exits
      undefined, // delete user row
    ];
    await nukeAccount(USER);

    // The newcomer is swept too, so its character-keyed caches don't orphan.
    expect(revokeMock.mock.calls).toEqual([[CHAR], [OTHER]]);
    expect(runPurgeMock).toHaveBeenCalledTimes(3); // 2 character purges + 1 user purge
    expect(state.calls.delete).toBe(1);
  });

  it('skips a malformed EVE account id instead of revoking NaN or repeating the loop', async () => {
    state.results = [
      [{ accountId: 'not-a-character-id' }], // filtered before the nuke loop
      undefined, // delete user row; its cascade removes the malformed account
    ];
    await nukeAccount(USER);

    expect(revokeMock).not.toHaveBeenCalled();
    expect(runPurgeMock).toHaveBeenCalledOnce();
    expect(runPurgeMock).toHaveBeenCalledWith({ kind: 'user', userId: USER });
    expect(state.calls.delete).toBe(1);
  });
});
