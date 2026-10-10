import { expect, test } from 'vitest';
import {
  int4IdSchema,
  isPositiveSafeInteger,
  ownedRowIdSchema,
  pathIdParamSchema,
  positiveIdSchema,
} from './id-schemas';

const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

test('positive ids reject zero, negatives, fractions and unsafe integers but keep bigint-column ids', () => {
  for (const bad of [0, -1, 1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, '7']) {
    expect(accepts(positiveIdSchema, bad), String(bad)).toBe(false);
    expect(accepts(int4IdSchema, bad), String(bad)).toBe(false);
  }
  expect(positiveIdSchema.parse(1)).toBe(1);
  expect(positiveIdSchema.parse(2 ** 31)).toBe(2 ** 31);
  expect(positiveIdSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
});

test('int4 ids stop at the Postgres integer bound', () => {
  expect(int4IdSchema.parse(2 ** 31 - 1)).toBe(2 ** 31 - 1);
  const oversized = int4IdSchema.safeParse(2 ** 31);
  expect(oversized.success).toBe(false);
  expect(oversized.error?.issues[0]?.code).toBe('too_big');
});

test('path ids parse only canonical int4 digit strings', () => {
  expect(pathIdParamSchema.parse('7')).toBe(7);
  expect(pathIdParamSchema.parse('2147483647')).toBe(2_147_483_647);
  for (const bad of ['0', '0123', '1e3', '0x10', ' 7', '7 ', '-3', '1.5', '', 'abc', '12abc']) {
    expect(accepts(pathIdParamSchema, bad), JSON.stringify(bad)).toBe(false);
  }
  const oversized = pathIdParamSchema.safeParse('2147483648');
  expect(oversized.success).toBe(false);
  expect(oversized.error?.issues[0]?.code).toBe('too_big');
});

test('owned-row ids keep legacy non-UUID text ids addressable within the length bound', () => {
  for (const id of ['38534fe4-6d47-4007-8d99-0890bc6c9770', 'legacy-plan-1', 'x'.repeat(100)]) {
    expect(ownedRowIdSchema.parse(id)).toBe(id);
  }
  for (const bad of ['', 'x'.repeat(101), 7, null]) {
    expect(accepts(ownedRowIdSchema, bad), JSON.stringify(bad)).toBe(false);
  }
});

test('isPositiveSafeInteger accepts only positive safe integers, whether or not they are ids', () => {
  for (const value of [1, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
    expect(isPositiveSafeInteger(value), String(value)).toBe(true);
  }
  for (const value of [0, -1, 1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(isPositiveSafeInteger(value), String(value)).toBe(false);
  }
});
