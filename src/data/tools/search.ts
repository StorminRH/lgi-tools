// Tools search source. Surfaces every entry in the canonical TOOLS array
// (including SOON entries — they render dimmed so users learn the
// platform's full surface area even before each tool is live).

import { registerSearchSource } from '@/data/search';
import type { SearchResult } from '@/data/search';
import { TOOLS } from './registry';

function matchRange(label: string, query: string): [number, number] | undefined {
  if (query.length === 0) return undefined;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return undefined;
  return [idx, idx + query.length];
}

registerSearchSource({
  name: 'Tools',
  limit: 5,
  async search(query) {
    const q = query.toLowerCase();
    return TOOLS
      .filter((t) => t.label.toLowerCase().includes(q))
      .map<SearchResult>((t) => ({
        kind: 'tool',
        id: `tool:${t.label}`,
        label: t.label,
        sub: t.description,
        href: t.href ?? '#',
        iconText: t.abbr,
        iconTone: 'tool',
        matchRange: matchRange(t.label, query),
        disabled: t.href === null,
      }));
  },
});
