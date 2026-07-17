// The Systems search source descriptor. Lazy (the blueprints idiom): the
// registry memoizes the dynamic import of ./systems-search so neither the
// matcher nor the ~8.6k-entry universe index rides the initial bundle — both
// arrive on a scoped consumer's first keystroke. Excluded from the DEFAULT
// scope: no system destination page exists yet, so only explicit scoped
// queries — searchAll(q, ctx, ['systems']) from the build-location pickers
// and the custom-structure pin control — ever reach it.

import type { LazySearchSource } from '@/search';

/**
 * Global-search source for systems search source; it owns matching and result mapping while the
 * app layer owns registration.
 */
export const systemsSearchSource: LazySearchSource = {
  id: 'systems',
  name: 'Systems',
  limit: 10,
  excludeFromDefaultScope: true,
  load: () => import('./systems-search').then((m) => m.systemsSource),
};
