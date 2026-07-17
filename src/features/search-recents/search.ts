// Recent search source. The ONLY source that opts into `showOnEmpty: true`
// — focusing the empty search bar surfaces the user's previously-clicked
// rows so re-finding a recently-viewed site doesn't require re-typing its
// name. The actual storage lives in `./storage.ts`; the source reads from
// the SearchContext's `recents` array (populated by GlobalSearch on mount
// via `readRecents()`).

import type { SearchResult, SearchSource } from '@/search';
import { fuzzyMatch } from '@/search/match';

/**
 * Global-search source for recents search source; it owns matching and result mapping while the
 * app layer owns registration.
 */
export const recentsSearchSource: SearchSource = {
  id: 'recents',
  name: 'Recent',
  limit: 5,
  showOnEmpty: true,
  async search(query, ctx) {
    if (query.length === 0) {
      // Preserve recency order — no scoring needed when the bar is empty.
      return ctx.recents.map<SearchResult>((r) => ({ ...r, matchIndices: [] }));
    }

    const matched = ctx.recents
      .map((r) => ({ row: r, match: fuzzyMatch(query, r.label) }))
      .filter((entry): entry is { row: SearchResult; match: NonNullable<typeof entry.match> } => entry.match !== null);

    matched.sort((a, b) => b.match.score - a.match.score);

    return matched.map<SearchResult>(({ row, match }) => ({
      ...row,
      matchIndices: match.matchIndices,
    }));
  },
};
