import { expect, test } from 'vitest';
import { anyEligibleCold, loadFailureStep, neverCold, RECONCILE_SCHEDULE, reconcileDelay } from './live-dataset';

test('a dataset stays cold only while an eligible character has no data', () => {
  const chars = (spec: Array<[number, boolean]>) =>
    spec.map(([characterId, synced]) => ({ characterId, data: synced ? { x: 1 } : null }));
  expect(anyEligibleCold(chars([[1, false]]), '1')).toBe(true);
  expect(anyEligibleCold(chars([[9, false]]), '1,2')).toBe(false);
  expect(anyEligibleCold(chars([[1, true], [2, true]]), '1,2')).toBe(false);
  expect(anyEligibleCold(chars([[1, false]]), '')).toBe(false);
});

const settled = { refreshing: false };
const refreshing = { refreshing: true };

test('reconcile waits on the schedule while the dataset is cold, then stops', () => {
  const cold = () => true;
  const schedule = [4_000, 8_000, 15_000] as const;
  expect(reconcileDelay(0, settled, 'k', cold, schedule)).toBe(4_000);
  expect(reconcileDelay(1, settled, 'k', cold, schedule)).toBe(8_000);
  expect(reconcileDelay(2, settled, 'k', cold, schedule)).toBe(15_000);
  expect(reconcileDelay(3, settled, 'k', cold, schedule)).toBeNull();
  expect(reconcileDelay(0, settled, 'k', () => false, schedule)).toBeNull();
  expect(reconcileDelay(2, settled, 'k', () => false, schedule)).toBeNull();

  const seen: Array<[unknown, unknown]> = [];
  expect(
    reconcileDelay(0, { ...settled, n: 1 }, 42, (response, key) => {
      seen.push([response, key]);
      return false;
    }, schedule),
  ).toBeNull();
  expect(seen).toEqual([[{ refreshing: false, n: 1 }, 42]]);
});

test('a refresh under way keeps the dataset cold on its own, across the default schedule', () => {
  expect(RECONCILE_SCHEDULE).toEqual([4_000, 8_000, 15_000, 30_000, 60_000]);
  expect(neverCold()).toBe(false);
  for (const [attempt, delay] of RECONCILE_SCHEDULE.entries()) {
    expect(reconcileDelay(attempt, refreshing, true, neverCold, RECONCILE_SCHEDULE)).toBe(delay);
  }
  expect(reconcileDelay(RECONCILE_SCHEDULE.length, refreshing, true, neverCold, RECONCILE_SCHEDULE)).toBeNull();
  expect(reconcileDelay(0, settled, true, neverCold, RECONCILE_SCHEDULE)).toBeNull();
});

test('a failed load retries once, then fails, and keeps data already on screen', () => {
  expect(loadFailureStep(false, false)).toBe('retry');
  expect(loadFailureStep(false, true)).toBe('fail');
  expect(loadFailureStep(true, false)).toBe('keep');
});
