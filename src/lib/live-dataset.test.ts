import { describe, expect, it } from 'vitest';
import { anyEligibleCold, eligibleIdsKey, shouldReconcile } from './live-dataset';

describe('eligibleIdsKey', () => {
  it('dedupes and sorts into a stable string', () => {
    expect(eligibleIdsKey([3, 1, 2, 1])).toBe('1,2,3');
  });

  it('is order-independent for the same id set (stable reload key)', () => {
    expect(eligibleIdsKey([2, 1])).toBe(eligibleIdsKey([1, 2]));
  });

  it('is the empty string for no ids', () => {
    expect(eligibleIdsKey([])).toBe('');
  });
});

describe('anyEligibleCold', () => {
  const chars = (spec: Array<[number, boolean]>) =>
    spec.map(([characterId, synced]) => ({ characterId, data: synced ? { x: 1 } : null }));

  it('is true when an eligible character is still cold (data:null)', () => {
    expect(anyEligibleCold(chars([[1, false]]), '1')).toBe(true);
  });

  it('is false when the only cold character is not eligible', () => {
    expect(anyEligibleCold(chars([[9, false]]), '1,2')).toBe(false);
  });

  it('is false when every eligible character has synced', () => {
    expect(anyEligibleCold(chars([[1, true], [2, true]]), '1,2')).toBe(false);
  });

  it('is false for an empty eligible key', () => {
    expect(anyEligibleCold(chars([[1, false]]), '')).toBe(false);
  });
});

describe('shouldReconcile', () => {
  const coldAlways = () => true;
  const coldNever = () => false;

  it('reconciles once when not yet reconciled and the dataset is cold', () => {
    expect(shouldReconcile(false, {}, 'k', coldAlways)).toBe(true);
  });

  it('does not reconcile again once already reconciled', () => {
    expect(shouldReconcile(true, {}, 'k', coldAlways)).toBe(false);
  });

  it('does not reconcile when the dataset is not cold', () => {
    expect(shouldReconcile(false, {}, 'k', coldNever)).toBe(false);
  });

  it('passes the response + key through to the predicate', () => {
    const seen: Array<[unknown, unknown]> = [];
    shouldReconcile(false, { n: 1 }, 42, (r, k) => {
      seen.push([r, k]);
      return false;
    });
    expect(seen).toEqual([[{ n: 1 }, 42]]);
  });
});
