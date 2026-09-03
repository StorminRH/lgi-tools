import { formatStationName } from './format-station-name';
import type { BuildSystemRef } from './build-system-apply';
import { deduceLockedSystem, visibleStructuresForSlot, type LockSystem } from './structure-slots';
import type { AvailableStructure, IndustryStationView } from './types';
import type { SelectedLocation } from './components/planner-contexts';

export function stationLabel(s: IndustryStationView): string {
  return s.name ? formatStationName(s.name) : s.operationName;
}

export function resolveStationLabel(
  stations: IndustryStationView[],
  id: number,
): string | null {
  const st = stations.find((s) => s.id === id);
  return st ? stationLabel(st) : null;
}

export function buildSystemRefOf(system: LockSystem): BuildSystemRef {
  return { systemId: system.id, systemName: system.name, security: system.security };
}

export function savedBuildLocationRestoreOf({
  preferencesReady,
  alreadyRestored,
  location,
  savedBuildLocation,
}: {
  preferencesReady: boolean;
  alreadyRestored: boolean;
  location: SelectedLocation | null;
  savedBuildLocation: BuildSystemRef | null;
}): BuildSystemRef | null {
  if (!preferencesReady || alreadyRestored || location !== null) return null;
  return savedBuildLocation;
}

export function deriveBuildLocationView(
  selectedStructure: AvailableStructure | null,
  availableStructures: AvailableStructure[] | null,
  systems: readonly LockSystem[],
  location: SelectedLocation | null,
): {
  lockedStructure: AvailableStructure | null;
  deducedSystem: LockSystem | null;
  visibleStructures: AvailableStructure[] | null;
  stations: IndustryStationView[];
} {
  const { lockedStructure, deducedSystem, effectiveSystemId } = deduceLockedSystem(
    selectedStructure,
    systems,
    location?.systemId ?? null,
  );
  const visibleStructures =
    availableStructures !== null
      ? visibleStructuresForSlot(availableStructures, effectiveSystemId, selectedStructure?.id ?? null)
      : null;
  return { lockedStructure, deducedSystem, visibleStructures, stations: location?.stations ?? [] };
}

export function seededBuildLocation(system: LockSystem): SelectedLocation {
  return {
    systemId: system.id,
    systemName: system.name,
    security: system.security,
    stations: [],
    costIndices: { manufacturing: null, reaction: null },
    adjustedPrices: new Map(),
  };
}
