import { expect, test, vi } from 'vitest';

const recovery = vi.hoisted(() => ({ readRequestedDeletions: vi.fn() }));
vi.mock('@/platform/auth/purge', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/platform/auth/purge')>(),
  readRequestedDeletions: recovery.readRequestedDeletions,
}));
import { retryRequestedDeletions } from './account-purge';

test('does not discover or enqueue work after the cron deadline', async () => {
  expect(await retryRequestedDeletions(Date.now() - 1)).toEqual({ succeeded: 0, failed: 0, deferred: 0 });
  expect(recovery.readRequestedDeletions).not.toHaveBeenCalled();
});
