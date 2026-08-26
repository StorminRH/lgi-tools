import { describe, expect, it } from 'vitest';
import type { CorpJobsResponse, JobsResponse } from './api-contract';
import type { IndustryJob } from './esi-projection';
import { deriveCorpJobs, deriveJobsByCharacter } from './live-derive';

const NOW = Date.parse('2026-06-12T12:00:00Z');

function job(overrides: Partial<IndustryJob>): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 691,
    product_type_id: 587,
    runs: 10,
    status: 'active',
    start_date: '2026-06-12T00:00:00Z',
    end_date: '2026-06-13T00:00:00Z',
    ...overrides,
  };
}

describe('deriveJobsByCharacter', () => {
  it('keys by character, re-derives past-end to ready, and leaves running / never-synced / null alone', () => {
    expect(deriveJobsByCharacter(null, NOW).size).toBe(0);

    const response: JobsResponse = {
      characters: [
        {
          characterId: 5,
          data: { jobs: [job({ end_date: '2026-06-12T11:00:00Z' })] },
          lastRefreshedAt: null,
        },
        { characterId: 9, data: null, lastRefreshedAt: null },
        {
          characterId: 1,
          data: { jobs: [job({ end_date: '2026-06-12T13:00:00Z' })] },
          lastRefreshedAt: null,
        },
      ],
      names: {},
    };
    const map = deriveJobsByCharacter(response, NOW);
    expect(map.get(5)?.data?.jobs[0]!.status).toBe('ready');
    expect(map.get(9)?.data).toBeNull();
    expect(map.get(1)?.data?.jobs[0]!.status).toBe('active');
  });
});

describe('deriveCorpJobs', () => {
  it('re-derives each corp board, preserves order + syncError, and treats a null response as empty', () => {
    expect(deriveCorpJobs(null, NOW)).toEqual([]);

    const response: CorpJobsResponse = {
      corporations: [
        {
          corporationId: 5000,
          data: { jobs: [job({ end_date: '2026-06-12T11:00:00Z' })] },
          lastRefreshedAt: null,
          syncError: null,
        },
        { corporationId: 6000, data: null, lastRefreshedAt: null, syncError: 'needs_role' },
      ],
      names: {},
    };
    const corps = deriveCorpJobs(response, NOW);
    expect(corps[0]!.data?.jobs[0]!.status).toBe('ready');
    expect(corps[1]!.data).toBeNull();
    expect(corps[1]!.syncError).toBe('needs_role');
  });
});
