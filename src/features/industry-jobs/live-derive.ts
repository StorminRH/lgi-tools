import type { CorpJobsResponse, JobsResponse } from './api-contract';
import { deriveJobStatus } from './job-state';

export type ViewerJobs = JobsResponse['characters'][number];
export type ViewerCorpJobs = CorpJobsResponse['corporations'][number];
type JobBoard = NonNullable<ViewerJobs['data']>;

function reDeriveBoard(board: JobBoard, now: number): JobBoard {
  return {
    jobs: board.jobs.map((job) => ({ ...job, status: deriveJobStatus(job.status, job.end_date, now) })),
  };
}

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

export function deriveCorpJobs(response: CorpJobsResponse | null, now: number): ViewerCorpJobs[] {
  return (response?.corporations ?? []).map((corp) =>
    corp.data === null ? corp : { ...corp, data: reDeriveBoard(corp.data, now) },
  );
}
