'use client';
// The selected build character's trained skill levels for the skills→time lever
// (3.7.19.1). Query-keyed state, the #196 identity-safe shape: the result is
// null unless the settled fetch matches the CURRENT characterId, so a stale
// response for a prior selection can never apply and unselecting needs no
// cleanup. Auth-identity safety is inherited upstream — the input is the
// resolved buildCharacter's id, which the auth-keyed roster collapses/re-keys
// on sign-in/out — and ownership is re-checked server-side per request. Every
// failure arm settles `levels: null` (fail-open to the no-skill baseline,
// never an error).
import { useEffect, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import { skillLevelsEndpoint } from './api-contract';

// One-shot reconcile for a cold character: the on-view write-behind is
// populating Neon behind the first response, so a single delayed re-fetch
// catches it (the use-skills-live.ts idiom, same delay).
const RECONCILE_DELAY_MS = 4_000;

/**
 * Encapsulates the build character skill levels subscription and state lifecycle; callers provide
 * lookup keys where required and render the returned state.
 */
export function useBuildCharacterSkillLevels(
  characterId: number | null,
): Record<string, number> | null {
  const [fetched, setFetched] = useState<{
    characterId: number;
    levels: Record<string, number> | null;
  } | null>(null);

  useEffect(() => {
    if (characterId === null) return; // no selection — the derived result is null below
    let ignore = false;
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    // Settle the fetched value; on the FIRST null (a cold character) schedule
    // the one-shot reconcile. Split from the .then callback so each closure
    // stays simple (the fallow complexity budget).
    const settle = (levels: Record<string, number> | null, isReconcile: boolean) => {
      setFetched({ characterId, levels });
      if (!isReconcile && levels === null) {
        reconcileTimer = setTimeout(() => load(true), RECONCILE_DELAY_MS);
      }
    };
    const load = (isReconcile: boolean) => {
      apiFetch(skillLevelsEndpoint, {
        body: { characterId },
        cache: 'no-store',
        signal: controller.signal,
      })
        .then((res) => {
          if (ignore) return;
          settle(res.ok ? res.data.levels : null, isReconcile);
        })
        .catch(() => {
          if (ignore) return;
          setFetched({ characterId, levels: null });
        });
    };
    load(false);
    return () => {
      ignore = true;
      controller.abort();
      if (reconcileTimer !== undefined) clearTimeout(reconcileTimer);
    };
  }, [characterId]);

  return fetched !== null && fetched.characterId === characterId ? fetched.levels : null;
}
