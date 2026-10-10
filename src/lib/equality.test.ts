import { expect, test } from 'vitest';
import { sameFields } from './equality';

interface Frame {
  readonly key: string;
  readonly x: number;
  readonly heavy?: boolean;
}

test('sameFields matches records with equal values on the same keys, in any key order', () => {
  const frame: Frame = { key: 'd:1', x: 10 };
  expect(sameFields(frame, { x: 10, key: 'd:1' })).toBe(true);
  expect(sameFields(frame, { key: 'd:1', x: 11 })).toBe(false);
  expect(sameFields(frame, { key: 'd:2', x: 10 })).toBe(false);
  expect(sameFields({}, {})).toBe(true);
});

test('sameFields sees an extra key and tells an undefined value from a missing key', () => {
  expect(sameFields<Frame>({ key: 'd:1', x: 10 }, { key: 'd:1', x: 10, heavy: false })).toBe(false);
  expect(sameFields<Frame>({ key: 'd:1', x: 10, heavy: false }, { key: 'd:1', x: 10 })).toBe(false);
  expect(sameFields<Frame>({ key: 'd:1', x: 10, heavy: undefined }, { key: 'd:1', x: 10 })).toBe(false);
  expect(
    sameFields<Record<string, unknown>>({ key: 'd:1', heavy: undefined }, { key: 'd:1', lift: undefined }),
  ).toBe(false);
  expect(sameFields<Frame>({ key: 'd:1', x: 10, heavy: undefined }, { key: 'd:1', x: 10, heavy: undefined })).toBe(true);
});

test('sameFields compares values with ===, so -0 matches 0, NaN never matches and nested records compare by reference', () => {
  expect(sameFields({ tx: -0, ty: 0 }, { tx: 0, ty: -0 })).toBe(true);
  expect(sameFields({ zoom: NaN }, { zoom: NaN })).toBe(false);

  const position = { x: 1, y: 2 };
  expect(sameFields({ position }, { position })).toBe(true);
  expect(sameFields({ position }, { position: { x: 1, y: 2 } })).toBe(false);
});
