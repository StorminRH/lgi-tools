import { describe, expect, it } from 'vitest';
import { sameBlueprints } from './ownedBlueprints';

function bp(overrides: Record<string, unknown> = {}) {
  return {
    type_id: 1000,
    material_efficiency: 10,
    time_efficiency: 20,
    runs: -1,
    quantity: -1,
    location_id: 60003760,
    location_flag: 'Hangar',
    ...overrides,
  };
}

describe('sameBlueprints', () => {
  it('is true for two empty sets', () => {
    expect(sameBlueprints([], [])).toBe(true);
  });

  it('is true for identical sets in the same (canonical) order', () => {
    expect(sameBlueprints([bp(), bp({ type_id: 2000 })], [bp(), bp({ type_id: 2000 })])).toBe(true);
  });

  it('is false when the lengths differ', () => {
    expect(sameBlueprints([bp()], [bp(), bp({ type_id: 2000 })])).toBe(false);
  });

  it('is false when any single field differs', () => {
    expect(sameBlueprints([bp()], [bp({ material_efficiency: 9 })])).toBe(false);
    expect(sameBlueprints([bp()], [bp({ runs: 10 })])).toBe(false);
    expect(sameBlueprints([bp()], [bp({ location_flag: 'CorpSAG1' })])).toBe(false);
  });
});
