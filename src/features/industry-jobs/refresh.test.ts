import { describe, expect, it, vi } from 'vitest';
import { planJobsPersist, refreshJobsForUser } from './refresh';
import type { CharacterJobsSyncState, JobsEsiRead, JobsPort, RefreshCharacter } from './types';

const NOW = new Date('2026-06-28T12:00:00Z');
const JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';

// A valid ESI industry-jobs element — exactly the projected fields, so
// parseIndustryJobsBody is an identity (modulo its soonest-done-first sort).
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
    readJobs: vi.fn(
      async (): Promise<JobsEsiRead> => ({ kind: 'fresh', body: [esiJob(5)], etag: '"j"' }),
    ),
    readSyncState: vi.fn(async () => null),
    saveJobs: vi.fn(async () => {}),
    stampFresh: vi.fn(async () => {}),
    ...overrides,
  };
}

const character = (id: number, extra: Partial<RefreshCharacter> = {}): RefreshCharacter => ({
  characterId: id,
  hasRefreshToken: true,
  missingScopes: [],
  ...extra,
});

// lastRefreshedAt 60s ago — inside the 300s TTL, so the character is fresh.
const fresh = (): CharacterJobsSyncState => ({
  lastRefreshedAt: new Date(NOW.getTime() - 60_000),
  jobsEtag: null,
});

describe('refreshJobsForUser', () => {
  it('makes no token vend and no ESI call when the character is fresh (the staleness gate)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => fresh()),
    });

    await refreshJobsForUser(port, 'u1');

    expect(port.vendToken).not.toHaveBeenCalled();
    expect(port.readJobs).not.toHaveBeenCalled();
    expect(port.saveJobs).not.toHaveBeenCalled();
  });

  it('fetches and saves the board for a never-synced character', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => null), // never synced → stale, no held etag
    });

    await refreshJobsForUser(port, 'u1');

    expect(port.readJobs).toHaveBeenCalledWith(1, 'token', null);
    const save = vi.mocked(port.saveJobs).mock.calls[0];
    expect(save[0]).toBe(1);
    expect(save[1]).toEqual([esiJob(5)]);
    expect(save[2]).toBe('"j"');
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('replays the held etag and only stamps freshness on a 304', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readSyncState: vi.fn(async () => ({ lastRefreshedAt: null, jobsEtag: '"jh"' })),
      readJobs: vi.fn(async (): Promise<JobsEsiRead> => ({ kind: 'unchanged' })),
    });

    await refreshJobsForUser(port, 'u1');

    expect(port.readJobs).toHaveBeenCalledWith(1, 'token', '"jh"');
    expect(port.stampFresh).toHaveBeenCalledOnce();
    expect(port.saveJobs).not.toHaveBeenCalled();
  });

  it('skips the character on an ESI error without saving or stamping', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      readJobs: vi.fn(async (): Promise<JobsEsiRead> => ({ kind: 'error', code: 'esi_500' })),
    });

    await refreshJobsForUser(port, 'u1');

    expect(port.saveJobs).not.toHaveBeenCalled();
    expect(port.stampFresh).not.toHaveBeenCalled();
  });

  it('refreshes several stale characters in one parallel pass', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1), character(2), character(3)]),
      readSyncState: vi.fn(async () => null),
    });

    await refreshJobsForUser(port, 'u1');

    const saved = vi
      .mocked(port.saveJobs)
      .mock.calls.map(([characterId]) => characterId)
      .sort((a, b) => a - b);
    expect(saved).toEqual([1, 2, 3]);
  });

  it('skips a character missing the industry scope (no sync-state read, no vend)', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1, { missingScopes: [JOBS_SCOPE] })]),
    });

    await refreshJobsForUser(port, 'u1');

    expect(port.readSyncState).not.toHaveBeenCalled();
    expect(port.vendToken).not.toHaveBeenCalled();
  });

  it('skips a character whose token cannot be vended', async () => {
    const port = makePort({
      listCharacters: vi.fn(async () => [character(1)]),
      vendToken: vi.fn(async () => null),
    });

    await refreshJobsForUser(port, 'u1');

    expect(port.readJobs).not.toHaveBeenCalled();
    expect(port.saveJobs).not.toHaveBeenCalled();
  });
});

describe('planJobsPersist', () => {
  const freshRead = (body: unknown, etag: string | null): JobsEsiRead => ({ kind: 'fresh', body, etag });
  const unchanged: JobsEsiRead = { kind: 'unchanged' };
  const error: JobsEsiRead = { kind: 'error', code: 'esi_500' };

  it('saves the board when the read is fresh', () => {
    expect(planJobsPersist(freshRead([esiJob(5)], '"j"'))).toEqual({
      kind: 'save',
      jobs: [esiJob(5)],
      etag: '"j"',
    });
  });

  it('stamps when the read is a 304', () => {
    expect(planJobsPersist(unchanged)).toEqual({ kind: 'stamp' });
  });

  it('skips on an ESI error', () => {
    expect(planJobsPersist(error)).toEqual({ kind: 'skip' });
  });

  it('skips on a contract mismatch in a fresh body', () => {
    expect(planJobsPersist(freshRead({ not: 'an array' }, '"j"'))).toEqual({ kind: 'skip' });
  });
});
