// The owned-blueprint READOUT detail (3.7.5.5). Turns the per-type summary's raw
// owner + location ids into the labelled rows the planner's orb popover shows
// (ME / TE / owner / location), alongside the ME the cost path already consumes.
//
// PURE (no I/O): name resolution is injected as a plain `names` record + a station
// formatter, so this reduce is unit-tested directly and the real ESI resolver is
// wired above it (src/composition/sync/owned-blueprints-sync.ts) — the refresh.ts DI pattern.
// Readout only: nothing here feeds the cost/ME compute path.
import type { OwnedBlueprintMap } from './blueprint-map';
import type { OwnedBlueprintOwnerType } from './schema';

/** One owned component's popover detail, scoped to a requested blueprint type. */
export interface OwnedBlueprintDetailEntry {
  blueprintTypeId: number;
  me: number;
  te: number;
  ownerType: OwnedBlueprintOwnerType;
  ownerName: string;
  locationName: string;
  locationFlag: string;
}

// EVE player (Upwell) structure ids start at 1e12; NPC station ids sit far below
// (~60–64M). A structure's name needs the read_structures scope + docking access
// we deliberately don't hold, so structures degrade to a generic label — NPC
// stations resolve through the public /universe/names path like any other entity.
const STRUCTURE_ID_FLOOR = 1_000_000_000_000;

/**
 * Returns whether an asset location represents a player-owned structure rather than an NPC station
 * or inventory item.
 */
export function isPlayerStructure(locationId: number): boolean {
  return locationId >= STRUCTURE_ID_FLOOR;
}

const STRUCTURE_LABEL = 'Upwell structure';
const UNKNOWN_LOCATION_LABEL = 'Unknown location';

/**
 * The distinct ids worth a name lookup for the requested types: each owned copy's
 * owner, plus its location WHEN it is an NPC station (structures never resolve, so
 * they are excluded — no point spending the shared /universe/names budget on a
 * guaranteed miss). Deduped; only types the user actually owns contribute.
 */
export function collectDetailNameIds(map: OwnedBlueprintMap, requestedTypeIds: number[]): number[] {
  const ids = new Set<number>();
  for (const typeId of requestedTypeIds) {
    const summary = map.get(typeId);
    if (summary === undefined) continue;
    ids.add(summary.ownerId);
    if (!isPlayerStructure(summary.locationId)) ids.add(summary.locationId);
  }
  return [...ids];
}

// A human label for an owner that didn't resolve (ESI miss / flaky lookup).
function ownerFallback(ownerType: OwnedBlueprintOwnerType, ownerId: number): string {
  return ownerType === 'corporation' ? `Corporation ${ownerId}` : `Character ${ownerId}`;
}

/**
 * Assemble the popover detail for each requested type the user owns. Owner/station
 * names come from the injected `names` record (stringified-id keys, matching the
 * resolver's wire shape); a structure degrades to a generic label, an unresolved
 * station to "Unknown location".
 */
export function buildOwnedDetail(
  map: OwnedBlueprintMap,
  requestedTypeIds: number[],
  names: Record<string, string>,
  formatStation: (name: string) => string,
): OwnedBlueprintDetailEntry[] {
  const entries: OwnedBlueprintDetailEntry[] = [];
  for (const typeId of requestedTypeIds) {
    const summary = map.get(typeId);
    if (summary === undefined) continue;
    entries.push({
      blueprintTypeId: typeId,
      me: summary.me,
      te: summary.te,
      ownerType: summary.ownerType,
      ownerName: names[String(summary.ownerId)] ?? ownerFallback(summary.ownerType, summary.ownerId),
      locationName: resolveLocationName(summary.locationId, names, formatStation),
      locationFlag: summary.locationFlag,
    });
  }
  return entries;
}

function resolveLocationName(
  locationId: number,
  names: Record<string, string>,
  formatStation: (name: string) => string,
): string {
  if (isPlayerStructure(locationId)) return STRUCTURE_LABEL;
  const resolved = names[String(locationId)];
  return resolved ? formatStation(resolved) : UNKNOWN_LOCATION_LABEL;
}
