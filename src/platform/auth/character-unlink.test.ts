import { expect, test, vi } from 'vitest';

const reconcile = vi.hoisted(() => vi.fn());
vi.mock('./account-purge', () => ({
  reconcileAfterCharacterRemoval: (...args: unknown[]) => reconcile(...args),
}));

import { unlinkCharacter } from './character-unlink';

/** Runners, a removal and a settle hook that all record into one ordered log. */
function harness({ removed = true }: { removed?: boolean } = {}) {
  const log: string[] = [];
  const step = (name: string) => vi.fn(async () => {
    log.push(name);
  });
  const runners = {
    runBeforeUserDelete: step('beforeUserDelete'),
    runBeforeCharacterUnlink: vi.fn(async () => {
      log.push('revoke');
      return ['map-1'];
    }),
    runAfterFailedCharacterUnlink: step('restore'),
    runAfterCharacterUnlink: step('finalize'),
    runAfterCharacterLinkChanged: step('linkChanged'),
  };
  const remove = vi.fn(async () => {
    log.push('remove');
    return removed;
  });
  const afterSettle = vi.fn(async (moved: boolean) => {
    log.push(`afterSettle:${moved}`);
  });
  reconcile.mockReset().mockImplementation(async () => {
    log.push('reconcile');
    return { accountEmptied: false };
  });
  return { log, runners, remove, afterSettle };
}

test('removes the character, then settles the account through reconcile before the link-changed runners', async () => {
  const { log, runners, remove, afterSettle } = harness();
  reconcile.mockImplementationOnce(async () => {
    log.push('reconcile');
    return { accountEmptied: true };
  });

  const outcome = await unlinkCharacter({ userId: 'u1', characterId: 100, runners, remove, afterSettle });

  expect(outcome).toEqual({ removed: true, accountEmptied: true });
  expect(log).toEqual(['revoke', 'remove', 'finalize', 'reconcile', 'linkChanged', 'afterSettle:true']);
  expect(runners.runBeforeCharacterUnlink).toHaveBeenCalledWith({ userId: 'u1', characterId: 100 });
  expect(runners.runAfterCharacterUnlink).toHaveBeenCalledWith({ userId: 'u1', characterId: 100, mapIds: ['map-1'] });
  expect(reconcile).toHaveBeenCalledWith('u1', 100, runners);
  expect(runners.runAfterCharacterLinkChanged).toHaveBeenCalledWith({ userId: 'u1', characterId: 100 });
});

test('a failed revocation removes nothing and leaves the restore to the self-restoring runner', async () => {
  const { log, runners, remove, afterSettle } = harness();
  const failure = new Error('Convex unavailable');
  runners.runBeforeCharacterUnlink.mockRejectedValueOnce(failure);

  const outcome = await unlinkCharacter({ userId: 'u1', characterId: 100, runners, remove, afterSettle });

  expect(outcome).toEqual({ removed: false, reason: 'revocation-failed', error: failure });
  expect(log).toEqual([]);
  expect(remove).not.toHaveBeenCalled();
  expect(runners.runAfterFailedCharacterUnlink).not.toHaveBeenCalled();
  expect(reconcile).not.toHaveBeenCalled();
});

test('a removal that throws restores the claims and reports the error without settling', async () => {
  const { log, runners, remove, afterSettle } = harness();
  const failure = new Error('Neon unavailable');
  remove.mockImplementationOnce(async () => {
    log.push('remove');
    throw failure;
  });

  const outcome = await unlinkCharacter({ userId: 'u1', characterId: 100, runners, remove, afterSettle, settleOnMiss: true });

  expect(outcome).toEqual({ removed: false, reason: 'remove-failed', error: failure });
  expect(log).toEqual(['revoke', 'remove', 'restore']);
  expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(100);
});

test('a removal that matches nothing restores the claims and settles only when asked to', async () => {
  const plain = harness({ removed: false });
  await expect(unlinkCharacter({
    userId: 'u1', characterId: 100, runners: plain.runners, remove: plain.remove, afterSettle: plain.afterSettle,
  })).resolves.toEqual({ removed: false, reason: 'no-match', accountEmptied: false });
  expect(plain.log).toEqual(['revoke', 'remove', 'restore']);
  expect(reconcile).not.toHaveBeenCalled();

  const settling = harness({ removed: false });
  reconcile.mockImplementationOnce(async () => {
    settling.log.push('reconcile');
    return { accountEmptied: true };
  });
  await expect(unlinkCharacter({
    userId: 'u1', characterId: 100, runners: settling.runners, remove: settling.remove,
    afterSettle: settling.afterSettle, settleOnMiss: true,
  })).resolves.toEqual({ removed: false, reason: 'no-match', accountEmptied: true });
  expect(settling.log).toEqual(['revoke', 'remove', 'restore', 'reconcile', 'linkChanged', 'afterSettle:false']);
  expect(settling.runners.runAfterCharacterUnlink).not.toHaveBeenCalled();
});

test('a finalize failure still settles the account, then rethrows', async () => {
  const { log, runners, remove, afterSettle } = harness();
  const failure = new Error('history deletion failed');
  runners.runAfterCharacterUnlink.mockImplementationOnce(async () => {
    log.push('finalize');
    throw failure;
  });

  await expect(unlinkCharacter({ userId: 'u1', characterId: 100, runners, remove, afterSettle })).rejects.toBe(failure);
  expect(log).toEqual(['revoke', 'remove', 'finalize', 'reconcile', 'linkChanged', 'afterSettle:true']);
  expect(runners.runAfterFailedCharacterUnlink).not.toHaveBeenCalled();
});

test('a reconcile failure skips the link-changed runners and the settle hook', async () => {
  const { log, runners, remove, afterSettle } = harness();
  const failure = new Error('map purge unavailable');
  reconcile.mockImplementationOnce(async () => {
    log.push('reconcile');
    throw failure;
  });

  await expect(unlinkCharacter({ userId: 'u1', characterId: 100, runners, remove, afterSettle })).rejects.toBe(failure);
  expect(log).toEqual(['revoke', 'remove', 'finalize', 'reconcile']);
  expect(runners.runAfterCharacterLinkChanged).not.toHaveBeenCalled();
  expect(afterSettle).not.toHaveBeenCalled();
});
