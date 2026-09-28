import { describe, expect, it } from 'vitest';
import type { CorpHoldingContext, Placement } from '@/data/corp-holdings/placement';
import type { OwnedBlueprintMap, OwnedBlueprintSummary } from './blueprint-map';
import { buildOwnedDetail, collectDetailNameIds, isPlayerStructure } from './detail';

const CORP = 98000001;
const STATION = 60003760;
const STRUCTURE = 1_036_000_000_001;
const CAN = 3001;
const CAN_TYPE = 17366;

type CharacterSummary = Extract<OwnedBlueprintSummary, { ownerType: 'character' }>;

const summary = (over: Partial<CharacterSummary> = {}): OwnedBlueprintSummary => ({
  me: 0,
  te: 0,
  runs: -1,
  owned: 1,
  ownerType: 'character',
  ownerId: 1,
  locationId: STATION,
  locationFlag: 'Hangar',
  ...over,
});

const corpSummary = (placement: Placement, over: Partial<Pick<OwnedBlueprintSummary, 'me' | 'te'>> = {}): OwnedBlueprintSummary => ({
  me: 0,
  te: 0,
  runs: -1,
  owned: 1,
  ownerType: 'corporation',
  ownerId: CORP,
  placement,
  ...over,
});

const context: CorpHoldingContext = {
  corporationId: CORP,
  index: { interiors: new Map() },
  hq: { kind: 'known', value: STATION },
  divisionNames: { 1: 'Blueprints' },
  containerNames: new Map([[CAN, 'BPO Can']]),
  structureNames: new Map([[STRUCTURE, 'Jita Fort']]),
};
const contexts = new Map([[CORP, context]]);
const noContexts = new Map<number, CorpHoldingContext>();

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
      [200, corpSummary({ kind: 'hangar', rootId: STRUCTURE, division: 1, containers: [] })],
      [300, summary({ ownerId: 5, locationId: 60003760 })],
    ]);
    const ids = collectDetailNameIds(map, [100, 200, 300, 999], contexts);
    expect([...ids].sort((a, b) => a - b)).toEqual([5, 60003760, CORP]);
    expect(ids).not.toContain(STRUCTURE);
  });

  it('asks for a corp copy\'s NPC station and unnamed container type', () => {
    const map: OwnedBlueprintMap = new Map([
      [100, corpSummary({ kind: 'hangar', rootId: STATION, division: 2, containers: [{ itemId: 3999, typeId: CAN_TYPE }] })],
    ]);
    expect([...collectDetailNameIds(map, [100], contexts)].sort((a, b) => a - b)).toEqual([CAN_TYPE, STATION, CORP]);
  });

  it('is empty when none of the requested types are owned', () => {
    const map: OwnedBlueprintMap = new Map([[100, summary()]]);
    expect(collectDetailNameIds(map, [555, 777], noContexts)).toEqual([]);
  });
});

describe('buildOwnedDetail', () => {
  it('resolves owner + NPC-station names and applies the station formatter', () => {
    const map: OwnedBlueprintMap = new Map([
      [100, summary({ me: 10, te: 20, ownerId: 5, locationId: 60003760, locationFlag: 'Hangar' })],
    ]);
    const names = { '5': 'Alice', '60003760': 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' };
    expect(buildOwnedDetail(map, [100], names, fmt, noContexts)).toEqual([
      {
        blueprintTypeId: 100,
        me: 10,
        te: 20,
        ownerType: 'character',
        ownerName: 'Alice',
        locationName: 'F:Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        locationFlag: 'Hangar',
        containerName: null,
      },
    ]);
  });

  it('labels a corp copy with its structure, division and container from the corp context', () => {
    const map: OwnedBlueprintMap = new Map([
      [
        200,
        corpSummary(
          { kind: 'hangar', rootId: STRUCTURE, division: 1, containers: [{ itemId: CAN, typeId: CAN_TYPE }] },
          { me: 10, te: 20 },
        ),
      ],
      [300, corpSummary({ kind: 'deliveries', rootId: STATION, containers: [{ itemId: 3999, typeId: CAN_TYPE }] })],
    ]);
    const names = { [CORP]: 'Test Corp', [STATION]: 'Jita IV - Moon 4', [CAN_TYPE]: 'Station Container' };
    expect(buildOwnedDetail(map, [200, 300], names, fmt, contexts)).toEqual([
      {
        blueprintTypeId: 200,
        me: 10,
        te: 20,
        ownerType: 'corporation',
        ownerName: 'Test Corp',
        locationName: 'Jita Fort',
        locationFlag: 'Blueprints',
        containerName: 'BPO Can',
      },
      {
        blueprintTypeId: 300,
        me: 0,
        te: 0,
        ownerType: 'corporation',
        ownerName: 'Test Corp',
        locationName: 'F:Jita IV - Moon 4',
        locationFlag: 'Deliveries',
        containerName: 'Station Container',
      },
    ]);
  });

  it('degrades a corp copy in an unnamed structure to a generic label with the default division name', () => {
    const map: OwnedBlueprintMap = new Map([
      [200, corpSummary({ kind: 'hangar', rootId: 1_036_000_000_002, division: 1, containers: [] })],
    ]);
    const entry = buildOwnedDetail(map, [200], { [CORP]: 'Test Corp' }, fmt, noContexts)[0]!;
    expect(entry.ownerName).toBe('Test Corp');
    expect(entry.locationName).toBe('Upwell structure');
    expect(entry.locationFlag).toBe('1st Division');
    expect(entry.containerName).toBeNull();
  });

  it('degrades a character copy in a player structure to a generic label without calling the formatter', () => {
    const map: OwnedBlueprintMap = new Map([
      [200, summary({ ownerId: 9, locationId: 1_036_000_000_001, locationFlag: 'Hangar' })],
    ]);
    const entry = buildOwnedDetail(map, [200], {}, fmt, noContexts)[0]!;
    expect(entry.locationName).toBe('Upwell structure');
    expect(entry.locationFlag).toBe('Hangar');
  });

  it('degrades unresolved owners and NPC stations to honest fallbacks', () => {
    const map: OwnedBlueprintMap = new Map([
      [300, summary({ ownerType: 'character', ownerId: 7, locationId: 60000999 })],
      [400, corpSummary({ kind: 'unplaced', rootId: null })],
    ]);
    const [char, corp] = buildOwnedDetail(map, [300, 400], {}, fmt, contexts);
    expect(char!.ownerName).toBe('Character 7');
    expect(char!.locationName).toBe('Unknown location');
    expect(corp!.ownerName).toBe('Corporation 98000001');
    expect(corp!.locationName).toBe('Unknown location');
    expect(corp!.locationFlag).toBe('');
  });

  it('emits entries only for owned requested types, in the requested order', () => {
    const map: OwnedBlueprintMap = new Map([
      [100, summary({ ownerId: 5 })],
      [200, summary({ ownerId: 6 })],
    ]);
    const entries = buildOwnedDetail(map, [200, 999, 100], {}, fmt, noContexts);
    expect(entries.map((e) => e.blueprintTypeId)).toEqual([200, 100]);
  });
});
