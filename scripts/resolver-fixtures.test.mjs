import { describe, expect, it } from 'vitest';

import {
  compareCanonical,
  groupFlatByBlueprint,
  sortTree,
} from './resolver-fixtures.ts';

describe('sortTree', () => {
  it('sorts sibling nodes by typeId', () => {
    const sorted = sortTree([
      { typeId: 3, inputs: [] },
      { typeId: 1, inputs: [] },
      { typeId: 2, inputs: [] },
    ]);
    expect(sorted.map((n) => n.typeId)).toEqual([1, 2, 3]);
  });

  it('sorts nested inputs recursively', () => {
    const sorted = sortTree([
      {
        typeId: 5,
        inputs: [
          { typeId: 9, inputs: [] },
          { typeId: 4, inputs: [] },
        ],
      },
    ]);
    expect(sorted[0].inputs.map((n) => n.typeId)).toEqual([4, 9]);
  });

  it('does not mutate the input array', () => {
    const input = [
      { typeId: 2, inputs: [] },
      { typeId: 1, inputs: [] },
    ];
    sortTree(input);
    expect(input.map((n) => n.typeId)).toEqual([2, 1]);
  });

  it('preserves non-ordering node fields', () => {
    const sorted = sortTree([{ typeId: 7, quantity: 42, inputs: [] }]);
    expect(sorted[0].quantity).toBe(42);
  });
});

describe('compareCanonical', () => {
  it('serialises, sorts keys, and compares equality', () => {
    expect(compareCanonical(1, 1)).toEqual({ equal: true, expected: '1', actual: '1' });
    expect(compareCanonical('x', 'x').expected).toBe('"x"');
    expect(compareCanonical(null, null).expected).toBe('null');
    expect(compareCanonical({ b: 1, a: 2 }, { a: 2, b: 1 }).expected).toBe('{"a":2,"b":1}');
    expect(compareCanonical([3, 1, 2], [3, 1, 2]).expected).toBe('[3,1,2]');
    const sameKeys = compareCanonical({ a: 1, b: 2 }, { b: 2, a: 1 });
    expect(sameKeys.equal).toBe(true);
    expect(sameKeys.expected).toBe(sameKeys.actual);
    const reordered = compareCanonical([1, 2], [2, 1]);
    expect(reordered.equal).toBe(false);
    expect(reordered.expected).toBe('[1,2]');
    expect(reordered.actual).toBe('[2,1]');
    expect(compareCanonical({ a: 1 }, { a: 2 }).equal).toBe(false);
  });
});

describe('groupFlatByBlueprint', () => {
  const reference = { Rifter: 691, Drake: 24699 };

  it('groups rows into per-name maps of raw type → quantity', () => {
    const out = groupFlatByBlueprint(
      [
        { blueprintTypeId: 691, rawMaterialTypeId: 34, totalQuantity: 100 },
        { blueprintTypeId: 691, rawMaterialTypeId: 35, totalQuantity: 50 },
        { blueprintTypeId: 24699, rawMaterialTypeId: 34, totalQuantity: 7 },
      ],
      reference,
    );
    expect(out).toEqual({
      Rifter: { 34: 100, 35: 50 },
      Drake: { 34: 7 },
    });
  });

  it('coerces string quantities to numbers', () => {
    const out = groupFlatByBlueprint(
      [{ blueprintTypeId: 691, rawMaterialTypeId: 34, totalQuantity: '250' }],
      { Rifter: 691 },
    );
    expect(out.Rifter[34]).toBe(250);
  });

  it('includes every reference blueprint, empty when it has no rows', () => {
    const out = groupFlatByBlueprint([], reference);
    expect(out).toEqual({ Rifter: {}, Drake: {} });
  });
});
