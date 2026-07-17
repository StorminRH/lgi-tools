// Tools search source. Surfaces every entry in the canonical TOOLS array
// (including SOON entries — they render dimmed so users learn the
// platform's full surface area even before each tool is live).

import type { SearchSource } from '@/search';
import { rankFuzzyResults } from '@/search/rank';
import { TOOLS } from './registry';

/**
 * Global-search source for tools search source; it owns matching and result mapping while the app
 * layer owns registration.
 */
export const toolsSearchSource: SearchSource = {
  id: 'tools',
  name: 'Tools',
  limit: 5,
  async search(query) {
    return rankFuzzyResults(
      TOOLS,
      query,
      (t) => t.label,
      (tool, match) => ({
        kind: 'tool',
        id: `tool:${tool.label}`,
        label: tool.label,
        sub: tool.description,
        href: tool.href ?? '#',
        iconText: tool.abbr,
        // Abstract tone (the search render maps it to tokens); tools read ISK-green.
        iconTone: 'green',
        matchIndices: match.matchIndices,
        disabled: tool.href === null,
      }),
    );
  },
};
