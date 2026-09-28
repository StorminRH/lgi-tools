import type { Placement } from '@/data/corp-holdings/placement';
import { type CorpGrant, visiblePlacements } from '@/platform/auth/corp-visibility';

export interface AssetRow {
  typeId: number;
  quantity: number;
  locationId: number;
  locationFlag: string;
  locationType: string;
}

export type AssetHolding =
  | {
      ownerType: 'character';
      ownerId: number;
      locationId: number;
      locationFlag: string;
      locationType: string;
      quantity: number;
    }
  | { ownerType: 'corporation'; ownerId: number; placement: Placement; quantity: number };

export type AssetMapInput = AssetHolding & { typeId: number };

export interface OwnedAssetSummary {
  ownedQty: number;
  heldBy: AssetHolding[];
}

export type OwnedAssetMap = Map<number, OwnedAssetSummary>;

export function characterAssetInputs(rows: readonly AssetRow[], characterId: number): AssetMapInput[] {
  return rows.map((row) => ({ ownerType: 'character', ownerId: characterId, ...row }));
}

export function visibleCorpAssetInputs(rows: readonly AssetRow[], grant: CorpGrant): AssetMapInput[] {
  return visiblePlacements(rows, grant.holdings, grant.context).map(({ row, placement }) => ({
    ownerType: 'corporation',
    ownerId: grant.corporationId,
    placement,
    typeId: row.typeId,
    quantity: row.quantity,
  }));
}

function toHolding(row: AssetMapInput): AssetHolding {
  if (row.ownerType === 'corporation') {
    return { ownerType: 'corporation', ownerId: row.ownerId, placement: row.placement, quantity: row.quantity };
  }
  return {
    ownerType: 'character',
    ownerId: row.ownerId,
    locationId: row.locationId,
    locationFlag: row.locationFlag,
    locationType: row.locationType,
    quantity: row.quantity,
  };
}

export function buildOwnedAssetMap(rows: readonly AssetMapInput[], typeIds?: number[]): OwnedAssetMap {
  const wanted = typeIds ? new Set(typeIds) : null;
  const map: OwnedAssetMap = new Map();
  for (const row of rows) {
    if (wanted !== null && !wanted.has(row.typeId)) continue;
    let summary = map.get(row.typeId);
    if (summary === undefined) {
      summary = { ownedQty: 0, heldBy: [] };
      map.set(row.typeId, summary);
    }
    summary.ownedQty += row.quantity;
    summary.heldBy.push(toHolding(row));
  }
  return map;
}
