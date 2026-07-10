'use client';

// The client read for the header's slot-capacity half (3.7.24): one fetch of
// /api/account/industry-slots on mount. No render clock — capacity doesn't
// tick. One delayed reconcile mirrors use-jobs-live: a character with
// synced:false means the skills write-behind is populating Neon behind the
// response (its capacity arrived as the base 1/1/1 fail-open), so we re-fetch
// ONCE to surface the real numbers without a reload (the live-surface
// no-manual-refresh invariant).
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { industrySlotsEndpoint, type IndustrySlotsResponse, type ViewerSlots } from './api-contract';

const RECONCILE_DELAY_MS = 4_000;

// Whether any character's capacity is still the never-synced fail-open — the
// signal that the skills write-behind hasn't populated Neon yet, so one
// reconcile re-fetch is due (the anyEligibleCold shape from use-jobs-live).
function anyUnsynced(characters: ViewerSlots[]): boolean {
  return characters.some((character) => !character.synced);
}

export function useSlotsLive(): { characters: ViewerSlots[]; loading: boolean } {
  const [response, setResponse] = useState<IndustrySlotsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let reconciled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(): Promise<void> {
      const result = await apiFetch(industrySlotsEndpoint);
      if (cancelled || !result.ok) return;
      setResponse(result.data);
      scheduleReconcile(result.data.characters);
    }

    function scheduleReconcile(characters: ViewerSlots[]): void {
      if (reconciled || !anyUnsynced(characters)) return;
      reconciled = true;
      timer = setTimeout(() => void load(), RECONCILE_DELAY_MS);
    }

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  return { characters: response?.characters ?? [], loading: response === null };
}
