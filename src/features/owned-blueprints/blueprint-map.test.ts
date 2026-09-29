import { describe, expect, it } from 'vitest';
import { buildCorpHoldingContext } from '@/data/corp-holdings/context';
import { buildHoldingIndex, type CorpAssetItem, toHoldingNodes } from '@/data/corp-holdings/placement';
import type { CorpRole } from '@/platform/auth/corp-roles';
import { compileCorpGrant, type CorpGrant } from '@/platform/auth/corp-visibility';
import {
  type BlueprintMapInput,
  type BlueprintRow,
  characterBlueprintInputs,
  toOwnedBlueprintMap,
  visibleCorpBlueprintInputs,
} from './blueprint-map';

const CORP = 98000001;
const STATION = 60003760;
const OFFICE = 1001;

const row = (
  typeId: number,
  me: number,
  te: number,
  runs: number,
  owner: { ownerType: 'character'; ownerId: number } = { ownerType: 'character', ownerId: 1 },
  location: Pick<BlueprintRow, 'locationId' | 'locationFlag'> = {
    locationId: STATION,
    locationFlag: 'Hangar',
  },
): BlueprintMapInput => ({
  typeId,
  materialEfficiency: me,
  timeEfficiency: te,
  runs,
  ...owner,
  ...location,
});

function item(
  itemId: number,
  locationId: number,
  locationType: CorpAssetItem['locationType'],
  locationFlag: string,
  typeId = 34,
): CorpAssetItem {
  return { itemId, typeId, locationId, locationType, locationFlag };
}

const items = [
  item(OFFICE, STATION, 'station', 'OfficeFolder', 27),
  item(2001, OFFICE, 'item', 'CorpSAG1'),
  item(2002, OFFICE, 'item', 'CorpSAG2'),
];
const index = buildHoldingIndex(items);
const evidence = { corporationId: CORP, index, items };
const context = buildCorpHoldingContext(CORP, toHoldingNodes(index), null);

function grantWith(roles: CorpRole[]): CorpGrant {
  return compileCorpGrant({
    corporationId: CORP,
    sharing: 'on',
    context,
    members: [
      {
        characterId: 1,
        roles: { kind: 'known', roles: { global: new Set(roles), atHq: new Set(), atBase: new Set(), atOther: new Set() } },
        base: { kind: 'known', value: null },
      },
    ],
  });
}

const corpRows: BlueprintRow[] = [
  { itemId: 2002, typeId: 34, materialEfficiency: 10, timeEfficiency: 20, runs: -1, locationId: OFFICE, locationFlag: 'CorpSAG2' },
  { itemId: 2001, typeId: 34, materialEfficiency: 5, timeEfficiency: 10, runs: 30, locationId: OFFICE, locationFlag: 'CorpSAG1' },
];

describe('visibleCorpBlueprintInputs', () => {
  it('keeps only the copies the blueprint rule can see, with their placement', () => {
    expect(visibleCorpBlueprintInputs(corpRows, grantWith(['Hangar_Query_1']), evidence)).toEqual([
      {
        ownerType: 'corporation',
        ownerId: CORP,
        placement: { kind: 'hangar', rootId: STATION, division: 1, containers: [] },
        typeId: 34,
        materialEfficiency: 5,
        timeEfficiency: 10,
        runs: 30,
      },
    ]);
  });

  it('gives a Factory Manager every corp copy regardless of hangar access', () => {
    expect(visibleCorpBlueprintInputs(corpRows, grantWith(['Factory_Manager'])).map((input) => input.materialEfficiency)).toEqual([
      10, 5,
    ]);
  });
});

describe('toOwnedBlueprintMap', () => {
  it('never lets a hidden corp BPO win the ME, and counts only visible copies', () => {
    const map = toOwnedBlueprintMap([
      ...characterBlueprintInputs([{ typeId: 34, materialEfficiency: 7, timeEfficiency: 14, runs: -1, locationId: STATION, locationFlag: 'Hangar' }], 1),
      ...visibleCorpBlueprintInputs(corpRows, grantWith(['Hangar_Query_1']), evidence),
    ]);
    expect(map.get(34)).toEqual({
      me: 7,
      te: 14,
      runs: -1,
      owned: 2,
      ownerType: 'character',
      ownerId: 1,
      locationId: STATION,
      locationFlag: 'Hangar',
    });
  });

  it('lets a visible corp BPO win and records its placement', () => {
    const map = toOwnedBlueprintMap([
      ...characterBlueprintInputs([{ typeId: 34, materialEfficiency: 7, timeEfficiency: 14, runs: -1, locationId: STATION, locationFlag: 'Hangar' }], 1),
      ...visibleCorpBlueprintInputs(corpRows, grantWith(['Hangar_Query_2']), evidence),
    ]);
    expect(map.get(34)).toEqual({
      me: 10,
      te: 20,
      runs: -1,
      owned: 2,
      ownerType: 'corporation',
      ownerId: CORP,
      placement: { kind: 'hangar', rootId: STATION, division: 2, containers: [] },
    });
  });

  it('keeps the best (highest-ME) copy per type and counts how many are owned', () => {
    const map = toOwnedBlueprintMap([row(34, 5, 10, -1), row(34, 10, 20, 30), row(99, 0, 0, -1)]);
    expect(map.get(34)).toEqual({
      me: 10,
      te: 20,
      runs: 30,
      owned: 2,
      ownerType: 'character',
      ownerId: 1,
      locationId: STATION,
      locationFlag: 'Hangar',
    });
    expect(map.get(99)).toEqual({
      me: 0,
      te: 0,
      runs: -1,
      owned: 1,
      ownerType: 'character',
      ownerId: 1,
      locationId: STATION,
      locationFlag: 'Hangar',
    });
  });

  it('breaks an ME tie by TE, then by runs', () => {
    const map = toOwnedBlueprintMap([row(1, 10, 5, 1), row(1, 10, 8, 1), row(1, 10, 8, 5)]);
    expect(map.get(1)).toMatchObject({ me: 10, te: 8, runs: 5, owned: 3 });
  });

  it('prefers a BPO (infinite runs = -1) over a BPC on a same-ME/TE tie, regardless of order', () => {
    const bpc = row(34, 10, 20, 30, { ownerType: 'character', ownerId: 9 });
    const bpo = row(34, 10, 20, -1, { ownerType: 'character', ownerId: 1 });
    expect(toOwnedBlueprintMap([bpc, bpo]).get(34)).toMatchObject({ runs: -1, ownerType: 'character', ownerId: 1 });
    expect(toOwnedBlueprintMap([bpo, bpc]).get(34)).toMatchObject({ runs: -1, ownerType: 'character', ownerId: 1 });
  });

  it('records the winning copy owner + location, not the first-seen copy', () => {
    const map = toOwnedBlueprintMap([
      row(34, 5, 0, -1, { ownerType: 'character', ownerId: 100 }, { locationId: STATION, locationFlag: 'Hangar' }),
      row(34, 10, 0, 30, { ownerType: 'character', ownerId: 200 }, { locationId: 60008494, locationFlag: 'Deliveries' }),
    ]);
    expect(map.get(34)).toMatchObject({
      me: 10,
      ownerType: 'character',
      ownerId: 200,
      locationId: 60008494,
      locationFlag: 'Deliveries',
    });
  });

  it('does not let a later non-winning copy steal the recorded owner + location', () => {
    const map = toOwnedBlueprintMap([
      row(34, 10, 0, 30, { ownerType: 'character', ownerId: 1 }, { locationId: STATION, locationFlag: 'Hangar' }),
      row(34, 5, 0, -1, { ownerType: 'character', ownerId: 999 }, { locationId: 60008494, locationFlag: 'Deliveries' }),
    ]);
    expect(map.get(34)).toMatchObject({
      me: 10,
      owned: 2,
      ownerType: 'character',
      ownerId: 1,
      locationId: STATION,
      locationFlag: 'Hangar',
    });
  });

  it('is empty for no rows', () => {
    expect(toOwnedBlueprintMap([]).size).toBe(0);
  });
});
