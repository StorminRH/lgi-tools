import { describe, expect, it } from 'vitest';
import { roundedLeaderPath } from './leader-path';

describe('roundedLeaderPath', () => {
  it('draws nothing for no points and a plain line for two', () => {
    expect(roundedLeaderPath([], 8)).toBe('');
    expect(roundedLeaderPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 8)).toBe('M 0 0 L 10 0');
  });

  it('rounds each interior corner, capped at half the shorter leg', () => {
    const d = roundedLeaderPath(
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 6 },
      ],
      8,
    );
    expect(d).toBe('M 0 0 L 17 0 Q 20 0 20 3 L 20 6');
  });
});
