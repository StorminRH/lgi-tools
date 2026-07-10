'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { toneTextClass } from '@/components/ui/tones';
import { formatStationName } from '../format-station-name';
import type { StructureReadout as StructureReadoutBonus } from '../structure-factors';
import { isSystemLocked, visibleStructuresForSlot } from '../structure-slots';
import type { AvailableStructure, IndustryStationView } from '../types';
import { usePricing } from './PricingProvider';
import { SelectedSystemBox } from './SelectedSystemBox';
import { StructureOptgroups } from './StructureOptgroups';
import { StructureBonusReadout } from './structure-bonus-readout';
import { useSystemSearch, type SystemErr, type SystemParams } from '@/components/use-system-search';

// The station's display label: its full in-game name (compacted) when ESI has
// resolved one, else the station-operation label as a fallback.
function stationLabel(s: IndustryStationView): string {
  return s.name ? formatStationName(s.name) : s.operationName;
}

// The "build at" structure's readout: the compact gem/hourglass percents for what
// it hosts (manufacturing, plus reactions when it's a lone refinery), or a prompt
// when a custom structure is picked but no build system supplies the security yet.
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
      <span
        title="Select a build system to apply this structure's bonus"
        className="min-w-0 truncate text-[10px] text-muted"
      >
        Select a system to apply its bonus
      </span>
    );
  }
  return <StructureBonusReadout readout={readout} taxPct={selectedStructure.taxPct} />;
}

// The "build at" facility dropdown, per-source segmented (3.7.13.2): the
// caller's corp structures (locked to their own system), custom structures
// (portable everywhere unless pinned), and, once a system is picked, that
// system's NPC stations — one list, mutually exclusive (you build in one
// place). The parent hands in the already-segmented visible list. A structure
// applies its bonus (scaled to the system's security); an NPC station is
// display-only. For a LOCKED structure (corp, or a pinned custom) the
// onChange deduces-and-locks the build location to the structure's own system
// (it carries `systemId`). The permanent last entry routes to the structure
// builder — the single on-ramp (the old empty-state link is gone). Reactions
// are handled by the separate "react at" refinery slot (3.7.12.2).
function BuildFacilitySelect({
  structures,
  stations,
  selectedStructure,
  station,
  onSelectStructure,
  setStation,
}: {
  structures: AvailableStructure[];
  stations: IndustryStationView[];
  selectedStructure: AvailableStructure | null;
  station: { id: number } | null;
  // The parent owns structure selection: it sets the structure AND, for a
  // locked structure, deduces-and-locks the build system (this child stays a
  // humble select). It also owns the bonus readout slot below this row.
  onSelectStructure: (structure: AvailableStructure | null) => void;
  setStation: (stationId: number | null, stationName: string | null) => void;
}) {
  const router = useRouter();
  const facilityValue = selectedStructure
    ? `structure:${selectedStructure.id}`
    : station
      ? `station:${station.id}`
      : '';
  const onChange = (v: string) => {
    if (v === 'add-custom') {
      router.push('/structures');
      return;
    }
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
      <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">Station</span>
      {/* Fixed width + shrink-0: a native select otherwise resizes to the selected
          option's text, so picking a structure would shift the control. */}
      <select
        value={facilityValue}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Build location"
        className="h-[30px] w-[260px] shrink-0 border border-border bg-bg px-2 font-mono text-[11px] text-text focus:border-border-active focus:outline-none"
      >
        <option value="">{stations.length > 0 ? `Any NPC station (${stations.length})` : '— none —'}</option>
        <StructureOptgroups structures={structures} />
        {stations.length > 0 && (
          <optgroup label="NPC stations">
            {stations.map((s) => (
              <option key={s.id} value={`station:${s.id}`}>
                {stationLabel(s)}
              </option>
            ))}
          </optgroup>
        )}
        <option value="add-custom">+ Add custom structure…</option>
      </select>
    </div>
  );
}

// The build-system / station picker. Reuses the generic <TerminalSearch> for
// the system search — suggestions dispatch the scoped systems source through
// the search engine (the whole universe, fuzzy-ranked), Enter resolves exactly
// over the same memoized index — and renders a per-station refinement once a
// system is picked. Picking a system loads its stations + cost indices +
// adjusted prices and flips the hero/ledger to net margin; clearing returns to
// gross. The station choice is display/future-score only — the fee math is
// system + structure-driven (the per-system cost index, and the structure's
// owner-set facility tax with the 0.25% NPC baseline assumed when unset), so an
// NPC station pick never changes the numbers.

export function BuildLocationSelector() {
  const {
    location,
    setLocation,
    station,
    setStation,
    availableStructures,
    selectedStructure,
    setSelectedStructure,
    buildStructureReadout,
    applyBuildSystem,
    clearBuildLocation,
    savedBuildLocation,
  } = usePricing();
  const { systems, parse, suggest } = useSystemSearch();
  // Surfaced when a build-location fetch fails (non-OK or network) so a pick that
  // can't load doesn't silently leave the picker empty. Superseded applies (a
  // faster later pick) stay silent — only a real failure surfaces.
  const [fetchError, setFetchError] = useState(false);

  // The fetch + seed + persist machinery lives on the provider (applyBuildSystem,
  // 3.7.23.1 — one generation counter across every caller); this component only
  // decides persist semantics per transition and surfaces submit failures.
  const onSubmit = useCallback(
    ({ system }: SystemParams) => {
      setFetchError(false);
      void applyBuildSystem(
        { systemId: system.id, systemName: system.name, security: system.security },
        { persist: true },
      ).then((outcome) => {
        if (outcome.status === 'failed') setFetchError(true);
      });
    },
    [applyBuildSystem],
  );

  // Structure selection (lifted from the facility select). A LOCKED structure
  // (corp, or a pinned custom — the one isSystemLocked check) carries its own
  // system, so picking one DEDUCES that system and LOCKS the build location to
  // it. The location is seeded SYNCHRONOUSLY from the index entry so the bonus
  // and the segmented list bind to the locked system immediately — a pinned
  // custom's security band must never compute against the PREVIOUS system
  // while the cost-index fetch is in flight (or forever, after a silent fetch
  // failure); the fetch then fills stations/indices/prices (silent — a corp
  // bonus still renders from its securityClass even if that fetch misses;
  // persist:false — a deduced system must not overwrite the user's own saved
  // build location). Leaving a lock for a portable/station/none pick restores
  // the user's saved system (or clears). A PORTABLE custom pick never touches
  // the system — the pre-pin behaviour, unchanged.
  const onSelectStructure = useCallback(
    (structure: AvailableStructure | null) => {
      const wasLocked = selectedStructure !== null && isSystemLocked(selectedStructure);
      setSelectedStructure(structure);
      if (structure && isSystemLocked(structure)) {
        // The index can still be empty here (a fast pick before the mount
        // fetch resolves) — keep the structure selected (a corp bonus computes
        // from securityClass) and leave the location as-is rather than error.
        const sys = systems.find((s) => s.id === structure.systemId);
        if (sys) {
          setLocation({
            systemId: sys.id,
            systemName: sys.name,
            security: sys.security,
            stations: [],
            costIndices: { manufacturing: null, reaction: null },
            adjustedPrices: new Map(),
          });
          void applyBuildSystem(
            { systemId: sys.id, systemName: sys.name, security: sys.security },
            { persist: false },
          );
        }
        return;
      }
      if (wasLocked) {
        if (savedBuildLocation) {
          void applyBuildSystem(savedBuildLocation, { persist: false });
        } else {
          setLocation(null);
        }
      }
    },
    [selectedStructure, systems, applyBuildSystem, setSelectedStructure, savedBuildLocation, setLocation],
  );

  // A selected LOCKED structure (corp or pinned custom) locks the build system
  // to its own (deduce-and-lock). Derived, not stored. The deduced system's
  // display name/security come straight from the index (shown immediately,
  // before the cost-index fetch returns).
  const lockedStructure = selectedStructure !== null && isSystemLocked(selectedStructure) ? selectedStructure : null;
  const deducedSystem = lockedStructure
    ? systems.find((s) => s.id === lockedStructure.systemId) ?? null
    : null;

  // The slot's effective system drives the per-source segmentation: a lock's
  // own system wins over the picked location (the lock's fetch may still be
  // in flight), and no system at all shows everything.
  const effectiveSystemId = lockedStructure?.systemId ?? location?.systemId ?? null;
  const visibleStructures =
    availableStructures !== null
      ? visibleStructuresForSlot(availableStructures, effectiveSystemId, selectedStructure?.id ?? null)
      : null;

  // The build SYSTEM control (drives the cost index + the security a custom
  // structure's rigs scale against). Every state — search box, picked, locked,
  // unavailable — renders at the SAME fixed 260×30 box the station select uses,
  // so picking or clearing a system never shifts the hero's plane.
  const systemControl = (
    <div className="flex items-center gap-2">
      <span className="w-[64px] shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted">System</span>
      {lockedStructure ? (
        deducedSystem ? (
          <SelectedSystemBox
            name={deducedSystem.name}
            security={deducedSystem.security}
            // No Clear while locked — the Station dropdown is the single source
            // of truth for where the build happens; changing it there unlocks.
            locked={lockedStructure.name}
          />
        ) : (
          <div className="flex h-[30px] w-[260px] shrink-0 items-center border border-border bg-bg px-2">
            <span className="truncate text-[10px] uppercase tracking-[0.12em] text-muted">System unavailable</span>
          </div>
        )
      ) : location ? (
        <SelectedSystemBox
          name={location.systemName}
          security={location.security}
          onClear={clearBuildLocation}
        />
      ) : (
        <div className="w-[260px] max-w-full">
          <TerminalSearch<SystemParams, SystemErr>
            initialValue=""
            placeholder="Build system — type a name"
            parse={parse}
            suggest={suggest}
            errorMessage={() => 'No build system matches that name.'}
            onSubmit={onSubmit}
            onClear={clearBuildLocation}
            errorLabel="System"
          />
          {fetchError && (
            <div className={cn('mt-1 text-[10px]', toneTextClass('red'))}>
              Couldn&apos;t load that system — try again.
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    // FIXED group width (label 64 + gap 8 + control 260): the header line's
    // content must truncate against it — an unconstrained flex child sizes to
    // max-content, so a long readout/prompt would widen the whole group and
    // rewrap the hero's plane (the shifting-pane bug).
    <div className="flex w-[332px] flex-col justify-center gap-1.5">
      {/* The group header carries the bonus readout (or the pick-a-system
          prompt) on its own fixed-height line, right of the title — beside the
          controls it would push them; below them it would stretch the group. */}
      <div className="flex min-h-4 min-w-0 items-center gap-2.5">
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.16em] text-text">Manufacturing</span>
        <StructureReadout selectedStructure={selectedStructure} readout={buildStructureReadout} />
      </div>
      {systemControl}
      {visibleStructures !== null && (
        <BuildFacilitySelect
          structures={visibleStructures}
          stations={location?.stations ?? []}
          selectedStructure={selectedStructure}
          station={station}
          onSelectStructure={onSelectStructure}
          setStation={setStation}
        />
      )}
    </div>
  );
}
