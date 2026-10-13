import { expect, test } from 'vitest';
import { asRecord, dogmaAttributePairs, localizedEn, mapRecords } from './coerce';

test('asRecord passes a plain object through and turns null, arrays and primitives into null', () => {
  const record = { en: 'Tritanium' };
  expect(asRecord(record)).toBe(record);
  for (const value of [null, undefined, [], [record], 'Tritanium', 34, true]) {
    expect(asRecord(value)).toBeNull();
  }
  expect(localizedEn(record)).toBe('Tritanium');
  expect(localizedEn({ en: 34 })).toBeNull();
  expect(localizedEn(null)).toBeNull();
});

test('mapRecords maps the record entries of a list and skips everything else', () => {
  const quantity = (entry: Record<string, unknown>) => (typeof entry.quantity === 'number' ? entry.quantity : null);
  expect(mapRecords([{ quantity: 1 }, null, 'x', 4, [{ quantity: 9 }], { quantity: 'two' }, { quantity: 3 }], quantity)).toEqual([1, 3]);
  expect(mapRecords(undefined, quantity)).toEqual([]);
  expect(mapRecords({ 0: { quantity: 1 } }, quantity)).toEqual([]);
});

test('dogmaAttributePairs keeps valid pairs in input order so the last duplicate wins when collected', () => {
  const pairs = dogmaAttributePairs([
    { attributeID: 9, value: 1.5 },
    null,
    { attributeID: 4.7, value: 2 },
    { attributeID: '5', value: 3 },
    { attributeID: 6, value: 'x' },
    { attributeID: 7 },
    { attributeID: 9, value: 0.25 },
  ]);
  expect(pairs).toEqual([
    [9, 1.5],
    [4, 2],
    [9, 0.25],
  ]);
  expect(new Map(pairs).get(9)).toBe(0.25);
  expect(dogmaAttributePairs('not a list')).toEqual([]);
});
