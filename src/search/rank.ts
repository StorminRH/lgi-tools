import { fuzzyMatch, type FuzzyMatch } from './match';
import type { SearchResult } from '.';

/**
 * The one ranking path behind every fuzzy search source (tools, commands,
 * systems, blueprints): score each item's label against the query, drop the
 * non-matches, sort best-first, optionally cap the count, and project each
 * survivor to a SearchResult. `limit` bounds the map work for a loose query on a
 * large index; omit it to rank the whole (already-small) list.
 */
export function rankFuzzyResults<T>(
  items: readonly T[],
  query: string,
  getLabel: (item: T) => string,
  toResult: (item: T, match: FuzzyMatch) => SearchResult,
  opts?: { limit?: number },
): SearchResult[] {
  const matched: { item: T; match: FuzzyMatch }[] = [];
  for (const item of items) {
    const match = fuzzyMatch(query, getLabel(item));
    if (match) matched.push({ item, match });
  }
  matched.sort((a, b) => b.match.score - a.match.score);
  const capped = opts?.limit === undefined ? matched : matched.slice(0, opts.limit);
  return capped.map(({ item, match }) => toResult(item, match));
}
