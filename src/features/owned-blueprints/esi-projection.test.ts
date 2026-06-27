import { describe, expect, it } from 'vitest';
import { parseBlueprintsBody } from './esi-projection';

// A blueprint ORIGINAL (BPO) as the live endpoint shapes it — including item_id,
// the field the projection deliberately drops.
const bpo = {
  item_id: 1039392583913,
  type_id: 1000,
  location_id: 60003760,
  location_flag: 'Hangar',
  quantity: -1,
  material_efficiency: 10,
  time_efficiency: 20,
  runs: -1,
};

// A blueprint COPY (BPC): quantity -2, a finite remaining run count.
const bpc = {
  item_id: 1039392583914,
  type_id: 587,
  location_id: 60003760,
  location_flag: 'Hangar',
  quantity: -2,
  material_efficiency: 0,
  time_efficiency: 0,
  runs: 50,
};

const projectedBpo = {
  type_id: 1000,
  material_efficiency: 10,
  time_efficiency: 20,
  runs: -1,
  quantity: -1,
  location_id: 60003760,
  location_flag: 'Hangar',
};

describe('parseBlueprintsBody', () => {
  it('projects a realistic body down to the stored fields, dropping item_id', () => {
    const out = parseBlueprintsBody([bpo]);
    expect(out).toEqual([projectedBpo]);
    expect(out?.[0]).not.toHaveProperty('item_id');
  });

  it('keeps the BPO (-1) vs BPC (runs/-2) distinction verbatim', () => {
    const out = parseBlueprintsBody([bpc]);
    expect(out?.[0]?.quantity).toBe(-2);
    expect(out?.[0]?.runs).toBe(50);
  });

  it('accepts a positive quantity (a fresh-from-market stack of originals)', () => {
    const out = parseBlueprintsBody([{ ...bpo, quantity: 5 }]);
    expect(out?.[0]?.quantity).toBe(5);
  });

  it('sorts canonically (by type_id then the rest) for a stable, reorder-proof array', () => {
    // Fed high type_id first; the lower type_id must come out first.
    const out = parseBlueprintsBody([bpo, bpc]);
    expect(out?.map((b) => b.type_id)).toEqual([587, 1000]);
  });

  it('produces an identical array regardless of input order (deep-equal cold-skip relies on this)', () => {
    expect(parseBlueprintsBody([bpo, bpc])).toEqual(parseBlueprintsBody([bpc, bpo]));
  });

  it('rejects a non-array body and a row missing a required field', () => {
    expect(parseBlueprintsBody({ blueprints: [] })).toBeNull();
    const { type_id: _dropped, ...withoutType } = bpo;
    expect(parseBlueprintsBody([withoutType])).toBeNull();
  });

  it('parses an empty hangar', () => {
    expect(parseBlueprintsBody([])).toEqual([]);
  });
});
