import { describe, expect, it } from 'vitest';
import type { IndustryJob } from './esi-projection';
import { flattenJobs, jobCounts } from './flatten-jobs';

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
  // Pins the table's ordering byte-identically to the pre-extraction inline
  // sort: end_date ascending, job_id tie-break; null boards contribute nothing.
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

describe('jobCounts', () => {
  it('counts ready as complete and active as in progress; others neither', () => {
    const jobs = [
      job({ job_id: 1, end_date: '2026-07-02T00:00:00Z', status: 'ready' }),
      job({ job_id: 2, end_date: '2026-07-02T00:00:00Z', status: 'ready' }),
      job({ job_id: 3, end_date: '2026-07-02T00:00:00Z', status: 'active' }),
      job({ job_id: 4, end_date: '2026-07-02T00:00:00Z', status: 'paused' }),
    ];
    expect(jobCounts(jobs)).toEqual({ complete: 2, inProgress: 1 });
  });
});
