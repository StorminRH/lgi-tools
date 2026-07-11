import { describe, expect, it } from 'vitest';
import { arrowStep, parseEfficiencyInput, shownEfficiency, stepValue } from './efficiency-input';

describe('parseEfficiencyInput', () => {
  it('accepts a whole number within [0, max]', () => {
    expect(parseEfficiencyInput('7', 10)).toBe(7);
    expect(parseEfficiencyInput('0', 10)).toBe(0);
    expect(parseEfficiencyInput('10', 10)).toBe(10);
  });

  it('rejects out-of-range, non-integer, and non-numeric input', () => {
    expect(parseEfficiencyInput('11', 10)).toBeNull();
    expect(parseEfficiencyInput('-1', 10)).toBeNull();
    expect(parseEfficiencyInput('2.5', 10)).toBeNull();
    expect(parseEfficiencyInput('abc', 10)).toBeNull();
  });
});

describe('stepValue', () => {
  it('steps by delta, clamped to [0, max]', () => {
    expect(stepValue(5, 1, 10)).toBe(6);
    expect(stepValue(5, -1, 10)).toBe(4);
    expect(stepValue(10, 1, 10)).toBe(10); // clamps at max
    expect(stepValue(0, -1, 10)).toBe(0); // clamps at 0
  });
});

describe('shownEfficiency', () => {
  it('is empty only when the node is unowned and unset', () => {
    expect(shownEfficiency('unowned', false, 0)).toBe('');
  });

  it('shows the effective value otherwise', () => {
    expect(shownEfficiency('unowned', true, 4)).toBe('4'); // an override on an unowned node
    expect(shownEfficiency('owned', false, 8)).toBe('8');
    expect(shownEfficiency('manual', true, 3)).toBe('3');
  });
});

describe('arrowStep', () => {
  it('steps up/down on the arrow keys, nothing otherwise', () => {
    expect(arrowStep('ArrowUp')).toBe(1);
    expect(arrowStep('ArrowDown')).toBe(-1);
    expect(arrowStep('Enter')).toBe(0);
    expect(arrowStep('a')).toBe(0);
  });
});
