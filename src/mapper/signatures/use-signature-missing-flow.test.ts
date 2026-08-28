import { expect, it } from 'vitest';
import { listedMissingIds } from './use-signature-missing-flow';

it('highlights missing ids only when the paste target is the listed system', () => {
  const bySystem = new Map<number, ReadonlySet<string>>([
    [1, new Set(['ABC-123'])],
    [2, new Set(['XYZ-999'])],
  ]);
  expect([...listedMissingIds(2, 1, bySystem)]).toEqual([]);
  expect([...listedMissingIds(1, 1, bySystem)]).toEqual(['ABC-123']);
  expect([...listedMissingIds(null, 1, bySystem)]).toEqual([]);
});
