// The Blueprints search source descriptor. Lazy: the registry memoizes the
// dynamic import of ./blueprints-source so its matcher + fetched index only load
// on the user's first matching keystroke, never in the initial bundle. The
// wiring manifest (src/search/register-all) passes this to
// registerLazySearchSource.

import type { LazySearchSource } from '@/search';

export const blueprintsSearchSource: LazySearchSource = {
  id: 'blueprints',
  name: 'Blueprints',
  limit: 6,
  load: () => import('./blueprints-source').then((m) => m.blueprintsSource),
};
