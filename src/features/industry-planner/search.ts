// Registers the Blueprints search source. Lazy: the registry memoizes the
// dynamic import of ./blueprints-source so its matcher + fetched index only load
// on the user's first matching keystroke, never in the initial bundle. This is
// the first consumer of registerLazySearchSource (added in 3.0.1).

import { registerLazySearchSource } from '@/data/search';

registerLazySearchSource({
  name: 'Blueprints',
  limit: 6,
  load: () => import('./blueprints-source').then((m) => m.blueprintsSource),
});
