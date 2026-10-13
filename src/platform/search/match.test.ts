import { describe, expect, it } from 'vitest';
import { fuzzyMatch, matchesAllWords } from './match';

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
    if (out === null) throw new Error('expected initials-style subsequence match');
    const target = 'Forgotten Frontier Recursive Depot';
    expect(out.matchIndices).toHaveLength(4);
    const chars = out.matchIndices.map((i) => target[i]?.toLowerCase());
    expect(chars).toEqual(['f', 'f', 'r', 'd']);
    for (let i = 1; i < out.matchIndices.length; i++) {
      expect(out.matchIndices[i]).toBeGreaterThan(out.matchIndices[i - 1] ?? -1);
    }
  });

  it('ranks a substring match above a non-contiguous subsequence', () => {
    const contiguous = fuzzyMatch('forg', 'Forgotten Frontier');
    const scattered = fuzzyMatch('forg', 'Find Other Random Group');
    expect(contiguous).not.toBeNull();
    expect(scattered).not.toBeNull();
    if (contiguous === null || scattered === null) throw new Error('expected both ranking fixtures to match');
    expect(contiguous.score).toBeGreaterThan(scattered.score);
  });

  it('ranks a prefix match above a middle match', () => {
    const prefix = fuzzyMatch('forg', 'Forgotten Frontier');
    const middle = fuzzyMatch('forg', 'In the Forgotten Forest');
    expect(prefix).not.toBeNull();
    expect(middle).not.toBeNull();
    if (prefix === null || middle === null) throw new Error('expected both ranking fixtures to match');
    expect(prefix.score).toBeGreaterThan(middle.score);
  });

  it('is case-insensitive in both directions', () => {
    expect(fuzzyMatch('FORG', 'Forgotten Frontier')).not.toBeNull();
    expect(fuzzyMatch('forg', 'FORGOTTEN FRONTIER')).not.toBeNull();
  });
});

describe('matchesAllWords', () => {
  it('needs every typed word in the name, in any order, ignoring case and spacing', () => {
    const name = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
    expect(matchesAllWords(name, 'jita navy')).toBe(true);
    expect(matchesAllWords(name, 'navy jita')).toBe(true);
    expect(matchesAllWords(name, 'NAVY   Jita')).toBe(true);
    expect(matchesAllWords(name, ' jita navy ')).toBe(true);
    expect(matchesAllWords(name, 'nav')).toBe(true);
    expect(matchesAllWords(name, 'jita amarr')).toBe(false);
    expect(matchesAllWords(name, 'jitanavy')).toBe(false);
  });
});
