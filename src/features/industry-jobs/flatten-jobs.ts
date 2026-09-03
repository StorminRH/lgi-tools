import type { IndustryJob } from './esi-projection';

export function flattenJobs(
  boards: Iterable<{ data: { jobs: IndustryJob[] } | null }>,
): IndustryJob[] {
  const all: IndustryJob[] = [];
  for (const board of boards) {
    for (const job of board.data?.jobs ?? []) all.push(job);
  }
  return all.sort(
    (a, b) => Date.parse(a.end_date) - Date.parse(b.end_date) || a.job_id - b.job_id,
  );
}

export function jobCounts(jobs: readonly IndustryJob[]): {
  complete: number;
  inProgress: number;
} {
  let complete = 0;
  let inProgress = 0;
  for (const job of jobs) {
    if (job.status === 'ready') complete += 1;
    if (job.status === 'active') inProgress += 1;
  }
  return { complete, inProgress };
}
