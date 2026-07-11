import { describe, expect, it } from 'vitest';
import type { OwnedBlueprintMap, OwnedBlueprintSummary } from './blueprint-map';
import { buildOwnedDetail, collectDetailNameIds, isPlayerStructure } from './detail';

const summary = (over: Partial<OwnedBlueprintSummary> = {}): OwnedBlueprintSummary => ({
  me: 0,
  te: 0,
  runs: -1,
  owned: 1,
  ownerType: 'character',
  ownerId: 1,
  locationId: 60003760,
  locationFlag: 'Hangar',
  ...over,
});

// A loud formatter so a test can assert it ran (resolved stations) vs not (structures).
const fmt = (name: string) => `F:${name}`;

describe('isPlayerStructure', () => {
  it('treats ids at or above the 1e12 floor as structures and NPC stations below it as not', () => {
    expect(isPlayerStructure(60003760)).toBe(false);
    expect(isPlayerStructure(64_000_000)).toBe(false);
    expect(isPlayerStructure(999_999_999_999)).toBe(false);
    expect(isPlayerStructure(1_000_000_000_000)).toBe(true);
    expect(isPlayerStructure(1_036_000_000_001)).toBe(true);
  });
});

describe('collectDetailNameIds', () => {
  it('collects owners + NPC-station locations, dedupes, excludes structures and unowned/un-requested types', () => {
    const map: OwnedBlueprintMap = new Map([
      [100, summary({ ownerId: 5, locationId: 60003760 })],
      [200, summary({ ownerType: 'corporation', ownerId: 99, locationId: 1_036_000_000_001 })], // structure
      [300, summary({ ownerId: 5, locationId: 60003760 })], // duplicate owner + station
    ]);
    // 999 is requested but unowned (absent from the map) → contributes nothing.
    const ids = collectDetailNameIds(map, [100, 200, 300, 999]);
    expect([...ids].sort((a, b) => a - b)).toEqual([5, 99, 60003760]);
    // The structure's location id is never sent for resolution.
    expect(ids).not.toContain(1_036_000_000_001);
  });

  it('is empty when none of the requested types are owned', () => {
    const map: OwnedBlueprintMap = new Map([[100, summary()]]);
    expect(collectDetailNameIds(map, [555, 777])).toEqual([]);
  });
});

describe('buildOwnedDetail', () => {
  it('resolves owner + NPC-station names and applies the station formatter', () => {
    const map: OwnedBlueprintMap = new Map([
      [100, summary({ me: 10, te: 20, ownerId: 5, locationId: 60003760, locationFlag: 'Hangar' })],
    ]);
    const names = { '5': 'Alice', '60003760': 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' };
    expect(buildOwnedDetail(map, [100], names, fmt)).toEqual([
      {
        blueprintTypeId: 100,
        me: 10,
        te: 20,
        ownerType: 'character',
        ownerName: 'Alice',
        locationName: 'F:Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        locationFlag: 'Hangar',
      },
    ]);
  });

  it('degrades a player structure to a generic label without calling the formatter', () => {
    const map: OwnedBlueprintMap = new Map([
      [200, summary({ ownerType: 'corporation', ownerId: 99, locationId: 1_036_000_000_001, locationFlag: 'CorpSAG1' })],
    ]);
    const entry = buildOwnedDetail(map, [200], { '99': 'Test Corp' }, fmt)[0]!;
    expect(entry.ownerName).toBe('Test Corp');
    expect(entry.locationName).toBe('Upwell structure'); // not "F:..." → formatter not applied
    expect(entry.locationFlag).toBe('CorpSAG1');
  });

  it('degrades unresolved owners and NPC stations to honest fallbacks', () => {
    const map: OwnedBlueprintMap = new Map([
      [300, summary({ ownerType: 'character', ownerId: 7, locationId: 60000999 })],
      [400, summary({ ownerType: 'corporation', ownerId: 88, locationId: 60000999 })],
    ]);
    const [char, corp] = buildOwnedDetail(map, [300, 400], {}, fmt); // empty names → all miss
    expect(char!.ownerName).toBe('Character 7');
    expect(char!.locationName).toBe('Unknown location');
    expect(corp!.ownerName).toBe('Corporation 88');
  });

  it('emits entries only for owned requested types, in the requested order', () => {
    const map: OwnedBlueprintMap = new Map([
      [100, summary({ ownerId: 5 })],
      [200, summary({ ownerId: 6 })],
    ]);
    const entries = buildOwnedDetail(map, [200, 999, 100], {}, fmt);
    expect(entries.map((e) => e.blueprintTypeId)).toEqual([200, 100]);
  });
});
