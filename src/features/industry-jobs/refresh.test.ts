import { describe, expect, it, vi } from 'vitest';
import type { EsiReadSession } from '@/data/esi-store/session';
import type { SingleOwnerRead } from '@/platform/owner-sync';
import { ownerFixture, readSessionFake } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { refreshJobsForUser } from './refresh';
import type { JobsPort } from './types';

const NOW = new Date('2026-06-28T12:00:00Z');
const JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';

function esiJob(jobId: number) {
  return {
    job_id: jobId,
    activity_id: 1,
    blueprint_type_id: 1000,
    runs: 1,
    status: 'active' as const,
    start_date: '2026-06-28T00:00:00Z',
    end_date: '2026-06-29T00:00:00Z',
  };
}

function makePort(overrides: Partial<JobsPort> = {}): JobsPort {
  return {
    now: () => NOW,
    listCharacters: vi.fn(async () => []),
    vendToken: vi.fn(async () => 'token'),
    isDue: vi.fn(async () => true),
    openSession: () => readSessionFake<EsiReadSession>(),
    readJobs: vi.fn(
      async (): Promise<SingleOwnerRead> => ({ kind: 'fresh', body: [esiJob(5)], etag: '"j"' }),
    ),
    readSyncState: vi.fn(async () => null),
    saveJobs: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('refreshJobsForUser', () => {
  it('makes no token vend and no ESI call while the stored answer is unexpired (the store is the gate)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      isDue: vi.fn(async () => false),
    });

    const result = await refreshJobsForUser(port, 'u1');

    expect(result).toEqual([{ kind: 'succeeded', target: { ownerType: 'character', ownerId: 1 } }]);
    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.readJobs).not.toHaveBeenCalled();
    expect(port.saveJobs).not.toHaveBeenCalled();
  });

  it('fetches and saves the board for a never-synced character', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSyncState: vi.fn(async () => null),
    });

    const result = await refreshJobsForUser(port, 'u1');

    expect(result).toEqual([{ kind: 'succeeded', target: { ownerType: 'character', ownerId: 1 } }]);
    expect(port.readJobs).toHaveBeenCalledWith(expect.anything(), 1, 'token');
    const save = vi.mocked(port.saveJobs).mock.calls[0]!;
    expect(save[0]).toBe(1);
    expect(save[1]).toEqual([esiJob(5)]);
    expect(save[2]).toBe('"j"');
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('only stamps freshness on an unchanged answer', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null })),
      readJobs: vi.fn(async (): Promise<SingleOwnerRead> => ({ kind: 'unchanged' })),
    });

    const result = await refreshJobsForUser(port, 'u1');

    expect(result).toEqual([{ kind: 'succeeded', target: { ownerType: 'character', ownerId: 1 } }]);
    expect(port.stampFresh).toHaveBeenCalledOnce();
    expect(port.saveJobs).not.toHaveBeenCalled();
  });

  it('skips the character on an ESI error without saving or stamping', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readJobs: vi.fn(async (): Promise<SingleOwnerRead> => ({ kind: 'error', code: 'esi_500' })),
    });

    const result = await refreshJobsForUser(port, 'u1');

    expect(result).toEqual([
      { kind: 'failed_permanent', target: { ownerType: 'character', ownerId: 1 }, code: 'esi_500' },
    ]);
    expect(port.saveJobs).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('reports a fresh contract rejection without saving or stamping', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      readJobs: vi.fn(
        async (): Promise<SingleOwnerRead> => ({ kind: 'fresh', body: { not: 'an array' }, etag: '"bad"' }),
      ),
    });

    const result = await refreshJobsForUser(port, 'u1');

    expect(result).toEqual([
      { kind: 'failed_permanent', target: { ownerType: 'character', ownerId: 1 }, code: 'contract_error' },
    ]);
    expect(port.saveJobs).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('refreshes several stale characters in one parallel pass', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1), ownerFixture(2), ownerFixture(3)]),
      readSyncState: vi.fn(async () => null),
    });

    await refreshJobsForUser(port, 'u1');

    const saved = vi
      .mocked(port.saveJobs)
      .mock.calls.map(([characterId]) => characterId)
      .sort((a, b) => a - b);
    expect(saved).toEqual([1, 2, 3]);
  });

  it('skips a character missing the industry scope (no due check, no sync-state read, no vend)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1, { missingScopes: [JOBS_SCOPE] })]),
    });

    await refreshJobsForUser(port, 'u1');

    expect(port.isDue).not.toHaveBeenCalled();
    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.vendToken).not.toHaveBeenCalled();
  });

  it('skips a character whose token cannot be vended', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [ownerFixture(1)]),
      vendToken: vi.fn(async () => null),
    });

    await refreshJobsForUser(port, 'u1');

    expect(port.readJobs).not.toHaveBeenCalled();
    expect(port.saveJobs).not.toHaveBeenCalled();
  });
});
