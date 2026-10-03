import { byEndDate, type IndustryJob } from './esi-projection';

export function flattenJobs(
  boards: Iterable<{ data: { jobs: IndustryJob[] } | null }>,
): IndustryJob[] {
  const all: IndustryJob[] = [];
  for (const board of boards) {
    for (const job of board.data?.jobs ?? []) all.push(job);
  }
  return all.sort(byEndDate);
}
