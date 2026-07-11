'use client';

// The client data hook for the personal industry-jobs surfaces (MIGRATE.B.2; on the
// shared live-tracker platform since 3.7.30.1). It plugs the personal-jobs endpoint into
// the generic useLiveDataset shell (fetch-on-view → one reconcile → render-clock tick)
// and derives the per-character board map, re-deriving each job's live "ready" from its
// absolute end_date against the render clock (deriveJobsByCharacter — the seam that
// replaced the deleted Convex markReady scheduler). Shared by the /jobs panel, the
// /industry active-jobs table, and the /industry slot-meta header.
import { useMemo } from 'react';
import { useLiveDataset } from '@/components/use-live-dataset';
import { anyEligibleCold, eligibleIdsKey } from '@/lib/live-dataset';
import { industryJobsEndpoint, type JobsResponse } from './api-contract';
import { deriveJobsByCharacter } from './live-derive';

type ViewerJobs = JobsResponse['characters'][number];

// Module-level cold predicate (stable identity for the shell's effect dep): any
// scope-eligible character still un-synced (data:null) means the write-behind hasn't
// populated Neon yet, so one reconcile re-fetch is due.
function jobsIsCold(response: JobsResponse, eligibleKey: string): boolean {
  return anyEligibleCold(response.characters, eligibleKey);
}

export function useJobsLive(eligibleCharacterIds: number[]): {
  jobsByCharacter: Map<number, ViewerJobs>;
  names: Record<string, string>;
  now: number;
  loading: boolean;
} {
  const eligibleKey = useMemo(() => eligibleIdsKey(eligibleCharacterIds), [eligibleCharacterIds]);
  const { response, now, loading } = useLiveDataset(industryJobsEndpoint, eligibleKey, jobsIsCold);
  const jobsByCharacter = useMemo(() => deriveJobsByCharacter(response, now), [response, now]);
  return { jobsByCharacter, names: response?.names ?? {}, now, loading };
}
