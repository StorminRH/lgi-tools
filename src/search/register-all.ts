// Search-source wiring manifest. Lives in the unclassified src/search/ layer
// ABOVE the data and feature slices (the src/db/sde-pipeline.ts pattern): it
// PULLS each slice's exported search source and registers it into the
// slice-agnostic engine. No slice imports a layer above itself. Imported once
// at boot by the CLIENT shell (AppHeaderShell) so the client registry is
// populated before GlobalSearch dispatches. Registration order = dropdown
// section order: Recent → Sites → Blueprints → Tools → Commands. Systems
// registers last and is excluded from the default scope (its rows have no
// destination page) — only scoped pickers (searchAll(['systems'])) query it.

import { registerSearchSource, registerLazySearchSource } from '@/search';
import { recentsSearchSource } from '@/features/search-recents/search';
import { sitesSearchSource } from '@/features/wormhole-sites/search';
import { blueprintsSearchSource } from '@/features/industry-planner/search';
import { toolsSearchSource } from '@/data/tools/search';
import { commandsSearchSource } from '@/data/commands/search';
import { systemsSearchSource } from '@/data/eve-data/search';

registerSearchSource(recentsSearchSource);
registerSearchSource(sitesSearchSource);
registerLazySearchSource(blueprintsSearchSource);
registerSearchSource(toolsSearchSource);
registerSearchSource(commandsSearchSource);
registerLazySearchSource(systemsSearchSource);
