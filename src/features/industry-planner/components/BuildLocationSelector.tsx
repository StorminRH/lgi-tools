'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Select } from '@/components/ui/select';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { toneTextClass } from '@/components/ui/tones';
import {
  buildSystemRefOf,
  deriveBuildLocationView,
  resolveStationLabel,
  seededBuildLocation,
  stationLabel,
} from '../build-location-view';
import { facilityValueFor, parseFacilityValue, structureById } from '../facility-value';
import type { StructureReadout as StructureReadoutBonus } from '../structure-factors';
import { lockTransition, type LockSystem } from '../structure-slots';
import type { AvailableStructure, IndustryStationView } from '../types';
import { useBuildSetup, type SelectedLocation } from './planner-contexts';
import { SelectedSystemBox } from './SelectedSystemBox';
import { structureOptionGroups } from './structure-options';
import { StructureBonusReadout } from './structure-bonus-readout';
import {
  useSystemSearch,
  type SystemErr,
  type SystemParams,
  type SystemSearch,
} from '@/components/use-system-search';

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
        className="min-w-0 truncate text-micro text-muted"
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
  const onChange = (value: string) => {
    const sel = parseFacilityValue(value);
    if (sel.kind === 'add-custom') {
      router.push('/structures');
      return;
    }
    if (sel.kind === 'structure') {
      onSelectStructure(structureById(structures, sel.id));
      setStation(null, null); // mutually exclusive — a structure isn't an NPC station
      return;
    }
    if (sel.kind === 'station') {
      setStation(sel.id, resolveStationLabel(stations, sel.id));
      onSelectStructure(null);
      return;
    }
    onSelectStructure(null);
    setStation(null, null);
  };
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-[64px] shrink-0 text-label uppercase tracking-wide text-muted">Station</span>
      {/* Fixed width + shrink-0 keeps the control from shifting as the selected
          label changes, so the hero plane never reflows. */}
      <Select
        value={facilityValueFor(selectedStructure, station)}
        onValueChange={onChange}
        items={[
          {
            value: '',
            label: stations.length > 0 ? `Any NPC station (${stations.length})` : '— none —',
          },
          ...structureOptionGroups(structures),
          ...(stations.length > 0
            ? [
                {
                  group: 'NPC stations',
                  options: stations.map((s) => ({ value: `station:${s.id}`, label: stationLabel(s) })),
                },
              ]
            : []),
          { value: 'add-custom', label: '+ Add custom structure…' },
        ]}
        ariaLabel="Build location"
        className="h-[30px] w-[260px] shrink-0"
      />
    </div>
  );
}

// A locked structure's system box: its deduced system (shown from the index
// before the cost-index fetch returns) or an "unavailable" placeholder while the
// index hasn't loaded that system yet. No Clear while locked — the Station
// dropdown is the single source of truth for where the build happens.
function LockedSystemBox({
  deducedSystem,
  lockedName,
}: {
  deducedSystem: LockSystem | null;
  lockedName: string;
}) {
  if (deducedSystem) {
    return <SelectedSystemBox name={deducedSystem.name} security={deducedSystem.security} locked={lockedName} />;
  }
  return (
    <div className="flex h-[30px] w-[260px] shrink-0 items-center border border-border bg-bg px-2">
      <span className="truncate text-label uppercase tracking-wide text-muted">System unavailable</span>
    </div>
  );
}

// The unlocked system control: the picked system (clearable) or the search box,
// with the fetch-failed hint below the box.
function PickedOrSearchSystem({
  location,
  clearBuildLocation,
  onSubmit,
  parse,
  suggest,
  fetchError,
}: {
  location: SelectedLocation | null;
  clearBuildLocation: () => void;
  onSubmit: (params: SystemParams) => void;
  parse: SystemSearch['parse'];
  suggest: SystemSearch['suggest'];
  fetchError: boolean;
}) {
  if (location) {
    return (
      <SelectedSystemBox name={location.systemName} security={location.security} onClear={clearBuildLocation} />
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
        onClear={clearBuildLocation}
        errorLabel="System"
      />
      {fetchError && (
        <div className={cn('mt-1 text-micro', toneTextClass('red'))}>
          Couldn&apos;t load that system — try again.
        </div>
      )}
    </div>
  );
}

// The build SYSTEM control (drives the cost index + the security a custom
// structure's rigs scale against). Every state — search box, picked, locked,
// unavailable — renders at the SAME fixed 260×30 box the station select uses,
// so picking or clearing a system never shifts the hero's plane. A locked
// structure deduce-locks its own system (its box wins over the picker).
function BuildSystemControl({
  lockedStructure,
  deducedSystem,
  location,
  clearBuildLocation,
  onSubmit,
  parse,
  suggest,
  fetchError,
}: {
  lockedStructure: AvailableStructure | null;
  deducedSystem: LockSystem | null;
  location: SelectedLocation | null;
  clearBuildLocation: () => void;
  onSubmit: (params: SystemParams) => void;
  parse: SystemSearch['parse'];
  suggest: SystemSearch['suggest'];
  fetchError: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[64px] shrink-0 text-label uppercase tracking-wide text-muted">System</span>
      {lockedStructure ? (
        <LockedSystemBox deducedSystem={deducedSystem} lockedName={lockedStructure.name} />
      ) : (
        <PickedOrSearchSystem
          location={location}
          clearBuildLocation={clearBuildLocation}
          onSubmit={onSubmit}
          parse={parse}
          suggest={suggest}
          fetchError={fetchError}
        />
      )}
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
  } = useBuildSetup();
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
      void applyBuildSystem(buildSystemRefOf(system), { persist: true }).then((outcome) => {
        if (outcome.status === 'failed') setFetchError(true);
      });
    },
    [applyBuildSystem],
  );

  // Structure selection (lifted from the facility select). A LOCKED structure
  // (corp, or a pinned custom) carries its own system, so picking one DEDUCES
  // that system and LOCKS the build location to it — the location is seeded
  // SYNCHRONOUSLY from the index entry so the bonus and the segmented list bind
  // to the locked system immediately, then the fetch fills stations/indices
  // (silent, persist:false — a deduced system must not overwrite the user's
  // saved build location). A pick whose system isn't in the index yet
  // ('lock-unresolved') keeps the structure selected and the location as-is.
  // Leaving a lock for a portable/station/none pick restores the user's saved
  // system (or clears). A portable custom pick never touches the system.
  const onSelectStructure = useCallback(
    (structure: AvailableStructure | null) => {
      const transition = lockTransition(selectedStructure, structure, systems);
      setSelectedStructure(structure);
      if (transition.kind === 'lock') {
        setLocation(seededBuildLocation(transition.system));
        void applyBuildSystem(buildSystemRefOf(transition.system), { persist: false });
      } else if (transition.kind === 'unlock') {
        if (savedBuildLocation) void applyBuildSystem(savedBuildLocation, { persist: false });
        else setLocation(null);
      }
    },
    [selectedStructure, systems, applyBuildSystem, setSelectedStructure, savedBuildLocation, setLocation],
  );

  const { lockedStructure, deducedSystem, visibleStructures, stations } = deriveBuildLocationView(
    selectedStructure,
    availableStructures,
    systems,
    location,
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
        <span className="shrink-0 font-mono text-label uppercase tracking-display text-text">Manufacturing</span>
        <StructureReadout selectedStructure={selectedStructure} readout={buildStructureReadout} />
      </div>
      <BuildSystemControl
        lockedStructure={lockedStructure}
        deducedSystem={deducedSystem}
        location={location}
        clearBuildLocation={clearBuildLocation}
        onSubmit={onSubmit}
        parse={parse}
        suggest={suggest}
        fetchError={fetchError}
      />
      {visibleStructures !== null && (
        <BuildFacilitySelect
          structures={visibleStructures}
          stations={stations}
          selectedStructure={selectedStructure}
          station={station}
          onSelectStructure={onSelectStructure}
          setStation={setStation}
        />
      )}
    </div>
  );
}
