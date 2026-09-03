import type { OwnedBlueprintMap } from './blueprint-map';
import type { OwnedBlueprintOwnerType } from './schema';

export interface OwnedBlueprintDetailEntry {
  blueprintTypeId: number;
  me: number;
  te: number;
  ownerType: OwnedBlueprintOwnerType;
  ownerName: string;
  locationName: string;
  locationFlag: string;
}

const STRUCTURE_ID_FLOOR = 1_000_000_000_000;

export function isPlayerStructure(locationId: number): boolean {
  return locationId >= STRUCTURE_ID_FLOOR;
}

const STRUCTURE_LABEL = 'Upwell structure';
const UNKNOWN_LOCATION_LABEL = 'Unknown location';

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

function ownerFallback(ownerType: OwnedBlueprintOwnerType, ownerId: number): string {
  return ownerType === 'corporation' ? `Corporation ${ownerId}` : `Character ${ownerId}`;
}

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
