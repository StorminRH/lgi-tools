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
import { buildLocationEndpoint } from '../api-contract';
import { formatStationName } from '../format-station-name';
import type { StructureReadout as StructureReadoutBonus } from '../structure-factors';
import type { AvailableStructure, IndustryStationView } from '../types';
import { usePricing } from './PricingProvider';
import { StructureBonusPills } from './structure-bonus-pills';
import { formatSec, useSystemSearch, type SystemErr, type SystemParams } from './use-system-search';

// The station's display label: its full in-game name (compacted) when ESI has
// resolved one, else the station-operation label as a fallback.
function stationLabel(s: IndustryStationView): string {
  return s.name ? formatStationName(s.name) : s.operationName;
}

// The "build at" structure's readout: green pills for what it hosts (manufacturing,
// plus reactions when it's a lone refinery), or a prompt when a custom structure is
// picked but no build system supplies the security yet.
function StructureReadout({
  selectedStructure,
  readout,
}: {
  selectedStructure: AvailableStructure | null;
  readout: StructureReadoutBonus;
}) {
  if (!selectedStructure) return null;
  // No bonus on either activity ⇒ no security known yet (a custom structure with no
  // build system). Keyed on the bonuses, NOT on `!location`: a corp structure
  // (3.7.9.1.5) carries its own security and shows a bonus with no planner location.
  if (readout.mfg === null && readout.rxn === null) {
    return (
      <span className="text-[10px] text-muted">
        Select a build system to apply this structure&apos;s bonus
      </span>
    );
  }
  return <StructureBonusPills readout={readout} />;
}

// The "build at" facility dropdown: the caller's structures AND, once a system is
// picked, that system's NPC stations — one list, mutually exclusive (you build in one
// place). A structure applies its bonus (scaled to the system's security); an NPC
// station is display-only. The structures show even before a system is picked; a
// custom structure then prompts for a system (its bonus needs one). For a CORP
// structure (3.7.9.1.5) the onChange deduces-and-locks the build location to the
// structure's own system (it carries `systemId`). Reactions are handled by the
// separate "react at" refinery slot (3.7.12.2) — this is the manufacturing host.
function BuildFacilitySelect({
  structures,
  stations,
  selectedStructure,
  station,
  readout,
  onSelectStructure,
  setStation,
}: {
  structures: AvailableStructure[];
  stations: IndustryStationView[];
  selectedStructure: AvailableStructure | null;
  station: { id: number } | null;
  readout: StructureReadoutBonus;
  // The parent owns structure selection: it sets the structure AND, for a corp
  // structure, deduces-and-locks the build system (this child stays a humble select).
  onSelectStructure: (structure: AvailableStructure | null) => void;
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
      onSelectStructure(structures.find((s) => s.id === id) ?? null);
      setStation(null, null); // mutually exclusive — a structure isn't an NPC station
      return;
    }
    if (v.startsWith('station:')) {
      const id = Number(v.slice('station:'.length));
      const st = stations.find((s) => s.id === id);
      setStation(id, st ? stationLabel(st) : null);
      onSelectStructure(null);
      return;
    }
    onSelectStructure(null);
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
      <StructureReadout selectedStructure={selectedStructure} readout={readout} />
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

export function BuildLocationSelector({ blueprintId }: { blueprintId: number }) {
  const { location, setLocation, station, setStation, availableStructures, selectedStructure, setSelectedStructure, buildStructureReadout } =
    usePricing();
  // The persisted build-system identifier (F4). Only the id/name/security is
  // saved; the live stations/indices/prices are re-fetched on restore. NOT
  // ssrReadable — there's no static value to render, so no cookie/flash concern.
  const [savedLoc, setSavedLoc] = usePreference(plannerBuildLocation);
  const ready = usePreferencesReady();
  const { systems, parse, suggest } = useSystemSearch();
  // Surfaced when a build-location fetch fails (non-OK or network) so a pick that
  // can't load doesn't silently leave the picker empty. Aborted (superseded)
  // fetches stay silent.
  const [fetchError, setFetchError] = useState(false);

  // Generation guard + abort so a rapid system switch applies only the last pick.
  const genRef = useRef(0);
  const ctrlRef = useRef<AbortController | null>(null);

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

  // Structure selection (lifted from the facility select). A CORP structure carries
  // its own system, so picking one DEDUCES that system and LOCKS the build location to
  // it (silent — the bonus still renders from the structure's securityClass even if the
  // cost-index fetch misses; persist:false — a deduced system must not overwrite the
  // user's own saved build location). Leaving a corp lock for a custom/station/none
  // pick restores the user's saved system (or clears). A custom pick never touches the
  // system — byte-identical to the pre-corp behaviour.
  const onSelectStructure = useCallback(
    (structure: AvailableStructure | null) => {
      const wasCorpLocked = selectedStructure?.source === 'corp' && selectedStructure.systemId !== null;
      setSelectedStructure(structure);
      if (structure?.source === 'corp' && structure.systemId !== null) {
        const sys = systems.find((s) => s.id === structure.systemId);
        // A system absent from the industry index (no industry-capable NPC station)
        // can't load cost indices — keep the structure selected (its bonus computes
        // from securityClass) and leave the location as-is rather than erroring.
        if (sys) {
          applySystem({ id: sys.id, name: sys.name, security: sys.security }, { silent: true, persist: false });
        }
        return;
      }
      if (wasCorpLocked) {
        if (savedLoc) {
          applySystem(
            { id: savedLoc.systemId, name: savedLoc.systemName, security: savedLoc.security },
            { silent: true, persist: false },
          );
        } else {
          setLocation(null);
        }
      }
    },
    [selectedStructure, systems, applySystem, setSelectedStructure, savedLoc, setLocation],
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

  // A selected CORP structure locks the build system to its own (deduce-and-lock).
  // Derived, not stored. The deduced system's display name/security come straight from
  // the index (shown immediately, before the cost-index fetch returns).
  const lockedCorpStructure =
    selectedStructure?.source === 'corp' && selectedStructure.systemId !== null ? selectedStructure : null;
  const deducedSystem = lockedCorpStructure
    ? systems.find((s) => s.id === lockedCorpStructure.systemId) ?? null
    : null;

  // The build SYSTEM control (drives the cost index + the security a custom
  // structure's rigs scale against): locked to a corp structure's system → a search
  // box until one is picked → a pill once picked.
  const systemControl = lockedCorpStructure ? (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">Build at</span>
      {deducedSystem ? (
        <Pill tone="blue">
          {deducedSystem.name} {formatSec(deducedSystem.security)}
        </Pill>
      ) : (
        <span className="text-[10px] tracking-[0.12em] uppercase text-muted">System unavailable for net margin</span>
      )}
      {/* No Clear while locked — the Location dropdown is the single source of truth
          for where the build happens; changing it there unlocks the system. */}
      <span className="text-[10px] tracking-[0.12em] uppercase text-muted">↳ locked to {lockedCorpStructure.name}</span>
    </div>
  ) : location ? (
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
          readout={buildStructureReadout}
          onSelectStructure={onSelectStructure}
          setStation={setStation}
        />
      )}
    </div>
  );
}
