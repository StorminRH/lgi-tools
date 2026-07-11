import { describe, expect, it } from 'vitest';
import {
  buildSystemRefOf,
  deriveBuildLocationView,
  resolveStationLabel,
  seededBuildLocation,
  stationLabel,
} from './build-location-view';
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
  it('compacts the resolved in-game name, else falls back to the operation label', () => {
    expect(stationLabel(station({ name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' }))).toContain('—');
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
    const loc = { ...seededBuildLocation(SYSTEMS[0]), stations: [station({ id: 60003760 })] };
    const view = deriveBuildLocationView(portable, [corpJita, portable], SYSTEMS, loc);
    // No lock → the picked location's system scopes the list (corpJita is in Jita).
    expect(view.lockedStructure).toBeNull();
    expect(view.stations).toHaveLength(1);
    expect(view.visibleStructures).toEqual([corpJita, portable]);
  });
});
