import { expect, test } from 'vitest';
import { clamp, clamp01, clampPct, roundIsk, roundTo } from './math';

test('clamp keeps in-range values, pins to each bound, lets min win an inverted range and passes NaN through', () => {
  expect(clamp(5, 0, 10)).toBe(5);
  expect(clamp(-3, 0, 10)).toBe(0);
  expect(clamp(12, 0, 10)).toBe(10);
  expect(clamp(0, 0, 10)).toBe(0);
  expect(clamp(10, 0, 10)).toBe(10);

  expect(clamp(5, 10, 0)).toBe(10);
  expect(clamp(-5, 10, 0)).toBe(10);
  expect(clamp(50, 40, 30)).toBe(40);

  expect(clamp(NaN, 0, 10)).toBeNaN();
  expect(clamp01(NaN)).toBeNaN();
  expect(clampPct(NaN)).toBeNaN();
});

test('clamp01 and clampPct pin to their unit and percent ranges', () => {
  expect(clamp01(-0.2)).toBe(0);
  expect(clamp01(0.4)).toBe(0.4);
  expect(clamp01(1.7)).toBe(1);

  expect(clampPct(-12)).toBe(0);
  expect(clampPct(37.5)).toBe(37.5);
  expect(clampPct(140)).toBe(100);
});

test('roundTo and roundIsk keep Math.round half-up output, float noise included', () => {
  expect(roundTo(1.005, 2)).toBe(1);
  expect(roundTo(0.1 + 0.2, 2)).toBe(0.3);
  expect(roundTo(-1.235, 2)).toBe(-1.24);
  expect(roundTo(-2.5, 0)).toBe(-2);
  expect(roundTo(0.45, 1)).toBe(0.5);
  expect(roundTo(12.3456, 3)).toBe(12.346);

  expect(roundIsk(1234.5678)).toBe(1234.57);
  expect(roundIsk(-99.994)).toBe(-99.99);
  expect(roundIsk(250_000_000.125)).toBe(250_000_000.13);
  expect(roundIsk(42)).toBe(42);
});
