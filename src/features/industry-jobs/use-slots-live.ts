'use client';

import { useEffect } from 'react';
import { createRememberedRead, useRememberedRead } from '@/components/remembered-read';
import { apiFetch } from '@/transport/api-client';
import type { OutcomeOf } from '@/transport/endpoint';
import { industrySlotsEndpoint, type IndustrySlotsResponse, type ViewerSlots } from './api-contract';

const RECONCILE_DELAY_MS = 5_000;
const MAX_RECONCILE_ATTEMPTS = 24;

// The last slots outlive the pages that read them, so a page mounting again draws them at once.
const slotsMemory = createRememberedRead<IndustrySlotsResponse>();

function anyUnsynced(characters: ViewerSlots[]): boolean {
  return characters.some((character) => !character.synced);
}

export function useSlotsLive(): { characters: ViewerSlots[]; loading: boolean } {
  const response = useRememberedRead(slotsMemory);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(): Promise<void> {
      const result = await apiFetch(industrySlotsEndpoint).catch(() => null);
      if (!cancelled) onResult(result);
    }

    function onResult(result: OutcomeOf<typeof industrySlotsEndpoint> | null): void {
      if (result !== null && result.ok) {
        slotsMemory.set(result.data);
        if (anyUnsynced(result.data.characters)) retry();
        return;
      }
      onFailure();
    }

    function onFailure(): void {
      // Settle as empty only when nothing was ever read; a drawn answer stays.
      if (!retry() && slotsMemory.get() === null) slotsMemory.set({ characters: [] });
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
