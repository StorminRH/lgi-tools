'use client';

import { useMemo } from 'react';
import { type LiveDatasetState, useLiveDataset } from '@/components/use-live-dataset';
import { idsKey } from '@/lib/array';
import { anyEligibleCold } from '@/lib/live-dataset';
import { industryJobsEndpoint, type JobsResponse } from './api-contract';
import { deriveJobsByCharacter, type ViewerJobs } from './live-derive';

function jobsIsCold(response: JobsResponse, eligibleKey: string): boolean {
  return anyEligibleCold(response.characters, eligibleKey);
}

export function useJobsLive(eligibleCharacterIds: number[]): {
  jobsByCharacter: Map<number, ViewerJobs>;
} & LiveDatasetState {
  const eligibleKey = useMemo(() => idsKey(eligibleCharacterIds), [eligibleCharacterIds]);
  const { response, now, loading, failed, retry } = useLiveDataset(industryJobsEndpoint, eligibleKey, jobsIsCold);
  const jobsByCharacter = useMemo(() => deriveJobsByCharacter(response, now), [response, now]);
  return { jobsByCharacter, names: response?.names ?? {}, now, loading, failed, retry };
}
