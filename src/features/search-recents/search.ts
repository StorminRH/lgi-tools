import type { SearchResult, SearchSource } from '@/platform/search';
import { fuzzyMatch } from '@/platform/search/match';

export const recentsSearchSource: SearchSource = {
  id: 'recents',
  name: 'Recent',
  limit: 5,
  showOnEmpty: true,
  async search(query, ctx) {
    if (query.length === 0) {

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
