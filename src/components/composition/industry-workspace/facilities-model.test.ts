import { expect, test } from 'vitest';
import type { StationSearchEntry } from '@/data/eve-data/stations-search';
import { addFacility } from '@/features/industry-planner/profiles/assignments';
import { emptyProfileDocument } from '@/features/industry-planner/profiles/profile-document';
import type { AvailableStructure } from '@/features/industry-planner/types';
import {
  facilityOptionGroups,
  facilityViews,
  rigBonuses,
  stationFacility,
  structureFacility,
  unavailableCategories,
} from './facilities-model';

const EQUIPMENT = 2;
const COMPOSITE = 18;

const structure = (overrides: Partial<AvailableStructure>): AvailableStructure => ({
  id: 's1',
  source: 'custom',
  name: 'Sotiyo',
  structureTypeId: 35827,
  groupId: 1404,
  hostsCapitals: true,
  systemId: null,
  modifiers: [
    // Hull: −1% material, −3% job cost, −15% time, on every manufacturing job.
    { activity: 'manufacturing', kind: 'material', filterId: null, factor: { high: 0.99, low: 0.99, null: 0.99 } },
    { activity: 'manufacturing', kind: 'cost', filterId: null, factor: { high: 0.97, low: 0.97, null: 0.97 } },
    { activity: 'manufacturing', kind: 'time', filterId: null, factor: { high: 0.85, low: 0.85, null: 0.85 } },
    // One equipment rig: −2% material and −20% time, scaled ×1 / ×1.9 / ×2.1 by security band.
    { activity: 'manufacturing', kind: 'material', filterId: EQUIPMENT, factor: { high: 0.98, low: 0.962, null: 0.958 } },
    { activity: 'manufacturing', kind: 'time', filterId: EQUIPMENT, factor: { high: 0.8, low: 0.62, null: 0.58 } },
  ],
  enteredBonuses: null,
  securityClass: null,
  taxPct: 1.5,
  ...overrides,
});

const TATARA = structure({
  id: 'corp:7',
  source: 'corp',
  name: 'Tatara',
  structureTypeId: 35836,
  groupId: 1406,
  hostsCapitals: false,
  modifiers: [
    { activity: 'reaction', kind: 'time', filterId: null, factor: { high: 0.75, low: 0.75, null: 0.75 } },
    { activity: 'reaction', kind: 'material', filterId: COMPOSITE, factor: { high: 1, low: 0.976, null: 0.9736 } },
  ],
});

const station = (id: number, name: string): StationSearchEntry => ({ id, name, systemId: 30000142, security: 0.95 });
const STATIONS = [
  station(60003760, 'Jita IV - Moon 4 - Caldari Navy Assembly Plant'),
  station(60000361, 'Jita IV - Moon 6 - Ytiri Storage'),
  station(60008494, 'Amarr VIII (Oris) - Emperor Family Academy'),
];

test('a rig reads only on the categories it reaches, scaled by the security it sits in', () => {
  const low = rigBonuses(structure({}), 0.3);
  expect([...low.keys()]).toEqual(['modules']);
  expect(low.get('modules')?.me).toBeCloseTo((1 - 0.99 * 0.962) * 100, 6);
  expect(low.get('modules')?.te).toBeCloseTo((1 - 0.85 * 0.62) * 100, 6);
  expect(rigBonuses(structure({}), 0.9).get('modules')?.me).toBeCloseTo((1 - 0.99 * 0.98) * 100, 6);

  // A refinery's reactor rig reaches its own reaction class; the hull's time bonus alone does not count.
  expect([...rigBonuses(TATARA, -0.4).keys()]).toEqual(['composite-reactions']);
  // Typed-in values apply the same everywhere, so no category stands out.
  const typed = structure({
    modifiers: [],
    enteredBonuses: { manufacturing: { me: 2, te: 20, cost: 3 }, reactions: { me: 0, te: 0 } },
  });
  expect(rigBonuses(typed, 0.9).size).toBe(0);
});

test('saved structures show on open, typing searches stations too, and facilities on the profile drop out', () => {
  const structures = [structure({}), TATARA];
  const open = facilityOptionGroups({ query: '', structures, stations: STATIONS, taken: new Set() });
  expect(open.map((g) => [g.label, g.options.map((o) => o.label)])).toEqual([
    ['Corporation structures', ['Tatara']],
    ['Your structures', ['Sotiyo']],
  ]);

  const typed = facilityOptionGroups({
    query: 'jita navy',
    structures,
    stations: STATIONS,
    taken: new Set(['structure:s1']),
  });
  expect(typed.map((g) => [g.label, g.options.map((o) => o.value)])).toEqual([
    ['NPC stations', ['station:60003760']],
  ]);

  const byName = facilityOptionGroups({ query: 'ta', structures, stations: STATIONS, taken: new Set() });
  expect(byName.map((g) => g.label)).toEqual(['Corporation structures', 'NPC stations']);
  // Names that start with the query lead.
  expect(facilityOptionGroups({ query: 'amarr', structures: [], stations: STATIONS, taken: new Set() })[0]?.options[0]?.label)
    .toBe('Amarr VIII (Oris) - Emperor Family Academy');
});

test('a new facility takes the top-level work nobody covers yet, and only a refinery takes reactions', () => {
  let doc = emptyProfileDocument();
  const sotiyo = structureFacility(doc, structure({}));
  expect(sotiyo).toEqual({ kind: 'structure', id: 's1', name: 'Sotiyo', systemId: null, categories: ['manufacturing'] });
  doc = addFacility(doc, sotiyo);

  const tatara = structureFacility(doc, TATARA);
  expect(tatara.categories).toEqual(['reactions']);
  doc = addFacility(doc, tatara);

  const jita = stationFacility(doc, STATIONS[0]!);
  expect(jita).toEqual({
    kind: 'station',
    id: '60003760',
    name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    systemId: 30000142,
    categories: [],
  });
  doc = addFacility(doc, jita);

  const views = facilityViews(doc, [structure({})]);
  expect(views.map((v) => [v.key, v.missing, v.hostsReactions, v.hostsCapitals])).toEqual([
    ['structure:s1', false, false, true],
    // The Tatara is no longer shared with this account.
    ['structure:corp:7', true, false, false],
    ['station:60003760', false, false, false],
  ]);
  // Before the account's structures load, nothing reads as gone.
  expect(facilityViews(doc, null).some((v) => v.missing)).toBe(false);
});

test('a facility greys out what it cannot build: reactions off a refinery, capitals without a shipyard', () => {
  const off = (hostsReactions: boolean, hostsCapitals: boolean) =>
    [...unavailableCategories({ hostsReactions, hostsCapitals })].sort();
  const REACTIONS = ['biochemical-reactions', 'composite-reactions', 'hybrid-reactions', 'reactions'];
  // An NPC station or a citadel without a shipyard.
  expect(off(false, false)).toEqual(['capital-ships', ...REACTIONS].sort());
  // A Sotiyo.
  expect(off(false, true)).toEqual(REACTIONS);
  // A Tatara.
  expect(off(true, false)).toEqual(['capital-ships']);
});
