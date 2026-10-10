import { beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const recovery = vi.hoisted(() => ({
  jobsForCharacter: vi.fn(),
  readRequestedDeletions: vi.fn(),
  readPendingDeletion: vi.fn(),
  readDeletionJobs: vi.fn(),
  rotateDeletionJob: vi.fn(),
}));
vi.mock('@/platform/auth/deletion-jobs', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/platform/auth/deletion-jobs')>(),
  jobsForCharacter: recovery.jobsForCharacter,
  readDeletionJobs: recovery.readDeletionJobs,
  rotateDeletionJob: recovery.rotateDeletionJob,
}));
vi.mock('@/platform/auth/purge', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/platform/auth/purge')>(),
  readPendingDeletion: recovery.readPendingDeletion,
  readRequestedDeletions: recovery.readRequestedDeletions,
}));
vi.mock('@/db/deletion-client', () => ({ deletionDatabase: () => ({
  transaction: async () => { throw new Error('direct database unavailable'); },
}) }));
import { finishPendingDeletion, retryRequestedDeletions } from './account-purge';

beforeEach(() => {
  vi.clearAllMocks();
  recovery.jobsForCharacter.mockResolvedValue([]);
  recovery.readPendingDeletion.mockResolvedValue(null);
  recovery.readRequestedDeletions.mockResolvedValue([]);
  recovery.readDeletionJobs.mockResolvedValue([]);
  recovery.rotateDeletionJob.mockResolvedValue(undefined);
});

describe('deletion recovery boundaries', () => {
  it('leaves ordinary sign-in alone when there is no pending cleanup', async () => {
    await finishPendingDeletion(90000001);
    expect(recovery.jobsForCharacter).toHaveBeenCalledWith(90000001);
    expect(recovery.readPendingDeletion).toHaveBeenCalledWith(90000001);
    expect(recovery.rotateDeletionJob).not.toHaveBeenCalled();
  });

  it('does not discover or enqueue work after the cron deadline', async () => {
    expect(await retryRequestedDeletions(Date.now() - 1)).toEqual({ retried: 0, failed: 0 });
    expect(recovery.readRequestedDeletions).not.toHaveBeenCalled();
  });

  it('retains a failed job and moves its retry behind other waiting work', async () => {
    recovery.readDeletionJobs.mockResolvedValue([{ id: 'job', userId: 'owner', scope: 'character' }]);
    const error = silenceConsolePrefixes('error', ['[account-purge] requested deletion retry failed']);
    expect(await retryRequestedDeletions(Date.now() + 60000)).toEqual({ retried: 0, failed: 1 });
    expect(recovery.rotateDeletionJob).toHaveBeenCalledWith('job');
    error.mockRestore();
  });
});
