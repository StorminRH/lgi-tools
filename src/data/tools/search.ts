import type { SearchSource } from '@/platform/search';
import { rankFuzzyResults } from '@/platform/search/rank';
import { TOOLS } from './registry';

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
        iconTone: 'green',
        matchIndices: match.matchIndices,
        disabled: tool.href === null,
      }),
    );
  },
};
