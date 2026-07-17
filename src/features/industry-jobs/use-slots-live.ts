'use client';

// The client read for the header's slot-capacity half (3.7.24): one fetch of
// /api/account/industry-slots on mount. No render clock — capacity doesn't
// tick. A character with synced:false means the skills write-behind is
// populating Neon behind the response (its capacity arrived as the base 1/1/1
// fail-open), so we keep re-fetching until every character reports synced —
// unlike the jobs hooks' single reconcile, a first-ever skills sync walks two
// ESI endpoints per character sequentially and takes tens of seconds for a
// multi-character account (observed 67s for four), so one early re-fetch
// misses it. Bounded so a character that can never sync (needs reconnect)
// doesn't poll forever; no manual refresh control (the live-surface
// invariant).
import { useEffect, useState } from 'react';
import { type ApiResult, apiFetch } from '@/lib/api-client';
import { industrySlotsEndpoint, type IndustrySlotsResponse, type ViewerSlots } from './api-contract';

const RECONCILE_DELAY_MS = 5_000;
// ~2 minutes of polling, then accept the fail-open capacity until a reload.
const MAX_RECONCILE_ATTEMPTS = 24;

// Whether any character's capacity is still the never-synced fail-open — the
// signal that the skills write-behind hasn't populated Neon yet, so another
// reconcile re-fetch is due.
function anyUnsynced(characters: ViewerSlots[]): boolean {
  return characters.some((character) => !character.synced);
}

/**
 * Encapsulates the slots live subscription and state lifecycle; callers provide lookup keys where
 * required and render the returned state.
 */
export function useSlotsLive(): { characters: ViewerSlots[]; loading: boolean } {
  const [response, setResponse] = useState<IndustrySlotsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(): Promise<void> {
      // A rejected fetch (network failure) must reach the failure path, not
      // escape the effect — normalize it to null.
      const result = await apiFetch(industrySlotsEndpoint).catch(() => null);
      if (!cancelled) onResult(result);
    }

    function onResult(result: ApiResult<IndustrySlotsResponse> | null): void {
      if (result !== null && result.ok) {
        setResponse(result.data);
        if (anyUnsynced(result.data.characters)) retry();
        return;
      }
      onFailure();
    }

    // A transient failure would otherwise blank the readout for the whole
    // page view (response stays null = loading) — retry on the same bounded
    // schedule; once attempts are exhausted, settle EMPTY (the readout hides,
    // loading ends) rather than reporting loading forever.
    function onFailure(): void {
      if (!retry()) setResponse({ characters: [] });
    }

    function retry(): boolean {
      if (attempts >= MAX_RECONCILE_ATTEMPTS) return false;
      attempts += 1;
      timer = setTimeout(() => void load(), RECONCILE_DELAY_MS);
      return true;
    }

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return { characters: response?.characters ?? [], loading: response === null };
}
