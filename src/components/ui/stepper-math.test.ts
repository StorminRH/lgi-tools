import { describe, expect, it } from 'vitest';
import { clampStep, commitStepperValue } from './stepper-math';

describe('commitStepperValue', () => {
  it('commits a whole number inside the bounds', () => {
    expect(commitStepperValue('5', { min: 0, max: 10 })).toBe(5);
  });

  it('commits the min and max boundaries', () => {
    expect(commitStepperValue('0', { min: 0, max: 10 })).toBe(0);
    expect(commitStepperValue('10', { min: 0, max: 10 })).toBe(10);
  });

  it('does not commit an empty draft', () => {
    expect(commitStepperValue('', { min: 0, max: 10 })).toBeNull();
  });

  it('does not commit a non-integer', () => {
    expect(commitStepperValue('1.5', { min: 0, max: 10 })).toBeNull();
  });

  it('does not commit a non-numeric draft', () => {
    expect(commitStepperValue('abc', { min: 0, max: 10 })).toBeNull();
  });

  it('does not commit below min or above max', () => {
    expect(commitStepperValue('-1', { min: 0, max: 10 })).toBeNull();
    expect(commitStepperValue('11', { min: 0, max: 10 })).toBeNull();
  });

  it('has no upper bound when max is omitted', () => {
    expect(commitStepperValue('999999', { min: 1 })).toBe(999999);
  });
});

describe('clampStep', () => {
  it('applies the delta when it stays inside the bounds', () => {
    expect(clampStep(5, 1, { min: 0, max: 10 })).toBe(6);
    expect(clampStep(5, -1, { min: 0, max: 10 })).toBe(4);
  });

  it('clamps to max rather than overshoot', () => {
    expect(clampStep(10, 1, { min: 0, max: 10 })).toBe(10);
  });

  it('clamps to min rather than undershoot', () => {
    expect(clampStep(0, -1, { min: 0, max: 10 })).toBe(0);
  });

  it('has no upper bound when max is omitted', () => {
    expect(clampStep(999999, 1, { min: 0 })).toBe(1000000);
  });
});
