import { describe, expect, it } from 'vitest';
import type { AssetHolding, OwnedAssetMap, OwnedAssetSummary } from './asset-map';
import { buildOwnedAssetDetail, collectAssetNameIds } from './detail';

const holding = (over: Partial<AssetHolding> = {}): AssetHolding => ({
  ownerType: 'character',
  ownerId: 1,
  locationId: 60003760,
  locationFlag: 'Hangar',
  locationType: 'station',
  quantity: 100,
  ...over,
});

const summary = (heldBy: AssetHolding[]): OwnedAssetSummary => ({
  ownedQty: heldBy.reduce((sum, h) => sum + h.quantity, 0),
  heldBy,
});

// A loud formatter so a test can assert it ran (NPC stations) vs not (everything else).
const fmt = (name: string) => `F:${name}`;

describe('collectAssetNameIds', () => {
  it('collects owners always + only resolvable locations (NPC station, solar system)', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerId: 5, locationId: 60003760, locationType: 'station' })])],
      [35, summary([holding({ ownerId: 5, locationId: 30000142, locationType: 'solar_system' })])],
      [36, summary([holding({ ownerId: 9, locationId: 1_036_000_000_001, locationType: 'station' })])], // structure
      [37, summary([holding({ ownerId: 9, locationId: 1_400_000_000_001, locationType: 'item' })])], // container
      [38, summary([holding({ ownerId: 9, locationId: 12_345, locationType: 'other' })])],
    ]);
    const ids = collectAssetNameIds(map);
    expect([...ids].sort((a, b) => a - b)).toEqual([5, 9, 30000142, 60003760]);
    expect(ids).not.toContain(1_036_000_000_001); // structure location never resolved
    expect(ids).not.toContain(1_400_000_000_001); // container item id never resolved
    expect(ids).not.toContain(12_345); // 'other' never resolved
  });

  it('is empty for an empty map', () => {
    expect(collectAssetNameIds(new Map())).toEqual([]);
  });
});

describe('buildOwnedAssetDetail', () => {
  it('resolves owner + NPC-station names and applies the station formatter', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerId: 5, locationId: 60003760, locationFlag: 'Hangar', quantity: 250 })])],
    ]);
    const names = { '5': 'Alice', '60003760': 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' };
    expect(buildOwnedAssetDetail(map, names, fmt)).toEqual([
      {
        typeId: 34,
        ownedQty: 250,
        heldBy: [
          {
            ownerType: 'character',
            ownerName: 'Alice',
            locationName: 'F:Jita IV - Moon 4 - Caldari Navy Assembly Plant',
            locationFlag: '', // a plain station 'Hangar' carries no division label
            quantity: 250,
          },
        ],
      },
    ]);
  });

  it('degrades a structure-floor station id to a generic label without the formatter', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 1_036_000_000_001, locationFlag: 'Hangar', locationType: 'station' })])],
    ]);
    const [entry] = buildOwnedAssetDetail(map, {}, fmt);
    expect(entry!.heldBy[0]!.locationName).toBe('Upwell structure'); // not "F:..." → formatter not applied
    expect(entry!.heldBy[0]!.locationFlag).toBe(''); // 'Hangar' carries no division label
  });

  it('names the kind of nested parent from the location flag, with a friendly corp division', () => {
    const nested = (flag: string) =>
      summary([holding({ locationId: 1_053_000_000_001, locationFlag: flag, locationType: 'item' })]);
    const map: OwnedAssetMap = new Map([
      [1, nested('CorpSAG4')], // corp hangar division → structure + friendly division label
      [2, nested('Hangar')], // personal hangar → structure
      [3, nested('Cargo')], // ship hold → ship
      [4, nested('HiSlot0')], // fitting slot → ship
      [5, nested('Unlocked')], // unlocked container → container
      [6, nested('SomethingNew')], // unknown nesting → safe generic container
    ]);
    const byType = new Map(buildOwnedAssetDetail(map, {}, fmt).map((e) => [e.typeId, e.heldBy[0]]));
    expect(byType.get(1)).toMatchObject({ locationName: 'Upwell structure', locationFlag: 'Corp Hangar 4' });
    expect(byType.get(2)).toMatchObject({ locationName: 'Upwell structure', locationFlag: '' });
    expect(byType.get(3)).toMatchObject({ locationName: 'In a ship', locationFlag: '' });
    expect(byType.get(4)).toMatchObject({ locationName: 'In a ship', locationFlag: '' });
    expect(byType.get(5)).toMatchObject({ locationName: 'In a container', locationFlag: '' });
    expect(byType.get(6)).toMatchObject({ locationName: 'In a container', locationFlag: '' });
  });

  it('shows a solar-system name verbatim (not station-formatted), degrading on a miss', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 30000142, locationType: 'solar_system' })])],
      [35, summary([holding({ locationId: 30009999, locationType: 'solar_system' })])],
    ]);
    const [resolved, missed] = buildOwnedAssetDetail(map, { '30000142': 'Jita' }, fmt);
    expect(resolved!.heldBy[0]!.locationName).toBe('Jita'); // verbatim, no "F:" prefix
    expect(missed!.heldBy[0]!.locationName).toBe('Unknown location');
  });

  it('degrades an unknown (other) location type', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 555, locationType: 'other' })])],
    ]);
    const [entry] = buildOwnedAssetDetail(map, {}, fmt);
    expect(entry!.heldBy[0]!.locationName).toBe('Unknown location');
  });

  it('falls back to honest owner labels when names miss', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ ownerType: 'character', ownerId: 7 }), holding({ ownerType: 'corporation', ownerId: 88 })])],
    ]);
    const [entry] = buildOwnedAssetDetail(map, {}, fmt);
    expect(entry!.heldBy.map((h) => h.ownerName)).toEqual(['Character 7', 'Corporation 88']);
  });

  it('emits one entry per type with its full held-by list and summed owned qty', () => {
    const map: OwnedAssetMap = new Map([
      [34, summary([holding({ locationId: 60003760, quantity: 100 }), holding({ locationId: 60008494, quantity: 250 })])],
    ]);
    const [entry] = buildOwnedAssetDetail(map, {}, fmt);
    expect(entry!.ownedQty).toBe(350);
    expect(entry!.heldBy).toHaveLength(2);
    expect(entry!.heldBy.map((h) => h.quantity)).toEqual([100, 250]);
  });
});
