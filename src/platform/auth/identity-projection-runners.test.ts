import { expect, it, vi } from 'vitest';
import { runCharacterUnlink, type IdentityProjectionRunners } from './identity-projection-runners';

it('completes post-commit cleanup and preserves the first failure', async () => {
  const historyFailure = new Error('history database unavailable');
  const runners: IdentityProjectionRunners = {
    runBeforeUserDelete: vi.fn(),
    runBeforeCharacterUnlink: vi.fn().mockResolvedValue(['map']),
    runAfterFailedCharacterUnlink: vi.fn(),
    runAfterCharacterUnlink: vi.fn().mockRejectedValue(historyFailure),
    runAfterCharacterLinkChanged: vi.fn().mockRejectedValue(new Error('projection unavailable')),
  };
  const afterMutation = vi.fn().mockRejectedValue(new Error('cleanup unavailable'));
  await expect(runCharacterUnlink({
    userId: 'user', characterId: 123, runners,
    mutate: async () => true,
    changed: (result) => result,
    afterMutation,
  })).rejects.toBe(historyFailure);
  expect(afterMutation).toHaveBeenCalledWith(true);
  expect(runners.runAfterCharacterLinkChanged).toHaveBeenCalledWith({ userId: 'user', characterId: 123 });
  expect(runners.runAfterFailedCharacterUnlink).not.toHaveBeenCalled();
});
