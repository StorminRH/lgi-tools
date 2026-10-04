import { expect, test } from 'vitest';
import { isSerializationFailure, isUniqueViolation } from './pg-errors';

const pgError = (code: string) => Object.assign(new Error('postgres'), { code });

test('a Postgres error is recognised by its code, also when a driver wraps it', () => {
  expect(isSerializationFailure(pgError('40001'))).toBe(true);
  expect(isSerializationFailure(new Error('query failed', { cause: pgError('40001') }))).toBe(true);
  expect(isUniqueViolation(new Error('query failed', { cause: pgError('23505') }))).toBe(true);
  expect(isSerializationFailure(pgError('23505'))).toBe(false);
  expect(isUniqueViolation(pgError('40001'))).toBe(false);
  expect(isSerializationFailure('40001')).toBe(false);
});
