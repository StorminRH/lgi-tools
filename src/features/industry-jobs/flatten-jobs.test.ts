import { describe, expect, it } from 'vitest';
import type { IndustryJob } from './esi-projection';
import { flattenJobs } from './flatten-jobs';

function job(
  overrides: Partial<IndustryJob> & { job_id: number; end_date: string },
): IndustryJob {
  return {
    activity_id: 1,
    blueprint_type_id: 999,
    runs: 1,
    status: 'active',
    start_date: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('flattenJobs', () => {
  it('flattens boards soonest-done first with job_id tie-break', () => {
    const boards = [
      {
        data: {
          jobs: [
            job({ job_id: 30, end_date: '2026-07-03T00:00:00Z' }),
            job({ job_id: 12, end_date: '2026-07-02T00:00:00Z' }),
          ],
        },
      },
      { data: null },
      {
        data: {
          jobs: [
            job({ job_id: 11, end_date: '2026-07-02T00:00:00Z' }),
            job({ job_id: 5, end_date: '2026-07-01T06:00:00Z' }),
          ],
        },
      },
    ];
    expect(flattenJobs(boards).map((j) => j.job_id)).toEqual([5, 11, 12, 30]);
  });

  it('returns an empty list from empty or null boards', () => {
    expect(flattenJobs([{ data: null }, { data: { jobs: [] } }])).toEqual([]);
  });
});
