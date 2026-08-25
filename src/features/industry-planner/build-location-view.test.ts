import { describe, expect, it } from 'vitest';
import {
  buildSystemRefOf,
  deriveBuildLocationView,
  resolveStationLabel,
  savedBuildLocationRestoreOf,
  seededBuildLocation,
  stationLabel,
} from './build-location-view';
import { facilityValueFor, parseFacilityValue, structureById } from './facility-value';
import type { LockSystem } from './structure-slots';
import type { AvailableStructure, IndustryStationView } from './types';

const structure = (over: Partial<AvailableStructure>): AvailableStructure => ({
  id: 'x',
  source: 'custom',
  name: 'X',
  structureTypeId: 35825,
  groupId: 1404,
  systemId: null,
  structureAttrs: {},
  rigAttrs: [],
  securityClass: null,
  taxPct: null,
  ...over,
});

const station = (over: Partial<IndustryStationView>): IndustryStationView => ({
  id: 60003760,
  name: null,
  operationName: 'Caldari Navy Assembly Plant',
  manufacturingCapable: true,
  researchCapable: true,
  ...over,
});

const SYSTEMS: LockSystem[] = [
  { id: 30000142, name: 'Jita', security: 0.9 },
  { id: 30003074, name: 'Basgerin', security: 0.4 },
];

describe('stationLabel', () => {
  it('compacts the in-game name (planet/moon, planet-direct, unusual shapes) and falls back to the operation', () => {
    expect(stationLabel(station({ name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }))).toBe(
      'Jita IV-4 — Caldari Navy Assembly Plant',
    );
    expect(stationLabel(station({ name: 'Perimeter II - Moon 1 - Caldari Navy Assembly Plant' }))).toBe(
      'Perimeter II-1 — Caldari Navy Assembly Plant',
    );
    expect(stationLabel(station({ name: 'Amarr VIII (Oris) - Emperor Family Academy' }))).toBe(
      'Amarr VIII (Oris) — Emperor Family Academy',
    );
    expect(
      stationLabel(station({ name: 'Sobaseki X - Asteroid Belt 1 - Caldari Provisions Warehouse' })),
    ).toBe('Sobaseki X — Asteroid Belt 1 - Caldari Provisions Warehouse');
    expect(stationLabel(station({ name: 'Some Station' }))).toBe('Some Station');
    expect(stationLabel(station({ name: null }))).toBe('Caldari Navy Assembly Plant');
  });
});

describe('resolveStationLabel', () => {
  it('labels a station present in the list, else null (a stale id)', () => {
    const stations = [station({ id: 60003760, name: null })];
    expect(resolveStationLabel(stations, 60003760)).toBe('Caldari Navy Assembly Plant');
    expect(resolveStationLabel(stations, 99999)).toBeNull();
  });
});

describe('buildSystemRefOf', () => {
  it('renames the index entry into the provider apply arg', () => {
    expect(buildSystemRefOf({ id: 30000142, name: 'Jita', security: 0.9 })).toEqual({
      systemId: 30000142,
      systemName: 'Jita',
      security: 0.9,
    });
  });
});

describe('seededBuildLocation', () => {
  it('seeds the system with empty stations / null indices / empty prices', () => {
    const loc = seededBuildLocation({ id: 30000142, name: 'Jita', security: 0.9 });
    expect(loc.systemId).toBe(30000142);
    expect(loc.stations).toEqual([]);
    expect(loc.costIndices).toEqual({ manufacturing: null, reaction: null });
    expect(loc.adjustedPrices.size).toBe(0);
  });
});

describe('savedBuildLocationRestoreOf', () => {
  const saved = buildSystemRefOf(SYSTEMS[0]!);

  it('returns the saved system only after preferences settle with no winner', () => {
    expect(
      savedBuildLocationRestoreOf({
        preferencesReady: true,
        alreadyRestored: false,
        location: null,
        savedBuildLocation: saved,
      }),
    ).toBe(saved);
  });

  it.each([
    { preferencesReady: false, alreadyRestored: false, location: null },
    { preferencesReady: true, alreadyRestored: true, location: null },
    {
      preferencesReady: true,
      alreadyRestored: false,
      location: seededBuildLocation(SYSTEMS[1]!),
    },
  ])('does not restore when another precedence condition blocks it', (state) => {
    expect(savedBuildLocationRestoreOf({ ...state, savedBuildLocation: saved })).toBeNull();
  });
});

describe('deriveBuildLocationView', () => {
  const corpJita = structure({ id: 'corp:1', source: 'corp', name: 'Jita Raitaru', systemId: 30000142 });
  const portable = structure({ id: 'c1', name: 'Portable Azbel' });

  it('deduces a locked structure and segments the list to its system', () => {
    const view = deriveBuildLocationView(corpJita, [corpJita, portable], SYSTEMS, null);
    expect(view.lockedStructure).toBe(corpJita);
    expect(view.deducedSystem).toEqual({ id: 30000142, name: 'Jita', security: 0.9 });
    // Locked to Jita → the Basgerin-less portable still shows (portables show everywhere).
    expect(view.visibleStructures).toEqual([corpJita, portable]);
    expect(view.stations).toEqual([]);
  });

  it('is null visibleStructures while the roster is still loading', () => {
    const view = deriveBuildLocationView(null, null, SYSTEMS, null);
    expect(view.lockedStructure).toBeNull();
    expect(view.deducedSystem).toBeNull();
    expect(view.visibleStructures).toBeNull();
  });

  it('carries the current location stations and falls back to its system for segmentation', () => {
    const loc = { ...seededBuildLocation(SYSTEMS[0]!), stations: [station({ id: 60003760 })] };
    const view = deriveBuildLocationView(portable, [corpJita, portable], SYSTEMS, loc);
    // No lock → the picked location's system scopes the list (corpJita is in Jita).
    expect(view.lockedStructure).toBeNull();
    expect(view.stations).toHaveLength(1);
    expect(view.visibleStructures).toEqual([corpJita, portable]);
  });
});

describe('facilityValue', () => {
  it('round-trips the select encoding and finds a structure by id', () => {
    expect(parseFacilityValue('add-custom')).toEqual({ kind: 'add-custom' });
    expect(parseFacilityValue('structure:corp:42')).toEqual({ kind: 'structure', id: 'corp:42' });
    expect(parseFacilityValue('station:60003760')).toEqual({ kind: 'station', id: 60003760 });
    expect(parseFacilityValue('')).toEqual({ kind: 'clear' });
    expect(parseFacilityValue('nonsense')).toEqual({ kind: 'clear' });

    expect(facilityValueFor({ id: 'c1' }, { id: 60003760 })).toBe('structure:c1');
    expect(facilityValueFor(null, { id: 60003760 })).toBe('station:60003760');
    expect(facilityValueFor(null, null)).toBe('');

    const list = [{ id: 'a' }, { id: 'corp:2' }, { id: 'c' }];
    expect(structureById(list, 'corp:2')).toEqual({ id: 'corp:2' });
    expect(structureById(list, 'nope')).toBeNull();
  });
});
