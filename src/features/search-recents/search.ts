import type { SearchSource } from '@/platform/search';
import { rankFuzzyResults } from '@/platform/search/rank';

export const recentsSearchSource: SearchSource = {
  id: 'recents',
  name: 'Recent',
  limit: 5,
  showOnEmpty: true,
  // An empty query scores every recent alike, so they stay in recency order.
  async search(query, ctx) {
    return rankFuzzyResults(ctx.recents, query, (r) => r.label, (r, match) => ({
      ...r,
      matchIndices: match.matchIndices,
    }));
  },
};
