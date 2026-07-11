import { describe, expect, it } from 'vitest';
// The module is TypeScript; vitest transpiles it on import from this .mjs test.
import {
  compareCanonical,
  groupFlatByBlueprint,
  sortTree,
  stableStringify,
} from './resolver-fixtures.ts';

describe('stableStringify', () => {
  it('serialises primitives like JSON.stringify', () => {
    expect(stableStringify(1)).toBe('1');
    expect(stableStringify('x')).toBe('"x"');
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify(true)).toBe('true');
  });

  it('sorts object keys recursively', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(stableStringify({ b: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"b":{"c":2,"d":1}}');
  });

  it('preserves array order (arrays are pre-sorted by callers)', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
    expect(stableStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it('is key-order independent for equal objects', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });
});

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
  it('is equal when only object key order differs', () => {
    const out = compareCanonical({ a: 1, b: 2 }, { b: 2, a: 1 });
    expect(out.equal).toBe(true);
    expect(out.expected).toBe(out.actual);
  });

  it('detects a difference when array order differs', () => {
    const out = compareCanonical([1, 2], [2, 1]);
    expect(out.equal).toBe(false);
    expect(out.expected).toBe('[1,2]');
    expect(out.actual).toBe('[2,1]');
  });

  it('detects unequal values', () => {
    const out = compareCanonical({ a: 1 }, { a: 2 });
    expect(out.equal).toBe(false);
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
