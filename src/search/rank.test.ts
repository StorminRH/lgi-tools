import { describe, expect, it } from 'vitest';
import { rankFuzzyResults } from './rank';
import type { FuzzyMatch } from './match';
import type { SearchResult } from '.';

type Item = { id: string; label: string };

const items: Item[] = [
  { id: 'a', label: 'Tritanium' },
  { id: 'b', label: 'Pyerite' },
  { id: 'c', label: 'Tritanite' },
];

const toResult = (item: Item, match: FuzzyMatch): SearchResult =>
  ({
    kind: 'tool',
    id: item.id,
    label: item.label,
    href: '#',
    matchIndices: match.matchIndices,
  }) as SearchResult;

describe('rankFuzzyResults', () => {
  it('keeps only the matches, best-first', () => {
    const out = rankFuzzyResults(items, 'trit', (i) => i.label, toResult);
    expect(out.map((r) => r.id)).toEqual(['a', 'c']); // Pyerite drops; both "Trit…" ranked
    expect(out.every((r) => Array.isArray((r as SearchResult).matchIndices))).toBe(true);
  });

  it('returns nothing when nothing matches', () => {
    expect(rankFuzzyResults(items, 'zzzz', (i) => i.label, toResult)).toEqual([]);
  });

  it('caps the result count at the limit', () => {
    const out = rankFuzzyResults(items, 't', (i) => i.label, toResult, { limit: 1 });
    expect(out).toHaveLength(1);
  });

  it('ranks strictly by match score, not input order', () => {
    // An exact/stronger match must sort ahead of a weaker one regardless of
    // where it sits in the source list.
    const shuffled: Item[] = [
      { id: 'weak', label: 'T-x-r-i-t' },
      { id: 'strong', label: 'Trit' },
    ];
    const out = rankFuzzyResults(shuffled, 'trit', (i) => i.label, toResult);
    expect(out[0].id).toBe('strong');
  });
});
