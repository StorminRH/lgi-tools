// Tools search source. Surfaces every entry in the canonical TOOLS array
// (including SOON entries — they render dimmed so users learn the
// platform's full surface area even before each tool is live).

import type { SearchResult, SearchSource } from '@/search';
import { fuzzyMatch } from '@/search/match';
import { TOOLS } from './registry';

export const toolsSearchSource: SearchSource = {
  name: 'Tools',
  limit: 5,
  async search(query) {
    const matched = TOOLS
      .map((t) => ({ tool: t, match: fuzzyMatch(query, t.label) }))
      .filter((row): row is { tool: typeof TOOLS[number]; match: NonNullable<typeof row.match> } => row.match !== null);

    matched.sort((a, b) => b.match.score - a.match.score);

    return matched.map<SearchResult>(({ tool, match }) => ({
      kind: 'tool',
      id: `tool:${tool.label}`,
      label: tool.label,
      sub: tool.description,
      href: tool.href ?? '#',
      iconText: tool.abbr,
      iconTone: 'tool',
      matchIndices: match.matchIndices,
      disabled: tool.href === null,
    }));
  },
};
