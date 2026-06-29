'use client';

// The client data hook for the corp industry-jobs board (MIGRATE.B.3) — replaces the
// Convex reactive read (useQuery + the shared useLiveCharacterSync) now that corp jobs
// lives in Neon. It fetches the per-corp boards once on view from
// /api/account/corp-industry-jobs (a stale-gated on-view write-behind read; blueprint/
// product names are resolved server-side and ride the same response), and ticks a
// render clock so the client-side countdown stays honest with NO data traffic. The corp
// twin of use-jobs-live.ts.
//
// Timer-derived "ready": each job carries its ABSOLUTE end_date and its raw ESI status;
// this hook re-derives status client-side via deriveJobStatus(status, end_date, now) on
// every tick — the seam that REPLACES the deleted Convex corp markReady scheduler. A job
// past its end_date flips to 'ready' on the next tick with no reload; the on-view fetch
// reconciles only EXISTENCE (new / delivered jobs).
//
// Auto-reconcile: a first-ever view returns no corp rows yet (the on-view write-behind
// is still resolving directors + populating Neon behind the response). When the user has
// corp-eligible characters but the response carries no corporations, we re-fetch ONCE a
// few seconds later to surface that first payload without a reload (automatic — the
// live-surface no-manual-refresh invariant holds).
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { type CorpJobsResponse, corpIndustryJobsEndpoint } from './api-contract';
import { deriveJobStatus } from './job-state';

type ViewerCorpJobs = CorpJobsResponse['corporations'][number];

// Re-render cadence for the client-side timestamp math — countdowns and the ready flip
// stay honest without any data traffic.
const TICK_MS = 30_000;
// One delayed reconcile to pick up the on-view write-behind's first payload.
const RECONCILE_DELAY_MS = 4_000;

export function useCorpJobsLive(eligibleCharacterIds: number[]): {
  corporations: ViewerCorpJobs[];
  names: Record<string, string>;
  now: number;
  loading: boolean;
} {
  const [response, setResponse] = useState<CorpJobsResponse | null>(null);

  // The reconcile fires once when the user CAN read corp jobs (has eligible characters)
  // but no corp rows have landed yet — the cold first view. A change in eligibility
  // re-arms it.
  const hasEligible = eligibleCharacterIds.length > 0;

  useEffect(() => {
    let cancelled = false;
    let reconciled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      const result = await apiFetch(corpIndustryJobsEndpoint);
      if (cancelled || !result.ok) return;
      setResponse(result.data);
      // Eligible but no corps yet → the write-behind is still populating Neon; re-fetch
      // ONCE to surface it.
      if (!reconciled && hasEligible && result.data.corporations.length === 0) {
        reconciled = true;
        timer = setTimeout(() => void load(), RECONCILE_DELAY_MS);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [hasEligible]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Pre-derive each job's status client-side from its absolute end_date against the
  // render clock — the seam replacing the deleted corp markReady scheduler. Rebuilds
  // each tick, so a job flips to 'ready' the moment now ≥ end_date; every other status
  // passes through unchanged.
  const corporations = useMemo<ViewerCorpJobs[]>(() => {
    return (response?.corporations ?? []).map((corp) =>
      corp.data === null
        ? corp
        : {
            ...corp,
            data: {
              jobs: corp.data.jobs.map((job) => ({
                ...job,
                status: deriveJobStatus(job.status, job.end_date, now),
              })),
            },
          },
    );
  }, [response, now]);

  return { corporations, names: response?.names ?? {}, now, loading: response === null };
}
