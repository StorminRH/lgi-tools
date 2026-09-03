import type { OwnedAssetOwnerType } from './schema';

export interface AssetHolding {
  ownerType: OwnedAssetOwnerType;
  ownerId: number;
  locationId: number;
  locationFlag: string;
  locationType: string;
  quantity: number;
}

export interface OwnedAssetSummary {
  ownedQty: number;
  heldBy: AssetHolding[];
}

export type OwnedAssetMap = Map<number, OwnedAssetSummary>;

export interface AssetMapInput {
  typeId: number;
  ownerType: OwnedAssetOwnerType;
  ownerId: number;
  locationId: number;
  locationFlag: string;
  locationType: string;
  quantity: number;
}

export function buildOwnedAssetMap(rows: AssetMapInput[], typeIds?: number[]): OwnedAssetMap {
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
    summary.heldBy.push({
      ownerType: row.ownerType,
      ownerId: row.ownerId,
      locationId: row.locationId,
      locationFlag: row.locationFlag,
      locationType: row.locationType,
      quantity: row.quantity,
    });
  }
  return map;
}
