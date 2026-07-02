'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadSystems, matchSystem, type SystemSearchEntry } from '@/data/eve-data/systems-search';

// The read-only build-system search, shared by the two location slots (Build
// at / React at). Wraps the eve-data universe index (loader + matchSystem) for
// TerminalSearch: parse resolves free text to one system, suggest feeds the
// dropdown. It carries NO selection state: the build slot layers its heavy
// system loader (cost indices + adjusted prices) on top, while the reaction
// slot only needs a system's name + security, so it just reads the matched
// entry.

const MAX_SUGGESTIONS = 10;

export type SystemParams = { system: SystemSearchEntry };
export type SystemErr = { kind: 'not_found' };

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
