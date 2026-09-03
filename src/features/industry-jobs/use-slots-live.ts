'use client';

// ESI endpoints per character sequentially and takes tens of seconds for a

import { useEffect, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import type { OutcomeOf } from '@/transport/endpoint';
import { industrySlotsEndpoint, type IndustrySlotsResponse, type ViewerSlots } from './api-contract';

const RECONCILE_DELAY_MS = 5_000;

const MAX_RECONCILE_ATTEMPTS = 24;

function anyUnsynced(characters: ViewerSlots[]): boolean {
  return characters.some((character) => !character.synced);
}

export function useSlotsLive(): { characters: ViewerSlots[]; loading: boolean } {
  const [response, setResponse] = useState<IndustrySlotsResponse | null>(null);

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
        setResponse(result.data);
        if (anyUnsynced(result.data.characters)) retry();
        return;
      }
      onFailure();
    }

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
