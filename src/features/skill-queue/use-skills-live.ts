'use client';

// The client data hook for the skill-queue surfaces (MIGRATE.B.1) — replaces the
// Convex reactive read (useQuery + the shared useLiveCharacterSync) now that skills
// lives in Neon. It fetches the per-character skills once on view from
// /api/account/skills (a stale-gated on-view write-behind read; skill names are
// resolved server-side and ride the same response), and ticks a render clock so the
// client-side countdown stays honest with NO data traffic. Shared by the home roster
// and the /skills panel — both derive the live queue progress/completion client-side
// from each entry's absolute finish_date (progress.ts); this hook only reconciles
// EXISTENCE.
//
// Auto-reconcile: the Neon table is empty on a never-synced character, so the first
// view returns data:null while the write-behind populates Neon behind the response.
// We re-fetch ONCE a few seconds later to surface that first payload without a reload
// (automatic — the live-surface no-manual-refresh invariant holds).
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { skillsEndpoint, type SkillsResponse } from './api-contract';

type ViewerSkills = SkillsResponse['characters'][number];

// Re-render cadence for the client-side timestamp math — progress bars and "done in"
// labels stay honest without any data traffic.
const TICK_MS = 30_000;
// One delayed reconcile to pick up the on-view write-behind's first payload.
const RECONCILE_DELAY_MS = 4_000;

// Whether any scope-eligible character is still un-synced (data:null) — the signal that
// the on-view write-behind hasn't populated Neon yet, so one reconcile re-fetch is due.
function anyEligibleCold(characters: ViewerSkills[], eligible: Set<number>): boolean {
  return characters.some(
    (character) => character.data === null && eligible.has(character.characterId),
  );
}

export function useSkillsLive(eligibleCharacterIds: number[]): {
  skillsByCharacter: Map<number, ViewerSkills>;
  names: Record<string, string>;
  now: number;
  loading: boolean;
} {
  const [response, setResponse] = useState<SkillsResponse | null>(null);

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
      const result = await apiFetch(skillsEndpoint);
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

  const skillsByCharacter = useMemo(() => {
    const map = new Map<number, ViewerSkills>();
    for (const character of response?.characters ?? []) map.set(character.characterId, character);
    return map;
  }, [response]);

  return { skillsByCharacter, names: response?.names ?? {}, now, loading: response === null };
}
