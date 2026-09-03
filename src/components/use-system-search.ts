'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLoadedSystems, loadSystems, matchSystem, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import { searchAll } from '@/platform/search';

export type SystemParams = { system: SystemSearchEntry };

export type SystemErr = { kind: 'not_found' };

export interface SystemSearch {
  systems: SystemSearchEntry[];
  parse: (input: string) => { ok: true; params: SystemParams } | { ok: false; error: SystemErr };
  suggest: (input: string) => Promise<string[]>;
}

export function systemNameFrom(
  systems: SystemSearchEntry[] | null,
  systemId: number | null,
): string | null {
  if (systemId === null || systems === null) return null;
  return systems.find((s) => s.id === systemId)?.name ?? null;
}

const SYSTEM_NAME_RETRY_MS = 15_000;

export function useSystemName(systemId: number | null): string | null {
  const [systems, setSystems] = useState<SystemSearchEntry[] | null>(() => getLoadedSystems());

  const [attempt, setAttempt] = useState(0);
  const wanted = systemId !== null && systems === null;
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    loadSystems()
      .then((s) => {
        if (alive) setSystems(s);
      })
      .catch(() => {
        if (alive) retry = setTimeout(() => setAttempt((a) => a + 1), SYSTEM_NAME_RETRY_MS);
      });
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [wanted, attempt]);
  return systemNameFrom(systems, systemId);
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
    const sections = await searchAll(
      input,
      { session: null, isAdmin: false, recents: [], signal: ctrl.signal },
      ['systems'],
    );
    if (!healedRef.current) {
      const loaded = getLoadedSystems();
      if (loaded !== null) {
        healedRef.current = true;
        setSystems(loaded);
      }
    }
    return sections[0]?.results.map((r) => r.label) ?? [];
  }, []);

  return { systems, parse, suggest };
}
