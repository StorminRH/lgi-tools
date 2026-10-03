import { registerSearchSource, registerLazySearchSource } from '@/platform/search';
import { recentsSearchSource } from '@/features/search-recents/search';
import { sitesSearchSource } from '@/features/wormhole-sites/search';
import { blueprintsSearchSource } from '@/features/industry-planner/search';
import { toolsSearchSource } from '@/data/tools/search';
import { commandsSearchSource } from '@/composition/search/commands-source';
import { systemsSearchSource } from '@/data/eve-data/search';

registerSearchSource(recentsSearchSource);
registerSearchSource(sitesSearchSource);
registerLazySearchSource(blueprintsSearchSource);
registerSearchSource(toolsSearchSource);
registerSearchSource(commandsSearchSource);
registerLazySearchSource(systemsSearchSource);
