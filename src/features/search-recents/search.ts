// Recent search source. The ONLY source that opts into `showOnEmpty: true`
// — focusing the empty search bar surfaces the user's previously-clicked
// rows so re-finding a recently-viewed site doesn't require re-typing its
// name. The actual storage lives in `./storage.ts`; the source reads from
// the SearchContext's `recents` array (populated by GlobalSearch on mount
// via `readRecents()`).

import { registerSearchSource } from '@/data/search';
import type { SearchResult } from '@/data/search';

function matchRange(label: string, query: string): [number, number] | undefined {
  if (query.length === 0) return undefined;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return undefined;
  return [idx, idx + query.length];
}

registerSearchSource({
  name: 'Recent',
  limit: 5,
  showOnEmpty: true,
  async search(query, ctx) {
    const q = query.toLowerCase();
    const filtered = q.length === 0
      ? ctx.recents
      : ctx.recents.filter((r) => r.label.toLowerCase().includes(q));
    return filtered.map<SearchResult>((r) => ({
      ...r,
      matchRange: matchRange(r.label, query),
    }));
  },
});
