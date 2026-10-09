import { expect, test } from 'vitest';
import { anyEligibleCold, loadFailureStep, RECONCILE_ONCE, reconcileDelay } from './live-dataset';

test('a dataset stays cold only while an eligible character has no data', () => {
  const chars = (spec: Array<[number, boolean]>) =>
    spec.map(([characterId, synced]) => ({ characterId, data: synced ? { x: 1 } : null }));
  expect(anyEligibleCold(chars([[1, false]]), '1')).toBe(true);
  expect(anyEligibleCold(chars([[9, false]]), '1,2')).toBe(false);
  expect(anyEligibleCold(chars([[1, true], [2, true]]), '1,2')).toBe(false);
  expect(anyEligibleCold(chars([[1, false]]), '')).toBe(false);
});

test('reconcile waits on the schedule while the dataset is cold, then stops', () => {
  const cold = () => true;
  const schedule = [4_000, 8_000, 15_000] as const;
  expect(reconcileDelay(0, {}, 'k', cold, RECONCILE_ONCE)).toBe(4_000);
  expect(reconcileDelay(1, {}, 'k', cold, RECONCILE_ONCE)).toBeNull();
  expect(reconcileDelay(0, {}, 'k', cold, schedule)).toBe(4_000);
  expect(reconcileDelay(1, {}, 'k', cold, schedule)).toBe(8_000);
  expect(reconcileDelay(2, {}, 'k', cold, schedule)).toBe(15_000);
  expect(reconcileDelay(3, {}, 'k', cold, schedule)).toBeNull();
  expect(reconcileDelay(0, {}, 'k', () => false, schedule)).toBeNull();
  expect(reconcileDelay(2, {}, 'k', () => false, schedule)).toBeNull();

  const seen: Array<[unknown, unknown]> = [];
  expect(
    reconcileDelay(0, { n: 1 }, 42, (response, key) => {
      seen.push([response, key]);
      return false;
    }, schedule),
  ).toBeNull();
  expect(seen).toEqual([[{ n: 1 }, 42]]);
});

test('a failed load retries once, then fails, and keeps data already on screen', () => {
  expect(loadFailureStep(false, false)).toBe('retry');
  expect(loadFailureStep(false, true)).toBe('fail');
  expect(loadFailureStep(true, false)).toBe('keep');
});
