'use client';

import { useMemo } from 'react';
import { useLiveDataset } from '@/components/use-live-dataset';
import { anyEligibleCold, eligibleIdsKey } from '@/lib/live-dataset';
import { industryJobsEndpoint, type JobsResponse } from './api-contract';
import { deriveJobsByCharacter, type ViewerJobs } from './live-derive';

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
