import { expect, test } from 'vitest';
import { djb2 } from './prng';

test('djb2 hashes keys to stable unsigned 32-bit integers', () => {
  expect(djb2('')).toBe(5381);
  expect(djb2('a')).toBe(177_670);
  expect(djb2('31000001')).toBe(3_157_110_506);
  expect(djb2('31000002')).toBe(3_157_110_507);
});
