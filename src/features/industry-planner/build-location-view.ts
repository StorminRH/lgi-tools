// Pure helpers for the build-location slot (BuildLocationSelector): the station
// label, the locked-system seeding, and the apply-arg shaping. Kept out of the
// component so the decisions are unit-tested and the shell stays render-only.

import { formatStationName } from './format-station-name';
import type { BuildSystemRef } from './build-system-apply';
import { deduceLockedSystem, visibleStructuresForSlot, type LockSystem } from './structure-slots';
import type { AvailableStructure, IndustryStationView } from './types';
import type { SelectedLocation } from './components/planner-contexts';

// The station's display label: its compacted in-game name when ESI has resolved
// one, else the station-operation label as a fallback.
export function stationLabel(s: IndustryStationView): string {
  return s.name ? formatStationName(s.name) : s.operationName;
}

// The label to store for a station pick, or null when the id isn't in the
// current list (a stale value the select should treat as unnamed).
export function resolveStationLabel(
  stations: IndustryStationView[],
  id: number,
): string | null {
  const st = stations.find((s) => s.id === id);
  return st ? stationLabel(st) : null;
}

// The apply-arg form of a resolved lock system: the index entry's id/name/
// security renamed to the build-system ref the provider's applyBuildSystem takes.
export function buildSystemRefOf(system: LockSystem): BuildSystemRef {
  return { systemId: system.id, systemName: system.name, security: system.security };
}

// Everything the build-location slot renders from, derived in one pure pass so
// the component itself carries no derivation branching: the deduced lock state
// and the segmented structure list (null while the roster is still loading),
// plus the current system's stations. Composes the shared slot helpers.
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

// The synchronous skeleton seeded for a locked structure's deduced system before
// its cost-index fetch returns: the system plus empty stations / null indices /
// empty prices, so the bonus and the segmented list bind to the locked system
// immediately (never the previous one), and a silent fetch failure still leaves a
// coherent location rather than a mismatched one.
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
