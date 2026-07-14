import { describe, expect, it } from 'vitest';
import { effectiveRemaining } from './budget';

describe('effectiveRemaining', () => {
  it('uses the full ceiling when neither mirror has spent budget', () => {
    expect(effectiveRemaining(null, 0)).toBe(100);
  });

  it('uses the lower header echo', () => {
    expect(effectiveRemaining(60, 10)).toBe(60);
  });

  it('uses the lower conservative self-count remainder', () => {
    expect(effectiveRemaining(80, 30)).toBe(70);
  });

  it('preserves a negative result when the self-count exceeds the ceiling', () => {
    expect(effectiveRemaining(null, 105)).toBe(-5);
  });
});
