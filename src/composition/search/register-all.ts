// Search-source wiring manifest. Composition pulls each slice's exported
// search source into the platform engine. No slice imports a layer above
// itself. Imported once
// at boot by the CLIENT shell (AppHeaderShell) so the client registry is
// populated before GlobalSearch dispatches. Registration order = dropdown
// section order: Recent → Sites → Blueprints → Tools → Commands. Systems
// registers last and is excluded from the default scope (its rows have no
// destination page) — only scoped pickers (searchAll(['systems'])) query it.

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
