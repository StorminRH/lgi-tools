// The client-side board derivations for the live industry-jobs hooks. Both the
// per-character (use-jobs-live) and per-corp (use-corp-jobs-live) surfaces re-derive each
// job's live "ready" from its absolute end_date against the render clock — the single
// seam that replaced the deleted Convex markReady schedulers. Extracted from the hook
// memos so the re-derive is shared (not cloned between the two hooks) and unit-tested.
import type { CorpJobsResponse, JobsResponse } from './api-contract';
import { deriveJobStatus } from './job-state';

type ViewerJobs = JobsResponse['characters'][number];
type ViewerCorpJobs = CorpJobsResponse['corporations'][number];
type JobBoard = NonNullable<ViewerJobs['data']>;

// Re-derive one board's job statuses against the render clock: a job past its absolute
// end_date flips to 'ready'; every other status passes through unchanged.
function reDeriveBoard(board: JobBoard, now: number): JobBoard {
  return {
    jobs: board.jobs.map((job) => ({ ...job, status: deriveJobStatus(job.status, job.end_date, now) })),
  };
}

/**
 * The per-character board map with each job's status re-derived on the render clock. A
 * never-synced character (data:null) passes through untouched, so consumers read
 * job.status as before.
 */
export function deriveJobsByCharacter(response: JobsResponse | null, now: number): Map<number, ViewerJobs> {
  const map = new Map<number, ViewerJobs>();
  for (const character of response?.characters ?? []) {
    map.set(
      character.characterId,
      character.data === null ? character : { ...character, data: reDeriveBoard(character.data, now) },
    );
  }
  return map;
}

/**
 * The per-corp board list with each job's status re-derived on the render clock. A corp
 * with no readable board (data:null — un-synced or needs_role) passes through untouched.
 */
export function deriveCorpJobs(response: CorpJobsResponse | null, now: number): ViewerCorpJobs[] {
  return (response?.corporations ?? []).map((corp) =>
    corp.data === null ? corp : { ...corp, data: reDeriveBoard(corp.data, now) },
  );
}
