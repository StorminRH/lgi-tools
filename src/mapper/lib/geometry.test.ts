import { expect, test } from 'vitest';
import { pointToward } from './geometry';

test('pointToward walks a length from the start toward the target and nulls a zero span', () => {
  expect(pointToward({ x: 0, y: 0 }, { x: 80, y: 60 }, 25)).toStrictEqual({ x: 20, y: 15 });
  expect(pointToward({ x: 80, y: 60 }, { x: 0, y: 0 }, 25)).toStrictEqual({ x: 60, y: 45 });
  expect(pointToward({ x: 0, y: 0 }, { x: 0, y: 0 }, 25)).toBeNull();
});
