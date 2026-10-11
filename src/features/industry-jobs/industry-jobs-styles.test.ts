import { expect, test } from 'vitest';
import { jobCategory } from './industry-jobs-styles';

test('jobCategory maps activities to their tracked slot family, including live-ESI activity 9', () => {
  expect(jobCategory(1)).toBe('manufacturing');
  expect(jobCategory(11)).toBe('reactions');
  expect(jobCategory(9)).toBe('reactions');
  for (const science of [3, 4, 5, 8]) expect(jobCategory(science)).toBe('science');
  expect(jobCategory(999)).toBeNull();
});
