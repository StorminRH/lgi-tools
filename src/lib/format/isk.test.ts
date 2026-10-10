import { expect, test } from 'vitest';
import { formatIsk, formatIskCompact, formatIskShort } from './isk';

test('ISK presets keep their own precision per tier and an em-dash for null or non-finite', () => {
  expect(formatIsk(2_345_000_000)).toBe('2.35B');
  expect(formatIsk(2_345_000)).toBe('2.35M');
  expect(formatIsk(2_345)).toBe('2.3K');
  expect(formatIsk(42)).toBe('42.00');
  expect(formatIsk(-2_345_000)).toBe('-2.35M');
  expect(formatIsk(null)).toBe('—');
  expect(formatIsk(Number.NaN)).toBe('—');

  expect(formatIskShort(2_345_000_000)).toBe('2.3B');
  expect(formatIskShort(2_345_000)).toBe('2.3M');
  expect(formatIskShort(950_000)).toBe('950K');
  expect(formatIskShort(2_345)).toBe('2K');
  expect(formatIskShort(0)).toBe('0K');
  expect(formatIskShort(null)).toBe('—');
  expect(formatIskShort(Number.NaN)).toBe('—');
  expect(formatIskShort(Number.POSITIVE_INFINITY)).toBe('—');

  expect(formatIskCompact(2_345_000_000)).toBe('2.3B');
  expect(formatIskCompact(2_345_000)).toBe('2M');
  expect(formatIskCompact(900_000)).toBe('900K');
  expect(formatIskCompact(100_000)).toBe('100K');
  expect(formatIskCompact(Number.NaN)).toBe('—');
});

test('Short and Compact tier negatives on their magnitude', () => {
  expect(formatIskShort(-2_000_000)).toBe('-2.0M');
  expect(formatIskShort(-1_250_000_000)).toBe('-1.3B');
  expect(formatIskShort(-950_000)).toBe('-950K');
  expect(formatIskCompact(-45_000_000)).toBe('-45M');
  expect(formatIskCompact(-100_000)).toBe('-100K');
});

test('the unit option appends ISK to a figure but never to the em-dash', () => {
  expect(formatIskShort(125_400_000, { unit: true })).toBe('125.4M ISK');
  expect(formatIskShort(1_245_000_000, { unit: true })).toBe('1.2B ISK');
  expect(formatIskShort(950_000, { unit: true })).toBe('950K ISK');
  expect(formatIskShort(null, { unit: true })).toBe('—');
  expect(formatIskShort(Number.NaN, { unit: true })).toBe('—');

  expect(formatIskCompact(45_000_000, { unit: true })).toBe('45M ISK');
  expect(formatIskCompact(100_000, { unit: true })).toBe('100K ISK');
  expect(formatIskCompact(null, { unit: true })).toBe('—');
});
