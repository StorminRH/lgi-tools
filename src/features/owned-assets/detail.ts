import { type CorpContexts, corpContextOf } from '@/data/corp-holdings/context';
import {
  corpHoldingNameIds,
  type EntityNames,
  type FormatStation,
  isPlayerStructureId,
  labelCorpHolding,
  publicLocationName,
  STRUCTURE_LABEL,
  UNKNOWN_LOCATION_LABEL,
} from '@/data/corp-holdings/labels';
import { nameOrUnresolved } from '@/lib/format/names';
import type { EsiOwnerType } from '@/platform/owner-sync/owner-type';
import type { AssetHolding, OwnedAssetMap } from './asset-map';

const SHIP_LABEL = 'In a ship';
const CONTAINER_LABEL = 'In a container';

type CharacterHolding = Extract<AssetHolding, { ownerType: 'character' }>;

function isStructureFlag(flag: string): boolean {
  return flag === 'Hangar' || flag === 'Deliveries' || flag.startsWith('Corp');
}
function isShipFlag(flag: string): boolean {
  return /Slot\d+$/.test(flag) || /(?:Hold|Bay)$/.test(flag) || /.Hangar$/.test(flag) || flag === 'Cargo';
}

export interface ResolvedHolding {
  ownerType: EsiOwnerType;
  ownerName: string;
  locationName: string;
  locationFlag: string;
  containerName: string | null;
  quantity: number;
}

export interface OwnedAssetDetailEntry {
  typeId: number;
  ownedQty: number;
  heldBy: ResolvedHolding[];
}

function isResolvableLocation(holding: CharacterHolding): boolean {
  if (holding.locationType === 'solar_system') return true;
  if (holding.locationType === 'station') return !isPlayerStructureId(holding.locationId);
  return false;
}

function holdingNameIds(holding: AssetHolding, contexts: CorpContexts): number[] {
  if (holding.ownerType === 'corporation') {
    return corpHoldingNameIds(holding.placement, corpContextOf(contexts, holding.ownerId));
  }
  return isResolvableLocation(holding) ? [holding.locationId] : [];
}

export function collectAssetNameIds(map: OwnedAssetMap, contexts: CorpContexts): number[] {
  const ids = new Set<number>();
  for (const summary of map.values()) {
    for (const holding of summary.heldBy) {
      ids.add(holding.ownerId);
      for (const id of holdingNameIds(holding, contexts)) ids.add(id);
    }
  }
  return [...ids];
}

function resolveLocationName(holding: CharacterHolding, names: EntityNames, formatStation: FormatStation): string {
  const { locationId, locationType, locationFlag } = holding;
  if (locationType === 'station') return publicLocationName(locationId, names, formatStation);
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

function resolveHolding(
  holding: AssetHolding,
  names: EntityNames,
  formatStation: FormatStation,
  contexts: CorpContexts,
): ResolvedHolding {
  const ownerName = nameOrUnresolved(names, holding.ownerId, holding.ownerType);
  if (holding.ownerType === 'corporation') {
    const label = labelCorpHolding(holding.placement, corpContextOf(contexts, holding.ownerId), names, formatStation);
    return { ownerType: 'corporation', ownerName, ...label, quantity: holding.quantity };
  }
  return {
    ownerType: 'character',
    ownerName,
    locationName: resolveLocationName(holding, names, formatStation),
    locationFlag: '',
    containerName: null,
    quantity: holding.quantity,
  };
}

export function buildOwnedAssetDetail(
  map: OwnedAssetMap,
  names: EntityNames,
  formatStation: FormatStation,
  contexts: CorpContexts,
): OwnedAssetDetailEntry[] {
  const entries: OwnedAssetDetailEntry[] = [];
  for (const [typeId, summary] of map) {
    entries.push({
      typeId,
      ownedQty: summary.ownedQty,
      heldBy: summary.heldBy.map((holding) => resolveHolding(holding, names, formatStation, contexts)),
    });
  }
  return entries;
}
