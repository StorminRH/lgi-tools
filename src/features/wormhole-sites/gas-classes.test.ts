import { describe, expect, it } from 'vitest';
import { classRangeIncludes, formatClassRange, gasClassRange } from './gas-classes';

describe('gasClassRange', () => {
  it('maps Perimeter gas sites to C1–C6', () => {
    expect(gasClassRange('Barren Perimeter Reservoir')).toEqual({ min: 'C1', max: 'C6' });
    expect(gasClassRange('Minor Perimeter Reservoir')).toEqual({ min: 'C1', max: 'C6' });
    expect(gasClassRange('Token Perimeter Reservoir')).toEqual({ min: 'C1', max: 'C6' });
  });

  it('maps Frontier gas sites to C3–C6', () => {
    expect(gasClassRange('Bountiful Frontier Reservoir')).toEqual({ min: 'C3', max: 'C6' });
    expect(gasClassRange('Vast Frontier Reservoir')).toEqual({ min: 'C3', max: 'C6' });
  });

  it('maps Core gas sites to C5–C6', () => {
    expect(gasClassRange('Instrumental Core Reservoir')).toEqual({ min: 'C5', max: 'C6' });
    expect(gasClassRange('Vital Core Reservoir')).toEqual({ min: 'C5', max: 'C6' });
  });

  it('returns null for non-matching names', () => {
    expect(gasClassRange('Some Other Site')).toBeNull();
  });
});

describe('formatClassRange', () => {
  it('renders an en-dash range', () => {
    expect(formatClassRange({ min: 'C3', max: 'C6' })).toBe('C3–C6');
  });
  it('collapses single-class ranges to just the class', () => {
    expect(formatClassRange({ min: 'C4', max: 'C4' })).toBe('C4');
  });
});

describe('classRangeIncludes', () => {
  it('returns true for classes inside the range (inclusive)', () => {
    const r = { min: 'C3', max: 'C6' } as const;
    expect(classRangeIncludes(r, 'C3')).toBe(true);
    expect(classRangeIncludes(r, 'C5')).toBe(true);
    expect(classRangeIncludes(r, 'C6')).toBe(true);
  });
  it('returns false for classes outside the range', () => {
    const r = { min: 'C3', max: 'C6' } as const;
    expect(classRangeIncludes(r, 'C1')).toBe(false);
    expect(classRangeIncludes(r, 'C2')).toBe(false);
  });
});
