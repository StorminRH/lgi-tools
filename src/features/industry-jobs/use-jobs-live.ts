'use client';

// The client data hook for the personal industry-jobs surfaces (MIGRATE.B.2) — replaces
// the Convex reactive read (useQuery + the shared useLiveCharacterSync) now that personal
// jobs lives in Neon. It fetches the per-character boards once on view from
// /api/account/industry-jobs (a stale-gated on-view write-behind read; blueprint/product
// names are resolved server-side and ride the same response), and ticks a render clock so
// the client-side countdown stays honest with NO data traffic. Shared by the /jobs panel,
// the /industry active-jobs table, and the /industry slot-meta header.
//
// Timer-derived "ready": each job carries its ABSOLUTE end_date and its raw ESI status;
// this hook re-derives status client-side via deriveJobStatus(status, end_date, now) on
// every tick — the single seam that REPLACES the deleted Convex markReady scheduler. A
// job past its end_date flips to 'ready' on the next tick with no reload and no server
// round-trip; the on-view fetch reconciles only EXISTENCE (new / delivered jobs).
//
// Auto-reconcile: the Neon table is empty on a never-synced character, so the first view
// returns data:null while the write-behind populates Neon behind the response. We
// re-fetch ONCE a few seconds later to surface that first payload without a reload
// (automatic — the live-surface no-manual-refresh invariant holds).
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { industryJobsEndpoint, type JobsResponse } from './api-contract';
import { deriveJobStatus } from './job-state';

type ViewerJobs = JobsResponse['characters'][number];

// Re-render cadence for the client-side timestamp math — countdowns and the ready flip
// stay honest without any data traffic.
const TICK_MS = 30_000;
// One delayed reconcile to pick up the on-view write-behind's first payload.
const RECONCILE_DELAY_MS = 4_000;

// Whether any scope-eligible character is still un-synced (data:null) — the signal that
// the on-view write-behind hasn't populated Neon yet, so one reconcile re-fetch is due.
function anyEligibleCold(characters: ViewerJobs[], eligible: Set<number>): boolean {
  return characters.some(
    (character) => character.data === null && eligible.has(character.characterId),
  );
}

export function useJobsLive(eligibleCharacterIds: number[]): {
  jobsByCharacter: Map<number, ViewerJobs>;
  names: Record<string, string>;
  now: number;
  loading: boolean;
} {
  const [response, setResponse] = useState<JobsResponse | null>(null);

  // Stable dependency: the set of characters whose cold (data:null) state should
  // trigger the one-shot reconcile. A needs-reconnect character never syncs, so the
  // caller passes only eligible ids — otherwise the reconcile would always fire.
  const eligibleKey = useMemo(
    () => [...new Set(eligibleCharacterIds)].sort((a, b) => a - b).join(','),
    [eligibleCharacterIds],
  );

  useEffect(() => {
    const eligible = new Set(eligibleKey === '' ? [] : eligibleKey.split(',').map(Number));
    let cancelled = false;
    let reconciled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      const result = await apiFetch(industryJobsEndpoint);
      if (cancelled || !result.ok) return;
      setResponse(result.data);
      // If an eligible character is still cold, the write-behind is populating Neon
      // — re-fetch ONCE to surface it.
      if (!reconciled && anyEligibleCold(result.data.characters, eligible)) {
        reconciled = true;
        timer = setTimeout(() => void load(), RECONCILE_DELAY_MS);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [eligibleKey]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Pre-derive each job's status client-side from its absolute end_date against the
  // render clock — the single seam replacing the deleted markReady scheduler. Rebuilds
  // each tick, so a job flips to 'ready' the moment now ≥ end_date; every other status
  // passes through unchanged, so consumers read job.status as before.
  const jobsByCharacter = useMemo(() => {
    const map = new Map<number, ViewerJobs>();
    for (const character of response?.characters ?? []) {
      const derived: ViewerJobs =
        character.data === null
          ? character
          : {
              ...character,
              data: {
                jobs: character.data.jobs.map((job) => ({
                  ...job,
                  status: deriveJobStatus(job.status, job.end_date, now),
                })),
              },
            };
      map.set(character.characterId, derived);
    }
    return map;
  }, [response, now]);

  return { jobsByCharacter, names: response?.names ?? {}, now, loading: response === null };
}
