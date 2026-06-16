import { describe, expect, it } from 'vitest';
import { formatRemaining } from './time';

describe('formatRemaining', () => {
  it('formats the largest two units', () => {
    expect(formatRemaining(30_000)).toBe('<1m');
    expect(formatRemaining(5 * 60_000)).toBe('5m');
    expect(formatRemaining(3 * 3_600_000 + 20 * 60_000)).toBe('3h 20m');
    expect(formatRemaining(2 * 86_400_000 + 5 * 3_600_000)).toBe('2d 5h');
  });
});
