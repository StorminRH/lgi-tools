// The Active-jobs table's board flattening, extracted pure from the component
// (3.7.24) so the dashboard coordinator and the table share one definition —
// and so the ordering is pinned by tests. ESI documents no ordering guarantee;
// the board renders soonest-done first, job_id tie-breaking for stability.
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

// The section header's "N complete · M in progress" counts. Statuses arrive
// already derived by the live hook (a past-end_date active job is 'ready').
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
