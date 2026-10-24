import { expect, test } from 'vitest';
import { industryJob } from './__tests__/job-fixture';
import { flattenJobs } from './flatten-jobs';

test('flattenJobs merges boards soonest-done first with a job_id tie-break, skipping empty and unsynced boards', () => {
  const boards = [
    {
      data: {
        jobs: [
          industryJob({ job_id: 30, end_date: '2026-07-03T00:00:00Z' }),
          industryJob({ job_id: 12, end_date: '2026-07-02T00:00:00Z' }),
        ],
      },
    },
    { data: null },
    {
      data: {
        jobs: [
          industryJob({ job_id: 11, end_date: '2026-07-02T00:00:00Z' }),
          industryJob({ job_id: 5, end_date: '2026-07-01T06:00:00Z' }),
        ],
      },
    },
  ];
  expect(flattenJobs(boards).map((j) => j.job_id)).toEqual([5, 11, 12, 30]);
  expect(flattenJobs([{ data: null }, { data: { jobs: [] } }])).toEqual([]);
});
