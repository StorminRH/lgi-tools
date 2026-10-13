import type { SearchSource } from '@/platform/search';
import { recentsSearchSource } from '@/features/search-recents/search';
import { sitesSearchSource } from '@/features/wormhole-sites/search';
import { blueprintsSearchSource } from '@/features/industry-planner/search';
import { toolsSearchSource } from '@/data/tools/search';
import { commandsSearchSource } from '@/composition/search/commands-source';

/** The global search's sources. Its sections come back in this order. */
export const SEARCH_SOURCES: readonly SearchSource[] = [
  recentsSearchSource,
  sitesSearchSource,
  blueprintsSearchSource,
  toolsSearchSource,
  commandsSearchSource,
];
