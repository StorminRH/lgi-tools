'use client';

import { useMemo } from 'react';
import { useLiveDataset } from '@/components/use-live-dataset';
import { type CorpJobsResponse, corpIndustryJobsEndpoint } from './api-contract';
import { deriveCorpJobs, type ViewerCorpJobs } from './live-derive';

function corpJobsIsCold(response: CorpJobsResponse, hasEligible: boolean): boolean {
  return hasEligible && response.corporations.length === 0;
}

export function useCorpJobsLive(eligibleCharacterIds: number[]): {
  corporations: ViewerCorpJobs[];
  names: Record<string, string>;
  now: number;
  loading: boolean;
} {
  const hasEligible = eligibleCharacterIds.length > 0;
  const { response, now, loading } = useLiveDataset(corpIndustryJobsEndpoint, hasEligible, corpJobsIsCold);
  const corporations = useMemo(() => deriveCorpJobs(response, now), [response, now]);
  return { corporations, names: response?.names ?? {}, now, loading };
}
