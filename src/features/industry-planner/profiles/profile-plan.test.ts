import { expect, test } from 'vitest';
import type { AvailableStructure, StructureModifier } from '../api-contract';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from '../structure-bonus';
import { emptyProfileDocument } from './profile-document';
import {
  type PlanFacility,
  type PlanMember,
  planFacilities,
  planMembers,
  planSummary,
  profilePlan,
} from './profile-plan';

// CCP's industry target filters.
const EQUIPMENT = 2;
const SHIPS = 3;
const SMALL_T1 = 5;
const COMPOSITE = 18;
const INVENTION = 8;

const flat = (activity: StructureModifier['activity'], kind: StructureModifier['kind'], factor: number): StructureModifier => ({
  activity,
  kind,
  filterId: null,
  factor: { high: factor, low: factor, null: factor },
});

const structure = (
  id: string,
  groupId: number,
  modifiers: StructureModifier[],
  hostsCapitals = false,
): AvailableStructure => ({
  id,
  source: 'custom',
  name: id,
  structureTypeId: 35825,
  groupId,
  hostsCapitals,
  systemId: 30002813,
  targetFilterSets: [[EQUIPMENT], [COMPOSITE]],
  modifiers,
  securityClass: null,
  taxPct: 1,
  enteredBonuses: null,
});

const RAITARU = structure('raitaru', 1404, [
  flat('manufacturing', 'material', 0.99),
  flat('manufacturing', 'time', 0.85),
  flat('manufacturing', 'cost', 0.97),
  // One equipment material rig: −2% scaled ×1 / ×1.9 / ×2.1 by security band.
  { activity: 'manufacturing', kind: 'material', filterId: EQUIPMENT, factor: { high: 0.98, low: 0.962, null: 0.958 } },
]);
const AZBEL = structure('azbel', 1404, [
  flat('manufacturing', 'material', 0.99),
  flat('manufacturing', 'time', 0.8),
  flat('manufacturing', 'cost', 0.96),
]);
const TATARA = structure('tatara', 1406, [flat('reaction', 'time', 0.75)]);

const facility = (
  key: string,
  categories: PlanFacility['categories'],
  s: AvailableStructure | null,
  security: number | null = 0.3,
): PlanFacility => ({
  key,
  id: key.split(':')[1] ?? key,
  name: s?.name ?? key,
  kind: s === null ? 'station' : 'structure',
  structure: s,
  systemId: 30002813,
  security,
  categories,
});

const FACILITIES = [
  facility('structure:raitaru', ['modules'], RAITARU),
  facility('station:60003760', ['manufacturing'], null, 0.95),
  facility('structure:azbel', ['manufacturing'], AZBEL),
  facility('structure:tatara', ['reactions'], TATARA, -0.4),
];

const BUILDER = 9001;
const REACTOR = 9002;
const ALT = 9003;
const GONE = 9004;
const MEMBERS: PlanMember[] = [
  { characterId: BUILDER, categories: ['ships'], levels: { 3380: 5, 3388: 5 } },
  { characterId: REACTOR, categories: ['reactions'], levels: { 45746: 4 } },
  { characterId: ALT, categories: [], levels: { 3380: 4 } },
  { characterId: GONE, categories: ['modules'], levels: null },
];

const SHIP_BP = 100;
const MODULE_BP = 200;
const REACTION_BP = 300;
const INVENTION_BP = 400;

const plan = () =>
  profilePlan({
    facilities: FACILITIES,
    members: MEMBERS,
    nodeActivityByBlueprint: {
      [SHIP_BP]: MANUFACTURING_ACTIVITY,
      [MODULE_BP]: MANUFACTURING_ACTIVITY,
      [REACTION_BP]: REACTION_ACTIVITY,
      [INVENTION_BP]: INVENTION,
    },
    nodeFilterIds: { [SHIP_BP]: [SHIPS, SMALL_T1], [MODULE_BP]: [EQUIPMENT], [REACTION_BP]: [COMPOSITE] },
    nodeTimeSkills: {},
    topBlueprintTypeId: SHIP_BP,
  });

test('each job takes the facility of its most specific category, and the best bonus among equals', () => {
  const p = plan();
  // The equipment class goes to the rigged Raitaru, at its low-sec band.
  expect(p.routeOf(MODULE_BP).facility?.key).toBe('structure:raitaru');
  expect(p.structureFactors.structureMeFactorOf(MODULE_BP)).toBeCloseTo(0.99 * 0.962, 9);
  // Nobody takes ships, so all manufacturing decides: the Azbel beats the bonus-less station.
  expect(p.routeOf(SHIP_BP).facility?.key).toBe('structure:azbel');
  expect(p.structureFactors.structureTeFactorOf(SHIP_BP)).toBeCloseTo(0.8, 9);
  // Reactions only ever run at a refinery.
  expect(p.routeOf(REACTION_BP).facility?.key).toBe('structure:tatara');
  expect(p.structureFactors.structureTeFactorOf(REACTION_BP)).toBeCloseTo(0.75, 9);
  // Activities a profile does not route get nothing.
  expect(p.routeOf(INVENTION_BP)).toEqual({ facility: null, characterId: null, bonus: null });
  expect(p.structureFactors.structureMeFactorOf(INVENTION_BP)).toBe(1);

  // The product's own job sets the job cost bonus; the readouts are the best any job gets.
  expect(p.top.facility?.key).toBe('structure:azbel');
  expect(p.structureFactors.structureCostBonusPct).toBeCloseTo(4, 9);
  expect(p.structureFactors.manufacturingBonus?.me).toBeCloseTo((1 - 0.99 * 0.962) * 100, 9);
  expect(p.structureFactors.reactionBonus?.te).toBeCloseTo(25, 9);
});

test('each job takes the covering member with the fastest skills, or anyone when no one covers it', () => {
  const p = plan();
  expect(p.routeOf(SHIP_BP).characterId).toBe(BUILDER);
  expect(p.skillTimeFactors.skillTimeFactorOf(SHIP_BP)).toBeCloseTo(0.8 * 0.85, 9);
  expect(p.routeOf(REACTION_BP).characterId).toBe(REACTOR);
  expect(p.skillTimeFactors.skillTimeFactorOf(REACTION_BP)).toBeCloseTo(0.84, 9);
  // Only an unlinked member covers equipment, so the job runs with that member and no skill bonus.
  expect(p.routeOf(MODULE_BP).characterId).toBe(GONE);
  expect(p.skillTimeFactors.skillTimeFactorOf(MODULE_BP)).toBe(1);

  const open = profilePlan({
    facilities: [],
    members: MEMBERS.filter((m) => m.characterId !== GONE),
    nodeActivityByBlueprint: { [MODULE_BP]: MANUFACTURING_ACTIVITY },
    nodeFilterIds: { [MODULE_BP]: [EQUIPMENT] },
    nodeTimeSkills: { [MODULE_BP]: [{ skillTypeId: 3388, timePctPerLevel: -1 }] },
    topBlueprintTypeId: MODULE_BP,
  });
  expect(open.routeOf(MODULE_BP).characterId).toBe(BUILDER);
  expect(open.skillTimeFactors.skillTimeFactorOf(MODULE_BP)).toBeCloseTo(0.8 * 0.85 * 0.95, 9);
  // With no facility at all, nothing is bonused and the readouts stay empty.
  expect(open.structureFactors).toMatchObject({ structureCostBonusPct: 0, manufacturingBonus: null, active: false });
});

test('a capital ship goes only to a facility with a capital shipyard, never to a station', () => {
  const CAPITAL = 11;
  const SOTIYO = structure('sotiyo', 1404, [flat('manufacturing', 'material', 0.99)], true);
  const route = (facilities: PlanFacility[]) =>
    profilePlan({
      facilities,
      members: [],
      nodeActivityByBlueprint: { [SHIP_BP]: MANUFACTURING_ACTIVITY },
      nodeFilterIds: { [SHIP_BP]: [SHIPS, CAPITAL] },
      nodeTimeSkills: {},
      topBlueprintTypeId: SHIP_BP,
    }).routeOf(SHIP_BP).facility?.key ?? null;

  const raitaru = facility('structure:raitaru', ['ships'], RAITARU);
  const station = facility('station:60003760', ['manufacturing'], null, 0.95);
  // The Raitaru covers all ships, but cannot build a capital, so the station would have to; it cannot either.
  expect(route([raitaru, station])).toBeNull();
  // With a Sotiyo on the profile, the dreadnought goes there, even from a less specific category.
  expect(route([raitaru, station, facility('structure:sotiyo', ['manufacturing'], SOTIYO)])).toBe('structure:sotiyo');
  // Sub-capital ships still go to the Raitaru.
  const frigate = profilePlan({
    facilities: [raitaru, facility('structure:sotiyo', ['manufacturing'], SOTIYO)],
    members: [],
    nodeActivityByBlueprint: { [SHIP_BP]: MANUFACTURING_ACTIVITY },
    nodeFilterIds: { [SHIP_BP]: [SHIPS, SMALL_T1] },
    nodeTimeSkills: {},
    topBlueprintTypeId: SHIP_BP,
  });
  expect(frigate.routeOf(SHIP_BP).facility?.key).toBe('structure:raitaru');
});

test('the summary counts each facility and member’s jobs, and the jobs no facility covers', () => {
  const p = plan();
  expect(planSummary(p, [SHIP_BP, MODULE_BP, REACTION_BP, INVENTION_BP, SHIP_BP])).toEqual({
    facilities: [
      { facility: FACILITIES[2], jobs: 1 },
      { facility: FACILITIES[0], jobs: 1 },
      { facility: FACILITIES[3], jobs: 1 },
    ],
    members: [
      { characterId: BUILDER, jobs: 1 },
      { characterId: GONE, jobs: 1 },
      { characterId: REACTOR, jobs: 1 },
    ],
    uncovered: 1,
  });
});

test('a profile reads its saved structures from the account and its stations as added', () => {
  const doc = {
    ...emptyProfileDocument([{ characterId: BUILDER, name: 'Builder' }]),
    facilities: [
      { kind: 'structure' as const, id: 'raitaru', name: 'Old name', systemId: 30000001, categories: ['modules' as const] },
      { kind: 'structure' as const, id: 'gone', name: 'Gone Fort', systemId: null, categories: [] },
      { kind: 'station' as const, id: '60003760', name: 'Jita IV - Moon 4', systemId: 30000142, categories: ['manufacturing' as const] },
    ],
  };
  const security = new Map([[30002813, 0.28], [30000142, 0.95]]);
  const facilities = planFacilities(doc, [RAITARU], (id) => security.get(id) ?? null);
  expect(facilities.map((f) => [f.key, f.name, f.structure?.id ?? null, f.systemId, f.security])).toEqual([
    ['structure:raitaru', 'raitaru', 'raitaru', 30002813, 0.28],
    ['structure:gone', 'Gone Fort', null, null, null],
    ['station:60003760', 'Jita IV - Moon 4', null, 30000142, 0.95],
  ]);
  expect(planMembers(doc, new Map([[BUILDER, { 3380: 5 }]]))).toEqual([
    { characterId: BUILDER, categories: [], levels: { 3380: 5 } },
  ]);
});
