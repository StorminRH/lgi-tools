import { describe, expect, it } from 'vitest';
import type { SearchResult, SearchSection } from '@/search';
import { pillToneClasses } from '@/components/ui/pill';
import { flattenSections, searchIconClass, splitMatchRuns } from './global-search-view';

const result = (over: Partial<SearchResult> = {}): SearchResult =>
  ({ id: 'x', label: 'Item', href: '/x', ...over }) as SearchResult;

describe('splitMatchRuns', () => {
  it('returns one unmatched run when there are no indices', () => {
    expect(splitMatchRuns('Tritanium')).toEqual([{ matched: false, text: 'Tritanium' }]);
    expect(splitMatchRuns('Tritanium', [])).toEqual([{ matched: false, text: 'Tritanium' }]);
  });

  it('collapses adjacent matched chars into a single run', () => {
    expect(splitMatchRuns('Tritan', [0, 1, 2])).toEqual([
      { matched: true, text: 'Tri' },
      { matched: false, text: 'tan' },
    ]);
  });

  it('interleaves matched and unmatched runs', () => {
    expect(splitMatchRuns('abcd', [1, 3])).toEqual([
      { matched: false, text: 'a' },
      { matched: true, text: 'b' },
      { matched: false, text: 'c' },
      { matched: true, text: 'd' },
    ]);
  });
});

describe('flattenSections', () => {
  it('flattens section results into one continuous list', () => {
    const sections = [
      { name: 'Sites', results: [result({ id: 'a' }), result({ id: 'b' })] },
      { name: 'Tools', results: [result({ id: 'c' })] },
    ] as SearchSection[];
    expect(flattenSections(sections).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('searchIconClass', () => {
  it('resolves a known tone to its palette classes', () => {
    expect(searchIconClass('green')).toBe(pillToneClasses.green);
    expect(searchIconClass('magenta')).toBe(pillToneClasses.magenta);
  });

  it('falls back to neutral for missing or legacy tones', () => {
    expect(searchIconClass(undefined)).toBe(pillToneClasses.neutral);
    expect(searchIconClass('cls-c1')).toBe(pillToneClasses.neutral);
  });
});
