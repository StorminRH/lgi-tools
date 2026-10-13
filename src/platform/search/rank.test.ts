import { describe, expect, it, vi } from 'vitest';
import { indexedFuzzySearch, rankFuzzyResults } from './rank';
import type { FuzzyMatch } from './match';
import type { SearchContext, SearchResult } from '.';

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
    expect(out.map((r) => r.id)).toEqual(['a', 'c']);
    expect(out.every((r) => Array.isArray((r as SearchResult).matchIndices))).toBe(true);
  });

  it('returns nothing when nothing matches', () => {
    expect(rankFuzzyResults(items, 'zzzz', (i) => i.label, toResult)).toEqual([]);
  });

  it('keeps input order for equal scores unless a tie-break orders them', () => {
    const twins: Item[] = [
      { id: 'b', label: 'Vault' },
      { id: 'c', label: 'Vault' },
      { id: 'a', label: 'Vault' },
    ];
    const ids = (out: SearchResult[]) => out.map((r) => r.id);
    expect(ids(rankFuzzyResults(twins, 'vault', (i) => i.label, toResult))).toEqual(['b', 'c', 'a']);
    expect(ids(rankFuzzyResults(twins, '', (i) => i.label, toResult))).toEqual(['b', 'c', 'a']);

    const byId = (a: Item, b: Item) => a.id.localeCompare(b.id);
    expect(ids(rankFuzzyResults(twins, 'vault', (i) => i.label, toResult, { tieBreak: byId }))).toEqual(['a', 'b', 'c']);

    // The tie-break never outranks the score.
    const mixed: Item[] = [
      { id: 'a', label: 'V-a-u-l-t' },
      { id: 'z', label: 'Vault' },
    ];
    expect(ids(rankFuzzyResults(mixed, 'vault', (i) => i.label, toResult, { tieBreak: byId }))).toEqual(['z', 'a']);
  });

  it('builds results only for the rows kept by the limit, after ranking and tie-break', () => {
    const many: Item[] = Array.from({ length: 50 }, (_, i) => ({ id: String(i).padStart(2, '0'), label: 'Vault' }));
    const spy = vi.fn(toResult);
    const byIdDesc = (a: Item, b: Item) => b.id.localeCompare(a.id);
    const out = rankFuzzyResults(many, 'vault', (i) => i.label, spy, { limit: 3, tieBreak: byIdDesc });
    expect(out.map((r) => r.id)).toEqual(['49', '48', '47']);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('ranks strictly by match score, not input order', () => {
    const shuffled: Item[] = [
      { id: 'weak', label: 'T-x-r-i-t' },
      { id: 'strong', label: 'Trit' },
    ];
    const out = rankFuzzyResults(shuffled, 'trit', (i) => i.label, toResult);
    expect(out[0]?.id).toBe('strong');
  });
});

describe('indexedFuzzySearch', () => {
  const ctx = (signal?: AbortSignal): SearchContext => ({ session: null, isAdmin: false, recents: [], signal });

  it('loads the index only for a real query, then ranks over it', async () => {
    const load = vi.fn(async () => items);
    const search = indexedFuzzySearch({ load, label: (i) => i.label, toResult });

    expect(await search('', ctx())).toEqual([]);
    expect(load).not.toHaveBeenCalled();

    const out = await search('trit', ctx());
    expect(load).toHaveBeenCalledOnce();
    expect(out.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('builds at most 20 rows on a broad query over a large index', async () => {
    const many: Item[] = Array.from({ length: 500 }, (_, i) => ({ id: `t${i}`, label: `Tritanium ${i}` }));
    const spy = vi.fn(toResult);
    const search = indexedFuzzySearch({ load: async () => many, label: (i) => i.label, toResult: spy });

    const out = await search('t', ctx());
    expect(out).toHaveLength(20);
    expect(spy).toHaveBeenCalledTimes(20);
  });

  it('drops the results of a query aborted while the index loads', async () => {
    const controller = new AbortController();
    const search = indexedFuzzySearch({
      load: async () => {
        controller.abort();
        return items;
      },
      label: (i) => i.label,
      toResult,
    });
    expect(await search('trit', ctx(controller.signal))).toEqual([]);
  });

  it('rejects when the index fails to load, so the next search can load again', async () => {
    const load = vi.fn<() => Promise<readonly Item[]>>()
      .mockRejectedValueOnce(new Error('index down'))
      .mockResolvedValueOnce(items);
    const search = indexedFuzzySearch({ load, label: (i) => i.label, toResult });

    await expect(search('trit', ctx())).rejects.toThrow('index down');
    expect((await search('trit', ctx())).map((r) => r.id)).toEqual(['a', 'c']);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
