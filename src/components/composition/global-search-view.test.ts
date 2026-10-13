import { describe, expect, it } from 'vitest';
import type { SearchResult, SearchSection } from '@/platform/search';
import { pillToneClasses } from '@/components/ui/pill';
import { blueprintImage, itemImage } from '@/data/eve-data/type-images';
import {
  searchIconClass,
  searchRowImage,
  searchRowKey,
  searchRowsByKey,
  splitMatchRuns,
} from './global-search-view';

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

describe('searchRowsByKey', () => {
  it('keys every row in display order, keeping a recent that repeats another section row', () => {
    const tool = result({ id: 'tool:sites', label: 'Sites' });
    const tools: SearchSection = { name: 'Tools', results: [tool] };
    const rows = searchRowsByKey([
      { name: 'Recent', results: [result({ id: 'tool:sites', label: 'Sites', sub: 'Recent' })] },
      { name: 'Sites', results: [result({ id: 'a' }), result({ id: 'b' })] },
      tools,
    ]);
    expect([...rows.keys()]).toEqual(['Recent/tool:sites', 'Sites/a', 'Sites/b', 'Tools/tool:sites']);
    // A rendered row's value finds that row, not the recent copy.
    expect(rows.get(searchRowKey(tools, tool))).toBe(tool);
    expect(rows.get('Recent/tool:sites')).toMatchObject({ sub: 'Recent' });
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
    expect(searchIconClass('toString')).toBe(pillToneClasses.neutral);
  });
});

describe('searchRowImage', () => {
  it('prefers a source-resolved image over the generic typeId item image', () => {
    const blueprint = blueprintImage(691);
    expect(searchRowImage(result({ icon: blueprint, typeId: 587 }))).toEqual(blueprint);
  });

  it('falls back to item intent for a typed row and leaves glyph rows unresolved', () => {
    expect(searchRowImage(result({ typeId: 587 }))).toEqual(itemImage(587));
    expect(searchRowImage(result())).toBeUndefined();
  });
});
