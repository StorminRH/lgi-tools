'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { systemsEndpoint } from '../api-contract';
import type { SystemSearchEntry } from '../types';

// The read-only build-system index search, shared by the primary build-location
// control (Group A) and the reaction gap-filler (Group B) — both prefix/contains-match
// the same NPC-industry system index. It carries NO selection state: A layers its heavy
// system loader (cost indices + adjusted prices) on top, while B only needs a system's
// name + security, so it just reads the matched entry.

const MAX_SUGGESTIONS = 10;

// Session-memoized lazy fetch of the system index — fetched once, never on the initial
// bundle, retried on failure (mirrors the blueprint search source).
let systemsPromise: Promise<SystemSearchEntry[]> | null = null;
function loadSystems(): Promise<SystemSearchEntry[]> {
  if (!systemsPromise) {
    systemsPromise = apiFetch(systemsEndpoint)
      .then((r) => {
        if (!r.ok) throw new Error(`systems ${r.status}`);
        return r.data.systems;
      })
      .catch((err) => {
        systemsPromise = null; // let a later mount retry rather than cache a reject
        throw err;
      });
  }
  return systemsPromise;
}

export type SystemParams = { system: SystemSearchEntry };
export type SystemErr = { kind: 'not_found' };

// The display form of a system's security status, shared by both location slots.
export function formatSec(sec: number | null): string {
  return sec === null ? '—' : sec.toFixed(1);
}

// Pure matchers over an already-loaded index (unit-tested) — the hook just wires them
// to its `systems` state. An exact name match wins, else the first prefix match.
export function matchSystem(systems: SystemSearchEntry[], input: string): SystemSearchEntry | null {
  const q = input.trim().toLowerCase();
  const exact = systems.find((s) => s.name.toLowerCase() === q);
  return exact ?? systems.find((s) => s.name.toLowerCase().startsWith(q)) ?? null;
}

// Prefix matches first, then substring matches, capped — the terminal-search suggestions.
export function suggestSystemNames(systems: SystemSearchEntry[], input: string): string[] {
  const q = input.trim().toLowerCase();
  if (q.length === 0) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const s of systems) {
    const name = s.name.toLowerCase();
    if (name.startsWith(q)) starts.push(s.name);
    else if (name.includes(q)) contains.push(s.name);
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
}

export interface SystemSearch {
  systems: SystemSearchEntry[];
  parse: (input: string) => { ok: true; params: SystemParams } | { ok: false; error: SystemErr };
  suggest: (input: string) => string[];
}

export function useSystemSearch(): SystemSearch {
  const [systems, setSystems] = useState<SystemSearchEntry[]>([]);

  useEffect(() => {
    let alive = true;
    loadSystems()
      .then((s) => {
        if (alive) setSystems(s);
      })
      .catch(() => {
        // index unavailable — the caller stays empty / gross-only
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

  const suggest = useCallback((input: string): string[] => suggestSystemNames(systems, input), [systems]);

  return { systems, parse, suggest };
}
