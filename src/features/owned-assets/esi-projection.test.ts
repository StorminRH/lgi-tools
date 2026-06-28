import { describe, expect, it } from 'vitest';
import { parseAssetsBody } from './esi-projection';

// A realistic ESI asset element — including the fields the projection drops
// (item_id, is_singleton, is_blueprint_copy).
const trit = {
  item_id: 1039392583913,
  type_id: 34,
  quantity: 1000,
  location_id: 60003760,
  location_type: 'station',
  location_flag: 'Hangar',
  is_singleton: false,
  is_blueprint_copy: false,
};

const projectedTrit = {
  type_id: 34,
  quantity: 1000,
  location_id: 60003760,
  location_flag: 'Hangar',
  location_type: 'station',
};

describe('parseAssetsBody', () => {
  it('projects a realistic body down to the stored fields, dropping item_id/is_singleton', () => {
    const out = parseAssetsBody([trit]);
    expect(out).toEqual([projectedTrit]);
    expect(out?.[0]).not.toHaveProperty('item_id');
    expect(out?.[0]).not.toHaveProperty('is_singleton');
    expect(out?.[0]).not.toHaveProperty('is_blueprint_copy');
  });

  it('sums quantity across stacks of the same type at the same location/flag/type', () => {
    // Three separate ESI stacks (distinct item_ids) of the same type in the same
    // hangar collapse to one aggregated row carrying the summed quantity.
    const out = parseAssetsBody([
      { ...trit, item_id: 1, quantity: 1000 },
      { ...trit, item_id: 2, quantity: 500 },
      { ...trit, item_id: 3, quantity: 7 },
    ]);
    expect(out).toEqual([{ ...projectedTrit, quantity: 1507 }]);
  });

  it('keeps distinct locations / flags / location_types as separate holdings', () => {
    const out = parseAssetsBody([
      { ...trit, item_id: 1, quantity: 100, location_id: 60003760, location_flag: 'Hangar' },
      { ...trit, item_id: 2, quantity: 200, location_id: 60003760, location_flag: 'CorpSAG1' },
      { ...trit, item_id: 3, quantity: 300, location_id: 61000001, location_flag: 'Hangar' },
      { ...trit, item_id: 4, quantity: 400, location_id: 61000001, location_flag: 'Hangar', location_type: 'item' },
    ]);
    // Four distinct (location_id, location_flag, location_type) tuples → four rows,
    // nothing merged (assert sort-independently: count + total preserved).
    expect(out).toHaveLength(4);
    expect(out?.reduce((sum, r) => sum + r.quantity, 0)).toBe(1000);
  });

  it('sorts canonically (by type_id, then location_id, flag, type) for a stable array', () => {
    const out = parseAssetsBody([
      { ...trit, item_id: 1, type_id: 35 },
      { ...trit, item_id: 2, type_id: 34 },
    ]);
    expect(out?.map((r) => r.type_id)).toEqual([34, 35]);
  });

  it('produces an identical array regardless of input order (deep-equal cold-skip relies on this)', () => {
    const a = { ...trit, item_id: 1, type_id: 34, quantity: 5 };
    const b = { ...trit, item_id: 2, type_id: 35, quantity: 9 };
    expect(parseAssetsBody([a, b])).toEqual(parseAssetsBody([b, a]));
  });

  it('aggregates order-independently (the summed row is the same either way)', () => {
    const x = { ...trit, item_id: 1, quantity: 10 };
    const y = { ...trit, item_id: 2, quantity: 90 };
    expect(parseAssetsBody([x, y])).toEqual(parseAssetsBody([y, x]));
    expect(parseAssetsBody([x, y])?.[0]?.quantity).toBe(100);
  });

  it('rejects a non-array body and a row missing a required field', () => {
    expect(parseAssetsBody({ assets: [] })).toBeNull();
    const { type_id: _dropped, ...withoutType } = trit;
    expect(parseAssetsBody([withoutType])).toBeNull();
  });

  it('parses an empty hangar', () => {
    expect(parseAssetsBody([])).toEqual([]);
  });
});
