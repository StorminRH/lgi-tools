import type { AssetHolding, OwnedAssetMap } from './asset-map';
import type { OwnedAssetOwnerType } from './schema';

const STRUCTURE_ID_FLOOR = 1_000_000_000_000;

function isPlayerStructure(locationId: number): boolean {
  return locationId >= STRUCTURE_ID_FLOOR;
}

const STRUCTURE_LABEL = 'Upwell structure';
const SHIP_LABEL = 'In a ship';
const CONTAINER_LABEL = 'In a container';
const UNKNOWN_LOCATION_LABEL = 'Unknown location';

function isStructureFlag(flag: string): boolean {
  return flag === 'Hangar' || flag === 'Deliveries' || flag.startsWith('Corp');
}
function isShipFlag(flag: string): boolean {
  return /Slot\d+$/.test(flag) || /(?:Hold|Bay)$/.test(flag) || /.Hangar$/.test(flag) || flag === 'Cargo';
}

function friendlyFlag(flag: string): string {
  const corpHangar = /^CorpSAG([1-7])$/.exec(flag);
  return corpHangar ? `Corp Hangar ${corpHangar[1]}` : '';
}

export interface ResolvedHolding {
  ownerType: OwnedAssetOwnerType;
  ownerName: string;
  locationName: string;
  locationFlag: string;
  quantity: number;
}

export interface OwnedAssetDetailEntry {
  typeId: number;
  ownedQty: number;
  heldBy: ResolvedHolding[];
}

function isResolvableLocation(holding: AssetHolding): boolean {
  if (holding.locationType === 'solar_system') return true;
  if (holding.locationType === 'station') return !isPlayerStructure(holding.locationId);
  return false;
}

export function collectAssetNameIds(map: OwnedAssetMap): number[] {
  const ids = new Set<number>();
  for (const summary of map.values()) {
    for (const holding of summary.heldBy) {
      ids.add(holding.ownerId);
      if (isResolvableLocation(holding)) ids.add(holding.locationId);
    }
  }
  return [...ids];
}

function ownerFallback(ownerType: OwnedAssetOwnerType, ownerId: number): string {
  return ownerType === 'corporation' ? `Corporation ${ownerId}` : `Character ${ownerId}`;
}

function resolveLocationName(
  locationId: number,
  locationType: string,
  locationFlag: string,
  names: Record<string, string>,
  formatStation: (name: string) => string,
): string {
  if (locationType === 'station') {
    if (isPlayerStructure(locationId)) return STRUCTURE_LABEL;
    const resolved = names[String(locationId)];
    return resolved ? formatStation(resolved) : UNKNOWN_LOCATION_LABEL;
  }
  if (locationType === 'solar_system') {
    return names[String(locationId)] ?? UNKNOWN_LOCATION_LABEL;
  }
  if (locationType === 'item') {
    if (isStructureFlag(locationFlag)) return STRUCTURE_LABEL;
    if (isShipFlag(locationFlag)) return SHIP_LABEL;
    return CONTAINER_LABEL;
  }
  return UNKNOWN_LOCATION_LABEL;
}

export function buildOwnedAssetDetail(
  map: OwnedAssetMap,
  names: Record<string, string>,
  formatStation: (name: string) => string,
): OwnedAssetDetailEntry[] {
  const entries: OwnedAssetDetailEntry[] = [];
  for (const [typeId, summary] of map) {
    entries.push({
      typeId,
      ownedQty: summary.ownedQty,
      heldBy: summary.heldBy.map((holding) => ({
        ownerType: holding.ownerType,
        ownerName: names[String(holding.ownerId)] ?? ownerFallback(holding.ownerType, holding.ownerId),
        locationName: resolveLocationName(
          holding.locationId,
          holding.locationType,
          holding.locationFlag,
          names,
          formatStation,
        ),
        locationFlag: friendlyFlag(holding.locationFlag),
        quantity: holding.quantity,
      })),
    });
  }
  return entries;
}
