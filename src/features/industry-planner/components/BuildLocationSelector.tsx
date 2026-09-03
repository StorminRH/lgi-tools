'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { cn } from '@/components/ui/cn';
import { Select } from '@/components/ui/select';
import { SectionLabel } from '@/components/ui/section-label';
import { TerminalSearch } from '@/components/ui/terminal-search';
import { toneTextClass } from '@/components/ui/tones';
import { Tooltip } from '@/components/ui/tooltip';
import {
  buildSystemRefOf,
  deriveBuildLocationView,
  resolveStationLabel,
  seededBuildLocation,
  stationLabel,
} from '../build-location-view';
import { facilityValueFor, parseFacilityValue, structureById } from '../facility-value';
import {
  HERO_LOCATION_CONTROL_WELL_CLASS,
  HERO_LOCATION_GROUP_CLASS,
  HERO_LOCATION_ROW_CLASS,
} from '../industry-styles';
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

function StructureReadout({
  selectedStructure,
  readout,
}: {
  selectedStructure: AvailableStructure | null;
  readout: StructureReadoutBonus;
}) {
  if (!selectedStructure) return null;
  if (readout.mfg === null && readout.rxn === null) {
    return (
      <Tooltip content="Select a build system to apply this structure's bonus">
        <span tabIndex={0} className="min-w-0 truncate text-micro text-muted">
          Select a system to apply its bonus
        </span>
      </Tooltip>
    );
  }
  return <StructureBonusReadout readout={readout} taxPct={selectedStructure.taxPct} />;
}

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
      setStation(null, null);
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
    <div className={cn(HERO_LOCATION_ROW_CLASS, 'flex-wrap')}>
      <SectionLabel prefix={false} className="w-[64px] shrink-0">Station</SectionLabel>
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
        className={cn('h-[30px]', HERO_LOCATION_CONTROL_WELL_CLASS)}
      />
    </div>
  );
}

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
    <div
      className={cn(
        HERO_LOCATION_CONTROL_WELL_CLASS,
        'flex h-[30px] items-center border border-border bg-bg px-2',
      )}
    >
      <span className="truncate text-label uppercase tracking-wide text-muted">System unavailable</span>
    </div>
  );
}

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
    <div className={HERO_LOCATION_CONTROL_WELL_CLASS}>
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
    <div className={HERO_LOCATION_ROW_CLASS}>
      <SectionLabel prefix={false} className="w-[64px] shrink-0">System</SectionLabel>
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
  const [fetchError, setFetchError] = useState(false);

  const onSubmit = useCallback(
    ({ system }: SystemParams) => {
      setFetchError(false);
      void applyBuildSystem(buildSystemRefOf(system), { persist: true }).then((outcome) => {
        if (outcome.status === 'failed') setFetchError(true);
      });
    },
    [applyBuildSystem],
  );

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
    <div className={HERO_LOCATION_GROUP_CLASS}>
      <div className="flex min-h-4 min-w-0 items-center gap-2.5">
        <span className="shrink-0 text-label uppercase tracking-eyebrow text-text">Manufacturing</span>
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
