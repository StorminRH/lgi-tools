'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { toneTextClass } from '@/components/ui/tones';
import { apiFetch } from '@/lib/api-client';
import { buildLocationEndpoint, systemsEndpoint } from '../api-contract';
import type { SystemSearchEntry } from '../types';
import { usePricing } from './PricingProvider';

// The build-system / station picker. Reuses the generic <TerminalSearch> for the
// system search (the index is fetched once, client-side, and prefix-matched
// locally) and renders a per-station refinement once a system is picked. Picking
// a system loads its stations + cost indices + adjusted prices and flips the
// hero/ledger to net margin; clearing returns to gross. The station choice is
// display/future-score only — the fee math is system-driven (flat NPC facility
// tax, per-system cost index), so it never changes the numbers.

const MAX_SUGGESTIONS = 10;

// Session-memoized lazy fetch of the build-system index — mirrors the blueprint
// search source: fetched once, never on the initial bundle, retried on failure.
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

function formatSec(sec: number | null): string {
  return sec === null ? '—' : sec.toFixed(1);
}

type SystemParams = { system: SystemSearchEntry };
type SystemErr = { kind: 'not_found' };

export function BuildLocationSelector({ blueprintId }: { blueprintId: number }) {
  const { location, setLocation, station, setStation } = usePricing();
  const [systems, setSystems] = useState<SystemSearchEntry[]>([]);
  // Surfaced when a build-location fetch fails (non-OK or network) so a pick that
  // can't load doesn't silently leave the picker empty. Aborted (superseded)
  // fetches stay silent.
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSystems()
      .then((s) => {
        if (alive) setSystems(s);
      })
      .catch(() => {
        // index unavailable — the selector stays empty and the page is gross-only
      });
    return () => {
      alive = false;
    };
  }, []);

  // Generation guard + abort so a rapid system switch applies only the last pick.
  const genRef = useRef(0);
  const ctrlRef = useRef<AbortController | null>(null);

  const parse = useCallback(
    (
      input: string,
    ): { ok: true; params: SystemParams } | { ok: false; error: SystemErr } => {
      const q = input.trim().toLowerCase();
      const exact = systems.find((s) => s.name.toLowerCase() === q);
      const match = exact ?? systems.find((s) => s.name.toLowerCase().startsWith(q));
      return match
        ? { ok: true, params: { system: match } }
        : { ok: false, error: { kind: 'not_found' } };
    },
    [systems],
  );

  const suggest = useCallback(
    (input: string): string[] => {
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
    },
    [systems],
  );

  const onSubmit = useCallback(
    ({ system }: SystemParams) => {
      const gen = ++genRef.current;
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setFetchError(false);
      void (async () => {
        try {
          const res = await apiFetch(buildLocationEndpoint, {
            body: { systemId: system.id, blueprintId },
            cache: 'no-store',
            signal: ctrl.signal,
          });
          if (gen !== genRef.current) return; // superseded by a later pick
          if (!res.ok) {
            setFetchError(true);
            return;
          }
          setLocation({
            systemId: system.id,
            systemName: system.name,
            security: system.security,
            stations: res.data.stations,
            costIndices: res.data.costIndices,
            adjustedPrices: new Map(
              res.data.adjustedPrices.map((a) => [a.typeId, a.adjustedPrice]),
            ),
          });
        } catch {
          // A superseding pick aborts this controller — stay silent then; a real
          // network failure surfaces the error.
          if (!ctrl.signal.aborted) setFetchError(true);
        }
      })();
    },
    [blueprintId, setLocation],
  );

  if (location) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Pill tone="blue">
          {location.systemName} {formatSec(location.security)}
        </Pill>
        {location.stations.length > 0 && (
          <select
            value={station?.id ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                setStation(null, null);
                return;
              }
              const id = Number(v);
              const st = location.stations.find((s) => s.id === id);
              setStation(id, st?.operationName ?? null);
            }}
            aria-label="Build station"
            className="font-mono text-[11px] px-2 py-1 bg-bg border border-border text-text focus:outline-none focus:border-border-active"
          >
            <option value="">Any NPC station ({location.stations.length})</option>
            {location.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.operationName}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setLocation(null)}
          className="text-[10px] tracking-[0.12em] uppercase text-muted hover:text-text"
        >
          Clear
        </button>
        {fetchError && (
          <span className={cn('text-[10px]', toneTextClass('red'))}>
            Couldn&apos;t load that system — try again.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-[260px] max-w-full">
      <TerminalSearch<SystemParams, SystemErr>
        initialValue=""
        placeholder="Build system — type a name"
        parse={parse}
        suggest={suggest}
        errorMessage={() => 'No build system matches that name.'}
        onSubmit={onSubmit}
        onClear={() => setLocation(null)}
        errorLabel="System"
        hint="Pick a system for net margin"
      />
      {fetchError && (
        <div className={cn('mt-1 text-[10px]', toneTextClass('red'))}>
          Couldn&apos;t load that system — try again.
        </div>
      )}
    </div>
  );
}
