'use client';

import { useCallback, useEffect, useState } from 'react';
import { getLoadedSystems, loadSystems, matchSystem, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import { searchAll } from '@/search';

// The read-only universe-system search for a TerminalSearch picker — SHARED
// zone: the planner's two location slots (Build at / React at) and the
// custom-structure builder's pin control all wire the same hook (features
// can't import each other, so the wiring lives here beside GlobalSearch).
// ONE search path (3.7.13.2): `suggest` dispatches the scoped systems source
// through the engine — searchAll(q, ctx, ['systems']) — while `parse`
// (Enter-to-submit) and the deduce-lock lookups resolve exactly over the SAME
// memoized index via the eve-data snapshot. It carries NO selection state:
// consumers read the matched entry and keep their own picks.

export type SystemParams = { system: SystemSearchEntry };
export type SystemErr = { kind: 'not_found' };

export interface SystemSearch {
  systems: SystemSearchEntry[];
  parse: (input: string) => { ok: true; params: SystemParams } | { ok: false; error: SystemErr };
  suggest: (input: string) => Promise<string[]>;
}

export function useSystemSearch(): SystemSearch {
  // Seeded from the shared snapshot so a second mount (the reaction row, a
  // route revisit) reads the already-loaded index synchronously.
  const [systems, setSystems] = useState<SystemSearchEntry[]>(() => getLoadedSystems() ?? []);

  useEffect(() => {
    let alive = true;
    loadSystems()
      .then((s) => {
        if (alive) setSystems(s);
      })
      .catch(() => {
        // index unavailable — parse stays empty for now; a later suggest
        // keystroke retries the same memoized loader and heals it below
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

  // Identity-stable (zero deps) — TerminalSearch's suggestion effect keys on
  // it. The scoped dispatch loads the same memoized index parse reads, so a
  // failed mount-time load heals on the first successful keystroke (no
  // suggestions-work-but-Enter-fails split).
  const suggest = useCallback(async (input: string): Promise<string[]> => {
    const sections = await searchAll(input, { session: null, isAdmin: false, recents: [] }, ['systems']);
    setSystems((prev) => (prev.length === 0 ? getLoadedSystems() ?? prev : prev));
    return sections[0]?.results.map((r) => r.label) ?? [];
  }, []);

  return { systems, parse, suggest };
}
