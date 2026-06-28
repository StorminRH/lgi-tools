import { describe, expect, it } from 'vitest';
import { type AssetMapInput, buildOwnedAssetMap } from './asset-map';

const row = (
  typeId: number,
  quantity: number,
  owner: Pick<AssetMapInput, 'ownerType' | 'ownerId'> = { ownerType: 'character', ownerId: 1 },
  location: Pick<AssetMapInput, 'locationId' | 'locationFlag' | 'locationType'> = {
    locationId: 60003760,
    locationFlag: 'Hangar',
    locationType: 'station',
  },
): AssetMapInput => ({ typeId, quantity, ...owner, ...location });

describe('buildOwnedAssetMap', () => {
  it('sums owned quantity and keeps a held-by entry per holding', () => {
    const map = buildOwnedAssetMap([
      row(34, 100, undefined, { locationId: 60003760, locationFlag: 'Hangar', locationType: 'station' }),
      row(34, 250, undefined, { locationId: 60008494, locationFlag: 'Hangar', locationType: 'station' }),
    ]);
    const summary = map.get(34);
    expect(summary?.ownedQty).toBe(350);
    expect(summary?.heldBy).toHaveLength(2);
    expect(summary?.heldBy[0].locationId).toBe(60003760);
    expect(summary?.heldBy[1].locationId).toBe(60008494);
  });

  it('merges holdings of one type across a character and a corporation owner', () => {
    const map = buildOwnedAssetMap([
      row(34, 100, { ownerType: 'character', ownerId: 1 }),
      row(34, 400, { ownerType: 'corporation', ownerId: 98000001 }),
    ]);
    const summary = map.get(34);
    expect(summary?.ownedQty).toBe(500);
    expect(summary?.heldBy.map((h) => h.ownerType)).toEqual(['character', 'corporation']);
    expect(summary?.heldBy[1].ownerId).toBe(98000001);
  });

  it('filters to the requested type ids when a filter is given', () => {
    const rows = [row(34, 100), row(35, 200), row(36, 300)];
    const map = buildOwnedAssetMap(rows, [34, 36]);
    expect([...map.keys()].sort((a, b) => a - b)).toEqual([34, 36]);
    expect(map.has(35)).toBe(false);
  });

  it('keeps every type when no filter is given', () => {
    const map = buildOwnedAssetMap([row(34, 1), row(35, 2)]);
    expect(map.size).toBe(2);
  });

  it('carries locationFlag, locationType and quantity verbatim onto each holding', () => {
    const map = buildOwnedAssetMap([
      row(34, 7, undefined, { locationId: 30000142, locationFlag: 'AssetSafety', locationType: 'solar_system' }),
    ]);
    expect(map.get(34)?.heldBy[0]).toEqual({
      ownerType: 'character',
      ownerId: 1,
      locationId: 30000142,
      locationFlag: 'AssetSafety',
      locationType: 'solar_system',
      quantity: 7,
    });
  });

  it('returns an empty map for no rows', () => {
    expect(buildOwnedAssetMap([]).size).toBe(0);
  });
});
