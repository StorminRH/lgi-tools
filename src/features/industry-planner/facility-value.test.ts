import { describe, expect, it } from 'vitest';
import { facilityValueFor, parseFacilityValue, structureById } from './facility-value';

describe('parseFacilityValue', () => {
  it('decodes the add-custom sentinel', () => {
    expect(parseFacilityValue('add-custom')).toEqual({ kind: 'add-custom' });
  });

  it('decodes a structure value, keeping the id as a string', () => {
    expect(parseFacilityValue('structure:corp:42')).toEqual({ kind: 'structure', id: 'corp:42' });
  });

  it('decodes a station value, coercing the id to a number', () => {
    expect(parseFacilityValue('station:60003760')).toEqual({ kind: 'station', id: 60003760 });
  });

  it('treats the empty option and anything unrecognised as a clear', () => {
    expect(parseFacilityValue('')).toEqual({ kind: 'clear' });
    expect(parseFacilityValue('nonsense')).toEqual({ kind: 'clear' });
  });
});

describe('facilityValueFor', () => {
  it('encodes a picked structure (winning over a station)', () => {
    expect(facilityValueFor({ id: 'c1' }, { id: 60003760 })).toBe('structure:c1');
  });

  it('encodes a picked station when no structure is chosen', () => {
    expect(facilityValueFor(null, { id: 60003760 })).toBe('station:60003760');
  });

  it('is empty when nothing is chosen', () => {
    expect(facilityValueFor(null, null)).toBe('');
  });
});

describe('structureById', () => {
  const list = [{ id: 'a' }, { id: 'corp:2' }, { id: 'c' }];

  it('finds a structure by id', () => {
    expect(structureById(list, 'corp:2')).toEqual({ id: 'corp:2' });
  });

  it('returns null for a missing id (coalescing find undefined)', () => {
    expect(structureById(list, 'nope')).toBeNull();
  });
});
