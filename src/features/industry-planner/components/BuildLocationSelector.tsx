'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreference, usePreferencesReady } from '@/components/PreferencesProvider';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { toneTextClass } from '@/components/ui/tones';
import { apiFetch } from '@/lib/api-client';
import { plannerBuildLocation } from '@/lib/preferences';
import { buildLocationEndpoint, systemsEndpoint } from '../api-contract';
import { formatStationName } from '../format-station-name';
import type { StructureBonus } from '../structure-bonus';
import type { StructureFactors } from '../structure-factors';
import type { AvailableStructure, IndustryStationView, SystemSearchEntry } from '../types';
import { usePricing } from './PricingProvider';

// The station's display label: its full in-game name (compacted) when ESI has
// resolved one, else the station-operation label as a fallback.
function stationLabel(s: IndustryStationView): string {
  return s.name ? formatStationName(s.name) : s.operationName;
}

// A reduction percent for the structure-bonus readout — small values keep a decimal.
function pct(n: number): string {
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}%`;
}

// The manufacturing-side bonus parts (a Refinery / Citadel may contribute none).
function manufacturingParts(b: StructureBonus): string[] {
  const parts: string[] = [];
  if (b.me > 0) parts.push(`ME −${pct(b.me)}`);
  if (b.te > 0) parts.push(`TE −${pct(b.te)}`);
  if (b.costBonus > 0) parts.push(`Cost −${pct(b.costBonus)}`);
  return parts;
}

// The single selected structure's effect, ungated and folded into the build-
// location control: a green pill for whichever activity it bonuses (one structure
// can bonus both — a Tatara fitted for manufacturing and reactions), or a prompt
// when a custom structure is picked but no build system supplies the security yet.
function StructureReadout({
  selectedStructure,
  factors,
}: {
  selectedStructure: AvailableStructure | null;
  factors: StructureFactors;
}) {
  if (!selectedStructure) return null;
  const { manufacturingBonus, reactionBonus } = factors;
  // No bonus on either activity ⇒ no security known yet (a custom structure with no
  // build system). Keyed on the bonuses, NOT on `!location`: a corp structure
  // (3.7.9.1.5) carries its own security and shows a bonus with no planner location.
  if (manufacturingBonus === null && reactionBonus === null) {
    return (
      <span className="text-[10px] text-muted">
        Select a build system to apply this structure&apos;s bonus
      </span>
    );
  }
  const mfg = manufacturingBonus ? manufacturingParts(manufacturingBonus) : [];
  const rxn = reactionBonus && reactionBonus.te > 0 ? [`TE −${pct(reactionBonus.te)}`] : [];
  return (
    <>
      {mfg.length > 0 && <Pill tone="green">Mfg {mfg.join(' · ')}</Pill>}
      {rxn.length > 0 && <Pill tone="green">Rxn {rxn.join(' · ')}</Pill>}
    </>
  );
}

// The single build-LOCATION dropdown: the caller's structures AND, once a system
// is picked, that system's NPC stations — one list, mutually exclusive (you build
// in one place). A structure applies its bonus (scaled to the system's security);
// an NPC station is display-only. The structures show even before a system is
// picked; a custom structure then prompts for a system (its bonus needs one). For
// a CORP structure (3.7.9.1.5) the onChange will additionally deduce-and-lock the
// build location to the structure's own system (it carries `systemId`).
//
// TWO-DIFFERENT-STRUCTURES SEAM (3.7.9.1.5): a plan with reaction sub-nodes could
// use a SECOND structure for those reactions (an Azbel for mfg + a Tatara for
// reactions). That second selector is deliberately not built — one structure
// bonuses both activities for now.
function BuildFacilitySelect({
  structures,
  stations,
  selectedStructure,
  station,
  structureFactors,
  setSelectedStructure,
  setStation,
}: {
  structures: AvailableStructure[];
  stations: IndustryStationView[];
  selectedStructure: AvailableStructure | null;
  station: { id: number } | null;
  structureFactors: StructureFactors;
  setSelectedStructure: (structure: AvailableStructure | null) => void;
  setStation: (stationId: number | null, stationName: string | null) => void;
}) {
  // Nothing to choose between yet (no structures and no system's stations): a link
  // to build one.
  if (structures.length === 0 && stations.length === 0) {
    return (
      <Link
        href="/structures"
        className="self-start text-[10px] uppercase tracking-[0.12em] text-muted hover:text-text"
      >
        Add a build structure →
      </Link>
    );
  }
  const facilityValue = selectedStructure
    ? `structure:${selectedStructure.id}`
    : station
      ? `station:${station.id}`
      : '';
  const onChange = (v: string) => {
    if (v.startsWith('structure:')) {
      const id = v.slice('structure:'.length);
      setSelectedStructure(structures.find((s) => s.id === id) ?? null);
      setStation(null, null); // mutually exclusive — a structure isn't an NPC station
      return;
    }
    if (v.startsWith('station:')) {
      const id = Number(v.slice('station:'.length));
      const st = stations.find((s) => s.id === id);
      setStation(id, st ? stationLabel(st) : null);
      setSelectedStructure(null);
      return;
    }
    setSelectedStructure(null);
    setStation(null, null);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">Location</span>
      {/* Fixed width + shrink-0: a native select otherwise resizes to the selected
          option's text, so picking a structure would shift the control. */}
      <select
        value={facilityValue}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Build location"
        className="w-[260px] shrink-0 border border-border bg-bg px-2 py-1 font-mono text-[11px] text-text focus:border-border-active focus:outline-none"
      >
        <option value="">{stations.length > 0 ? `Any NPC station (${stations.length})` : '— none —'}</option>
        {structures.length > 0 && (
          <optgroup label="Your structures">
            {structures.map((s) => (
              <option key={s.id} value={`structure:${s.id}`}>
                {s.name}
              </option>
            ))}
          </optgroup>
        )}
        {stations.length > 0 && (
          <optgroup label="NPC stations">
            {stations.map((s) => (
              <option key={s.id} value={`station:${s.id}`}>
                {stationLabel(s)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <StructureReadout selectedStructure={selectedStructure} factors={structureFactors} />
    </div>
  );
}

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
  const { location, setLocation, station, setStation, availableStructures, selectedStructure, setSelectedStructure, structureFactors } =
    usePricing();
  // The persisted build-system identifier (F4). Only the id/name/security is
  // saved; the live stations/indices/prices are re-fetched on restore. NOT
  // ssrReadable — there's no static value to render, so no cookie/flash concern.
  const [savedLoc, setSavedLoc] = usePreference(plannerBuildLocation);
  const ready = usePreferencesReady();
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

  // Load a system's live build data and seed the store. Shared by a manual pick
  // (persist: true → save the identifier) and the on-mount restore (silent: a
  // restore miss stays gross-only instead of flashing an error; persist: false to
  // skip a redundant write-back). The generation/abort guard means a fast manual
  // pick supersedes an in-flight restore.
  const applySystem = useCallback(
    (
      sys: { id: number; name: string; security: number | null },
      opts: { silent: boolean; persist: boolean },
    ) => {
      const gen = ++genRef.current;
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setFetchError(false);
      void (async () => {
        try {
          const res = await apiFetch(buildLocationEndpoint, {
            body: { systemId: sys.id, blueprintId },
            cache: 'no-store',
            signal: ctrl.signal,
          });
          if (gen !== genRef.current) return; // superseded by a later pick
          if (!res.ok) {
            if (!opts.silent) setFetchError(true);
            return;
          }
          setLocation({
            systemId: sys.id,
            systemName: sys.name,
            security: sys.security,
            stations: res.data.stations,
            costIndices: res.data.costIndices,
            adjustedPrices: new Map(
              res.data.adjustedPrices.map((a) => [a.typeId, a.adjustedPrice]),
            ),
          });
          if (opts.persist) {
            setSavedLoc({ systemId: sys.id, systemName: sys.name, security: sys.security });
          }
        } catch {
          // A superseding pick aborts this controller — stay silent then; a real
          // network failure surfaces the error (unless this is a silent restore).
          if (!ctrl.signal.aborted && !opts.silent) setFetchError(true);
        }
      })();
    },
    [blueprintId, setLocation, setSavedLoc],
  );

  const onSubmit = useCallback(
    ({ system }: SystemParams) => {
      applySystem(
        { id: system.id, name: system.name, security: system.security },
        { silent: false, persist: true },
      );
    },
    [applySystem],
  );

  // Restore a previously-picked build system once the authoritative tier has
  // settled (`ready`): re-fetch its live data for THIS blueprint and seed the
  // store. Runs once; skipped if the user already picked (a manual pick wins).
  const restored = useRef(false);
  useEffect(() => {
    if (!ready || restored.current || location || !savedLoc) return;
    restored.current = true;
    applySystem(
      { id: savedLoc.systemId, name: savedLoc.systemName, security: savedLoc.security },
      { silent: true, persist: false },
    );
  }, [ready, savedLoc, location, applySystem]);

  // The build SYSTEM control (drives the cost index + the security a custom
  // structure's rigs scale against): a search box until one is picked, then a pill.
  const systemControl = location ? (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">Build at</span>
      <Pill tone="blue">
        {location.systemName} {formatSec(location.security)}
      </Pill>
      <button
        type="button"
        onClick={() => {
          setLocation(null);
          setSavedLoc(null);
        }}
        className="text-[10px] tracking-[0.12em] uppercase text-muted hover:text-text"
      >
        Clear
      </button>
    </div>
  ) : (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">Build at</span>
      <div className="w-[260px] max-w-full">
        <TerminalSearch<SystemParams, SystemErr>
          initialValue=""
          placeholder="Build system — type a name"
          parse={parse}
          suggest={suggest}
          errorMessage={() => 'No build system matches that name.'}
          onSubmit={onSubmit}
          onClear={() => {
            setLocation(null);
            setSavedLoc(null);
          }}
          errorLabel="System"
          hint="Pick a system for net margin"
        />
        {fetchError && (
          <div className={cn('mt-1 text-[10px]', toneTextClass('red'))}>
            Couldn&apos;t load that system — try again.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {systemControl}
      {availableStructures !== null && (
        <BuildFacilitySelect
          structures={availableStructures}
          stations={location?.stations ?? []}
          selectedStructure={selectedStructure}
          station={station}
          structureFactors={structureFactors}
          setSelectedStructure={setSelectedStructure}
          setStation={setStation}
        />
      )}
    </div>
  );
}
