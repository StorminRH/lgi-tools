import { describe, expect, it } from 'vitest';
import { classRangeIncludes, formatClassRange, gasClassRange, siteClassLabel } from './gas-classes';

describe('gas class range', () => {
  it('maps a gas name to a formatted range and membership check', () => {
    expect(gasClassRange('Barren Perimeter Reservoir')).toEqual({ min: 'C1', max: 'C6' });
    expect(gasClassRange('Minor Perimeter Reservoir')).toEqual({ min: 'C1', max: 'C6' });
    expect(gasClassRange('Bountiful Frontier Reservoir')).toEqual({ min: 'C3', max: 'C6' });
    expect(gasClassRange('Instrumental Core Reservoir')).toEqual({ min: 'C5', max: 'C6' });
    expect(gasClassRange('Vital Core Reservoir')).toEqual({ min: 'C5', max: 'C6' });
    expect(gasClassRange('Some Other Site')).toBeNull();

    const frontier = { min: 'C3', max: 'C6' } as const;
    expect(formatClassRange(frontier)).toBe('C3–C6');
    expect(formatClassRange({ min: 'C4', max: 'C4' })).toBe('C4');
    expect(classRangeIncludes(frontier, 'C3')).toBe(true);
    expect(classRangeIncludes(frontier, 'C6')).toBe(true);
    expect(classRangeIncludes(frontier, 'C1')).toBe(false);
  });

  it('labels a site by its wormhole class, else by its gas range', () => {
    expect(siteClassLabel({ name: 'Perimeter Ambush Point', siteType: 'combat', wormholeClass: 'C2' })).toBe('C2');
    expect(siteClassLabel({ name: 'Bountiful Frontier Reservoir', siteType: 'gas', wormholeClass: null })).toBe('C3–C6');
    expect(siteClassLabel({ name: 'Core Garrison', siteType: 'combat', wormholeClass: null })).toBeNull();
  });
});
