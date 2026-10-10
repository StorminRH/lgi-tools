import { expect, test } from 'vitest';
import { activityLabel } from './constants';

test('activityLabel names each industry activity, reads live-ESI activity 9 as a reaction, and falls back to Industry', () => {
  expect(activityLabel(1)).toBe('Manufacturing');
  expect(activityLabel(3)).toBe('TE Research');
  expect(activityLabel(4)).toBe('ME Research');
  expect(activityLabel(5)).toBe('Copying');
  expect(activityLabel(8)).toBe('Invention');
  expect(activityLabel(9)).toBe('Reaction');
  expect(activityLabel(11)).toBe('Reaction');
  expect(activityLabel(999)).toBe('Industry');
});
