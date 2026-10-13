'use client';

import { useCallback, useRef } from 'react';
import {
  lookupSystem,
  matchSystem,
  systemsResource,
  systemsSource,
  type SystemSearchEntry,
} from '@/data/eve-data/systems-search';
import { useClientResource } from '@/lib/client-resource';
import { searchOneSource } from '@/platform/search';

export type SystemParams = { system: SystemSearchEntry };
export type SystemErr = { kind: 'not_found' };

export interface SystemSearch {
  systems: SystemSearchEntry[];
  parse: (input: string) => { ok: true; params: SystemParams } | { ok: false; error: SystemErr };
  suggest: (input: string) => Promise<string[]>;
}

const NO_SYSTEMS: SystemSearchEntry[] = [];

/**
 * The system index keyed by id, or null until it loads. Any caller's
 * successful load reaches every reader; a failed load tries again every 15
 * seconds while any caller still wants it.
 */
export function useSystemsById(enabled = true): ReadonlyMap<number, SystemSearchEntry> | null {
  return useClientResource(systemsResource, enabled).value?.byId ?? null;
}

export function useSystemName(systemId: number | null): string | null {
  const systemsById = useSystemsById(systemId !== null);
  return lookupSystem(systemsById, systemId)?.name ?? null;
}

export function useSystemSearch(): SystemSearch {
  // A load from anywhere, the search palette included, reaches this list.
  const systems = useClientResource(systemsResource).value?.systems ?? NO_SYSTEMS;
  const ctrlRef = useRef<AbortController | null>(null);

  const parse = useCallback(
    (input: string): { ok: true; params: SystemParams } | { ok: false; error: SystemErr } => {
      const match = matchSystem(systems, input);
      return match ? { ok: true, params: { system: match } } : { ok: false, error: { kind: 'not_found' } };
    },
    [systems],
  );

  const suggest = useCallback(async (input: string): Promise<string[]> => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const results = await searchOneSource(input, systemsSource, ctrl.signal);
    return results.map((r) => r.label);
  }, []);

  return { systems, parse, suggest };
}
