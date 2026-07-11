import { describe, expect, it } from 'vitest';
import { fuzzyMatch } from './match';

describe('fuzzyMatch', () => {
  it('returns a zero-score sentinel for empty query', () => {
    const out = fuzzyMatch('', 'Forgotten Frontier Recursive Depot');
    expect(out).toEqual({ score: 0, matchIndices: [] });
  });

  it('returns null when nothing matches', () => {
    expect(fuzzyMatch('zzzqqq', 'Forgotten Frontier Recursive Depot')).toBeNull();
  });

  it('finds an initials-style subsequence match (ffrd -> FFRD)', () => {
    const out = fuzzyMatch('ffrd', 'Forgotten Frontier Recursive Depot');
    expect(out).not.toBeNull();
    // Indices into the target where F, F, R, D land.
    const target = 'Forgotten Frontier Recursive Depot';
    // The matcher is case-insensitive; we just check that one F, another F,
    // an R, and a D were chosen — and that they appear in ascending order.
    expect(out!.matchIndices).toHaveLength(4);
    const chars = out!.matchIndices.map((i) => target[i]!.toLowerCase());
    expect(chars).toEqual(['f', 'f', 'r', 'd']);
    for (let i = 1; i < out!.matchIndices.length; i++) {
      expect(out!.matchIndices[i]).toBeGreaterThan(out!.matchIndices[i - 1]!);
    }
  });

  it('ranks a substring match above a non-contiguous subsequence', () => {
    const contiguous = fuzzyMatch('forg', 'Forgotten Frontier');
    const scattered = fuzzyMatch('forg', 'Find Other Random Group');
    expect(contiguous).not.toBeNull();
    // scattered may be null if fuzzysort rejects it; either way it's worse.
    if (scattered !== null) {
      expect(contiguous!.score).toBeGreaterThan(scattered.score);
    }
  });

  it('ranks a prefix match above a middle match', () => {
    const prefix = fuzzyMatch('forg', 'Forgotten Frontier');
    const middle = fuzzyMatch('forg', 'In the Forgotten Forest');
    expect(prefix).not.toBeNull();
    expect(middle).not.toBeNull();
    expect(prefix!.score).toBeGreaterThan(middle!.score);
  });

  it('is case-insensitive in both directions', () => {
    expect(fuzzyMatch('FORG', 'Forgotten Frontier')).not.toBeNull();
    expect(fuzzyMatch('forg', 'FORGOTTEN FRONTIER')).not.toBeNull();
  });
});
