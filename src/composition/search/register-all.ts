import { registerSearchSource, registerLazySearchSource } from '@/platform/search';
import { recentsSearchSource } from '@/features/search-recents/search';
import { createSitesSearchSource } from '@/features/wormhole-sites/search';
import { codexSiteHref } from '@/features/codex/subjects';
import { blueprintsSearchSource } from '@/features/industry-planner/search';
import { toolsSearchSource } from '@/data/tools/search';
import { codexSearchSource } from '@/composition/search/codex-source';
import { commandsSearchSource } from '@/composition/search/commands-source';
import { systemsSearchSource } from '@/data/eve-data/search';

registerSearchSource(recentsSearchSource);
registerSearchSource(createSitesSearchSource(codexSiteHref));
registerLazySearchSource(codexSearchSource);
registerLazySearchSource(blueprintsSearchSource);
registerSearchSource(toolsSearchSource);
registerSearchSource(commandsSearchSource);
registerLazySearchSource(systemsSearchSource);
