import { describe, expect, it } from 'vitest';
import type { CorpHoldingContext, Placement } from '@/data/corp-holdings/placement';
import type { OwnedBlueprintMap, OwnedBlueprintSummary } from './blueprint-map';
import { buildOwnedDetail, collectDetailNameIds } from './detail';

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

describe('collectDetailNameIds', () => {
  it('collects owners and the names a requested copy still has to resolve', () => {
    const map: OwnedBlueprintMap = new Map([
      [100, summary({ ownerId: 5, locationId: STATION })],
      [200, corpSummary({ kind: 'hangar', rootId: STRUCTURE, division: 1, containers: [] })],
      [300, summary({ ownerId: 5, locationId: STATION })],
      [400, corpSummary({ kind: 'hangar', rootId: STATION, division: 2, containers: [{ itemId: 3999, typeId: CAN_TYPE }] })],
    ]);
    expect([...collectDetailNameIds(map, [100, 200, 300, 400, 999], contexts)].sort((a, b) => a - b)).toEqual([
      5,
      CAN_TYPE,
      STATION,
      CORP,
    ]);
    expect(collectDetailNameIds(new Map([[100, summary()]]), [555, 777], noContexts)).toEqual([]);
  });
});

describe('buildOwnedDetail', () => {
  it('labels requested copies and skips types the character does not own', () => {
    const stationName = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
    const character: OwnedBlueprintMap = new Map([
      [100, summary({ me: 10, te: 20, ownerId: 5, locationId: STATION, locationFlag: 'Hangar' })],
    ]);
    expect(buildOwnedDetail(character, [100], { '5': 'Alice', [STATION]: stationName }, fmt, noContexts)).toEqual([
      {
        blueprintTypeId: 100,
        me: 10,
        te: 20,
        ownerType: 'character',
        ownerName: 'Alice',
        locationName: `F:${stationName}`,
        locationFlag: 'Hangar',
        containerName: null,
      },
    ]);

    const corp: OwnedBlueprintMap = new Map([
      [
        200,
        corpSummary(
          { kind: 'hangar', rootId: STRUCTURE, division: 1, containers: [{ itemId: CAN, typeId: CAN_TYPE }] },
          { me: 10, te: 20 },
        ),
      ],
    ]);
    expect(buildOwnedDetail(corp, [200], { [CORP]: 'Test Corp' }, fmt, contexts)).toEqual([
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
    ]);

    const structure: OwnedBlueprintMap = new Map([
      [200, summary({ ownerId: 9, locationId: STRUCTURE, locationFlag: 'Hangar' })],
    ]);
    expect(buildOwnedDetail(structure, [200], {}, fmt, noContexts)[0]).toMatchObject({
      locationName: 'Upwell structure',
      locationFlag: 'Hangar',
    });

    const unresolved: OwnedBlueprintMap = new Map([
      [300, summary({ ownerId: 7, locationId: 60000999 })],
      [400, corpSummary({ kind: 'unplaced', rootId: null })],
    ]);
    const [char, corpEntry] = buildOwnedDetail(unresolved, [300, 400], {}, fmt, contexts);
    expect(char).toMatchObject({ ownerName: 'Character 7', locationName: 'Unknown location' });
    expect(corpEntry).toMatchObject({ ownerName: `Corporation ${CORP}`, locationName: 'Unknown location', locationFlag: '' });

    const ordered: OwnedBlueprintMap = new Map([
      [100, summary({ ownerId: 5 })],
      [200, summary({ ownerId: 6 })],
    ]);
    expect(buildOwnedDetail(ordered, [200, 999, 100], {}, fmt, noContexts).map((entry) => entry.blueprintTypeId)).toEqual([
      200,
      100,
    ]);
  });
});
