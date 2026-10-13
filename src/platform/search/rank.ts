import { fuzzyMatch, type FuzzyMatch } from './match';
import type { SearchResult, SearchSource } from '.';

/**
 * The most rows an indexed search builds. It sits above every indexed
 * source's limit (searchAll slices to that), and keeps a broad query over a
 * large index from building results nobody sees.
 */
const INDEXED_RESULT_CAP = 20;

/**
 * The items whose label fuzzy-matches the query, best score first, capped at
 * limit when one is given. Equal scores keep input order unless tieBreak
 * orders them. An empty query matches every item with score 0, so input
 * order holds. Ranking and the cap run on the raw matches, so toResult runs
 * only for the rows returned.
 */
export function rankFuzzyResults<T>(
  items: readonly T[],
  query: string,
  getLabel: (item: T) => string,
  toResult: (item: T, match: FuzzyMatch) => SearchResult,
  opts?: { limit?: number; tieBreak?: (a: T, b: T) => number },
): SearchResult[] {
  const matched: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, getLabel(item));
    if (match) matched.push({ item, match });
  }
  matched.sort((a, b) => b.match.score - a.match.score || (opts?.tieBreak?.(a.item, b.item) ?? 0));
  const kept = opts?.limit === undefined ? matched : matched.slice(0, opts.limit);
  return kept.map(({ item, match }) => toResult(item, match));
}

/**
 * A search over an index loaded on first use. An empty query returns nothing
 * without loading, a query aborted while the index loads returns nothing, and
 * a failed load rejects so the caller can try again. It builds at most 20
 * rows, and searchAll caps those at the source's limit.
 */
export function indexedFuzzySearch<T>(opts: {
  load: () => Promise<readonly T[]>;
  label: (item: T) => string;
  toResult: (item: T, match: FuzzyMatch) => SearchResult;
}): SearchSource['search'] {
  return async (query, ctx) => {
    if (query.length === 0) return [];
    const items = await opts.load();
    if (ctx.signal?.aborted) return [];
    return rankFuzzyResults(items, query, opts.label, opts.toResult, { limit: INDEXED_RESULT_CAP });
  };
}
