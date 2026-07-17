'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Parsed terminal-search parameters containing the one selected solar-system entry. */
export type SystemParams = { system: SystemSearchEntry };
/**
 * Closed components failure contract for system err; consumers branch on the declared kind instead
 * of parsing messages.
 */
export type SystemErr = { kind: 'not_found' };

/**
 * System-search controller contract exposing controlled query state, parsed selection, validation
 * feedback, and clear or select actions.
 */
export interface SystemSearch {
  systems: SystemSearchEntry[];
  parse: (input: string) => { ok: true; params: SystemParams } | { ok: false; error: SystemErr };
  suggest: (input: string) => Promise<string[]>;
}

/**
 * The pure half of useSystemName (the Humble split): resolve an id against
 * a possibly-unloaded index. Exported for testing.
 */
export function systemNameFrom(
  systems: SystemSearchEntry[] | null,
  systemId: number | null,
): string | null {
  if (systemId === null || systems === null) return null;
  return systems.find((s) => s.id === systemId)?.name ?? null;
}

// Resolve ONE system id to its display name via the same session-memoized
// universe index the pickers load — shared zone for the same reason as the
// search hook (multiple features read system names; features can't import
// each other). Returns null until the index lands (or for an unknown id);
// callers render nothing until then. On a planner page the build-location
// picker has usually loaded the index already, so this resolves immediately.
const SYSTEM_NAME_RETRY_MS = 15_000;

/**
 * Encapsulates the system name subscription and state lifecycle; callers provide lookup keys where
 * required and render the returned state.
 */
export function useSystemName(systemId: number | null): string | null {
  const [systems, setSystems] = useState<SystemSearchEntry[] | null>(() => getLoadedSystems());
  // Bumped after a failed load to re-arm the effect — without it a single
  // transient index-load failure would leave `systems` null (and the effect
  // deps unchanged) for the rest of the mount, hiding a valid callout. The
  // shared loader memoizes success and clears itself on failure, so each
  // retry is a real attempt, and one that another consumer (a picker) has
  // already healed resolves from the snapshot instantly.
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

/**
 * Encapsulates the system search subscription and state lifecycle; callers provide lookup keys
 * where required and render the returned state.
 */
export function useSystemSearch(): SystemSearch {
  // Seeded from the shared snapshot so a second mount (the reaction row, a
  // route revisit) reads the already-loaded index synchronously.
  const [systems, setSystems] = useState<SystemSearchEntry[]>(() => getLoadedSystems() ?? []);
  // True once `systems` holds the loaded index — the mount-failure heal below
  // runs only until then, so a warm picker enqueues no per-keystroke updates.
  const healedRef = useRef(getLoadedSystems() !== null);
  // Aborts the previous keystroke's engine dispatch when the next one fires —
  // the same per-query cancellation the global search wires.
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
