import { describe, expect, it } from 'vitest';
import {
  isRecentBlueprint,
  mergeRecent,
  parseRecentBlueprints,
  type RecentBlueprint,
} from './recent-blueprints';

const bp = (typeId: number, name = `BP ${typeId}`): RecentBlueprint => ({
  typeId,
  productTypeId: typeId + 1000,
  name,
});

describe('mergeRecent', () => {
  it('prepends a new entry, newest first', () => {
    expect(mergeRecent([bp(1)], bp(2))).toEqual([bp(2), bp(1)]);
  });

  it('floats a re-viewed blueprint back to the top, deduped by typeId', () => {
    const merged = mergeRecent([bp(1), bp(2), bp(3)], bp(3, 'Renamed'));
    expect(merged).toEqual([bp(3, 'Renamed'), bp(1), bp(2)]);
  });

  it('caps the list at the max, dropping the oldest', () => {
    const four = [bp(1), bp(2), bp(3), bp(4)];
    expect(mergeRecent(four, bp(5), 4)).toEqual([bp(5), bp(1), bp(2), bp(3)]);
  });
});

describe('isRecentBlueprint', () => {
  it('accepts a well-formed entry', () => {
    expect(isRecentBlueprint({ typeId: 1, productTypeId: 2, name: 'x' })).toBe(true);
  });

  it('rejects non-objects and null', () => {
    expect(isRecentBlueprint(null)).toBe(false);
    expect(isRecentBlueprint(42)).toBe(false);
    expect(isRecentBlueprint('x')).toBe(false);
  });

  it('rejects entries missing or mistyping any field', () => {
    expect(isRecentBlueprint({ typeId: 1, productTypeId: 2 })).toBe(false);
    expect(isRecentBlueprint({ typeId: '1', productTypeId: 2, name: 'x' })).toBe(false);
    expect(isRecentBlueprint({ typeId: 1, productTypeId: 2, name: 3 })).toBe(false);
  });
});

describe('parseRecentBlueprints', () => {
  it('returns [] for null, empty, or non-array JSON', () => {
    expect(parseRecentBlueprints(null)).toEqual([]);
    expect(parseRecentBlueprints('')).toEqual([]);
    expect(parseRecentBlueprints('{"a":1}')).toEqual([]);
  });

  it('returns [] on malformed JSON without throwing', () => {
    expect(parseRecentBlueprints('not json')).toEqual([]);
  });

  it('keeps valid entries and drops foreign ones', () => {
    const raw = JSON.stringify([
      { typeId: 1, productTypeId: 1001, name: 'A' },
      { typeId: 'bad' },
      { typeId: 2, productTypeId: 1002, name: 'B' },
    ]);
    expect(parseRecentBlueprints(raw)).toEqual([
      { typeId: 1, productTypeId: 1001, name: 'A' },
      { typeId: 2, productTypeId: 1002, name: 'B' },
    ]);
  });

  it('caps the parsed list at the max (8)', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      typeId: i,
      productTypeId: i + 1000,
      name: `BP ${i}`,
    }));
    expect(parseRecentBlueprints(JSON.stringify(many))).toHaveLength(8);
  });
});
