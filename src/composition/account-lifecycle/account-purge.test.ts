import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const order = vi.hoisted(() => [] as string[]);

const runPurgeMock = vi.fn();
vi.mock('@/composition/purge/orchestrator', () => ({
  runPurge: (...args: unknown[]) => runPurgeMock(...args),
}));

const revokeMock = vi.fn();
vi.mock('@/platform/auth/eve-token-service', () => ({
  revokeCharacterToken: (id: number) => revokeMock(id),
}));

const auth = vi.hoisted(() => ({
  deleteCharacterLink: vi.fn(),
  markCharacterDeletionRequested: vi.fn(),
  markUserDeletionRequested: vi.fn(),
  readPendingDeletion: vi.fn(),
  readRequestedDeletions: vi.fn(),
}));
vi.mock('@/platform/auth/purge', () => auth);

const reconcileMock = vi.hoisted(() => vi.fn());
vi.mock('@/platform/auth/account-purge', () => ({
  reconcileAfterCharacterRemoval: reconcileMock,
}));

import {
  finishPendingDeletion,
  nukeAccount,
  purgeOwnCharacter,
  retryRequestedDeletions,
} from './account-purge';

const USER = 'eve-user-1';
const CHAR = 90000001;
const OTHER = 90000002;

beforeEach(() => {
  state.results = [];
  state.calls.delete = 0;
  state.calls.update = 0;
  order.length = 0;
  runPurgeMock.mockReset();
  runPurgeMock.mockImplementation(async (subject: { kind: string }) => {
    order.push(`purge:${subject.kind}`);
  });
  revokeMock.mockReset();
  revokeMock.mockImplementation(async () => {
    order.push('revoke');
  });
  auth.deleteCharacterLink.mockReset().mockImplementation(async () => {
    order.push('unlink');
  });
  auth.markCharacterDeletionRequested.mockReset().mockImplementation(async () => {
    order.push('mark:character');
  });
  auth.markUserDeletionRequested.mockReset().mockImplementation(async () => {
    order.push('mark:user');
  });
  auth.readPendingDeletion.mockReset().mockResolvedValue(null);
  auth.readRequestedDeletions.mockReset().mockResolvedValue([]);
  reconcileMock.mockReset().mockImplementation(async () => {
    order.push('reconcile');
    return { accountEmptied: false };
  });
});

describe('purgeOwnCharacter', () => {
  it('marks the deletion, purges, then deletes the link before reconciling', async () => {
    await expect(purgeOwnCharacter(USER, CHAR)).resolves.toEqual({ accountEmptied: false });
    expect(order).toEqual(['mark:character', 'revoke', 'purge:character', 'unlink', 'reconcile']);
    expect(auth.deleteCharacterLink).toHaveBeenCalledWith(USER, CHAR);
  });

  it('keeps the link as the retry target when a purge step fails', async () => {
    runPurgeMock.mockRejectedValueOnce(new Error('convex down'));
    await expect(purgeOwnCharacter(USER, CHAR)).rejects.toThrow('convex down');
    expect(auth.deleteCharacterLink).not.toHaveBeenCalled();
    expect(reconcileMock).not.toHaveBeenCalled();
  });
});

describe('nukeAccount', () => {
  it('marks the account first and re-enumerates until empty, catching a character linked mid-nuke', async () => {
    state.results = [
      [{ accountId: String(CHAR) }],
      [{ accountId: String(OTHER) }],
      [],
      undefined,
    ];
    await nukeAccount(USER);

    expect(order[0]).toBe('mark:user');
    expect(revokeMock.mock.calls).toEqual([[CHAR], [OTHER]]);
    expect(auth.deleteCharacterLink.mock.calls).toEqual([[USER, CHAR], [USER, OTHER]]);
    expect(runPurgeMock).toHaveBeenCalledTimes(3);
    expect(state.calls.delete).toBe(1);
  });

  it('skips a malformed EVE account id instead of revoking NaN or repeating the loop', async () => {
    state.results = [
      [{ accountId: 'not-a-character-id' }],
      undefined,
    ];
    await nukeAccount(USER);

    expect(revokeMock).not.toHaveBeenCalled();
    expect(runPurgeMock).toHaveBeenCalledOnce();
    expect(runPurgeMock).toHaveBeenCalledWith({ kind: 'user', userId: USER });
    expect(state.calls.delete).toBe(1);
  });

  it('keeps the user row when a character purge fails', async () => {
    state.results = [[{ accountId: String(CHAR) }]];
    runPurgeMock.mockRejectedValueOnce(new Error('convex down'));
    await expect(nukeAccount(USER)).rejects.toThrow('convex down');
    expect(state.calls.delete).toBe(0);
  });
});

describe('finishPendingDeletion', () => {
  it('does nothing when no deletion is pending', async () => {
    await finishPendingDeletion(CHAR);
    expect(order).toEqual([]);
  });

  it('finishes a pending character deletion', async () => {
    auth.readPendingDeletion.mockResolvedValueOnce({ scope: 'character', userId: USER, characterId: CHAR });
    await finishPendingDeletion(CHAR);
    expect(order).toEqual(['mark:character', 'revoke', 'purge:character', 'unlink', 'reconcile']);
  });

  it('finishes a pending account deletion', async () => {
    auth.readPendingDeletion.mockResolvedValueOnce({ scope: 'user', userId: USER });
    state.results = [[], undefined];
    await finishPendingDeletion(CHAR);
    expect(order).toEqual(['mark:user', 'purge:user']);
    expect(state.calls.delete).toBe(1);
  });
});

describe('retryRequestedDeletions', () => {
  it('retries each pending deletion and counts failures without stopping', async () => {
    auth.readRequestedDeletions.mockResolvedValueOnce([
      { scope: 'user', userId: USER },
      { scope: 'character', userId: 'eve-user-2', characterId: OTHER },
    ]);
    state.results = [[], undefined];
    runPurgeMock.mockImplementationOnce(async () => undefined);
    runPurgeMock.mockRejectedValueOnce(new Error('convex down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(retryRequestedDeletions(Date.now() + 60_000)).resolves.toEqual({ retried: 1, failed: 1 });
    expect(errorSpy).toHaveBeenCalledWith(
      '[account-purge] requested deletion retry failed',
      { scope: 'character', userId: 'eve-user-2', characterId: OTHER },
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('stops at the deadline', async () => {
    auth.readRequestedDeletions.mockResolvedValueOnce([{ scope: 'user', userId: USER }]);
    await expect(retryRequestedDeletions(Date.now() - 1)).resolves.toEqual({ retried: 0, failed: 0 });
    expect(order).toEqual([]);
  });
});
