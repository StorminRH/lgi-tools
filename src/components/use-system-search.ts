'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getLoadedSystems,
  getLoadedSystemsById,
  loadSystems,
  lookupSystem,
  matchSystem,
  type SystemSearchEntry,
} from '@/data/eve-data/systems-search';
import { searchOneSource } from '@/platform/search';

export type SystemParams = { system: SystemSearchEntry };
export type SystemErr = { kind: 'not_found' };

export interface SystemSearch {
  systems: SystemSearchEntry[];
  parse: (input: string) => { ok: true; params: SystemParams } | { ok: false; error: SystemErr };
  suggest: (input: string) => Promise<string[]>;
}

const SYSTEM_INDEX_RETRY_MS = 15_000;

/**
 * The system index keyed by id, or null until it loads. A failed load tries
 * again every 15 seconds while the caller still wants it.
 */
export function useSystemsById(enabled = true): ReadonlyMap<number, SystemSearchEntry> | null {
  const [systemsById, setSystemsById] = useState(() => getLoadedSystemsById());
  const [attempt, setAttempt] = useState(0);
  const wanted = enabled && systemsById === null;
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    loadSystems()
      .then(() => {
        if (alive) setSystemsById(getLoadedSystemsById());
      })
      .catch(() => {
        if (alive) retry = setTimeout(() => setAttempt((a) => a + 1), SYSTEM_INDEX_RETRY_MS);
      });
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [wanted, attempt]);
  return systemsById;
}

export function useSystemName(systemId: number | null): string | null {
  const systemsById = useSystemsById(systemId !== null);
  return lookupSystem(systemsById, systemId)?.name ?? null;
}

export function useSystemSearch(): SystemSearch {
  const [systems, setSystems] = useState<SystemSearchEntry[]>(() => getLoadedSystems() ?? []);
  const healedRef = useRef(getLoadedSystems() !== null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    loadSystems()
      .then((s) => {
        if (alive) {
          healedRef.current = true;
          setSystems(s);
        }
      })
      .catch(() => {
      });
    return () => {
      alive = false;
    };
  }, []);

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
    const results = await searchOneSource(input, 'systems', ctrl.signal);
    if (!healedRef.current) {
      const loaded = getLoadedSystems();
      if (loaded !== null) {
        healedRef.current = true;
        setSystems(loaded);
      }
    }
    return results.map((r) => r.label);
  }, []);

  return { systems, parse, suggest };
}
