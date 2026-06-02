import { describe, expect, it } from 'vitest';
import { liveIskFor } from './live-isk';

describe('liveIskFor', () => {
  it('multiplies units by the per-unit buy price, rounded', () => {
    expect(liveIskFor(6, 14_733_333)).toBe(88_399_998);
    expect(liveIskFor(3, 1.5)).toBe(5); // 4.5 → 5
    expect(liveIskFor(2, 1.4)).toBe(3); // 2.8 → 3
  });

  it('returns null without a positive unit count', () => {
    expect(liveIskFor(null, 100)).toBeNull();
    expect(liveIskFor(0, 100)).toBeNull();
    expect(liveIskFor(-5, 100)).toBeNull();
  });

  it('returns null without a usable buy price', () => {
    expect(liveIskFor(10, null)).toBeNull();
    expect(liveIskFor(10, 0)).toBeNull();
  });
});
