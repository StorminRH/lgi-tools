'use client';

// The client data hook for the corp industry-jobs board (MIGRATE.B.3; on the shared
// live-tracker platform since 3.7.30.1). The corp twin of use-jobs-live: it plugs the
// corp endpoint into the generic useLiveDataset shell and derives the per-corp board
// list, re-deriving each job's live "ready" from its absolute end_date against the render
// clock (deriveCorpJobs — the seam replacing the deleted Convex corp markReady scheduler).
import { useMemo } from 'react';
import { useLiveDataset } from '@/components/use-live-dataset';
import { type CorpJobsResponse, corpIndustryJobsEndpoint } from './api-contract';
import { deriveCorpJobs } from './live-derive';

type ViewerCorpJobs = CorpJobsResponse['corporations'][number];

// Module-level cold predicate (stable identity for the shell's effect dep).
//
// NOTE — deliberately NARROWER than use-jobs-live's per-character reconcile: it keys cold
// on `corporations.length === 0` (no corp written yet), not on a per-corp cold signal.
// The personal hook can do per-character (anyEligibleCold) because the client holds the
// eligible CHARACTER ids; here the client holds character ids but the corp set is resolved
// server-side from affiliations, so it can't tell "an eligible corp is missing from the
// response." Consequence: a user who already has one synced corp and joins a SECOND
// mid-session won't reconcile — the new corp surfaces on the next page view (the on-view
// write-behind still writes its row this view; only the immediate re-fetch is skipped).
// Acceptable: corp membership changes rarely, and the data is never wrong, only one view
// late. The reload key is `hasEligible` — a change in eligibility re-arms the reconcile.
function corpJobsIsCold(response: CorpJobsResponse, hasEligible: boolean): boolean {
  return hasEligible && response.corporations.length === 0;
}

/**
 * Encapsulates the corp jobs live subscription and state lifecycle; callers provide lookup keys
 * where required and render the returned state.
 */
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
