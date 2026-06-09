import { cache } from 'react';
import { getLastSyncedAt } from '@/data/gsc/queries';

// Both the status strip and the search-performance card show the GSC
// last-synced timestamp, from separate <Suspense> boundaries on the same
// page. React cache() dedupes that to one DB round-trip per request — the
// route-level pattern from the sites page's loadSites. The slice query stays
// uncached; request-scoped memoization composes here, at the route layer.
export const getLastSyncedAtShared = cache(getLastSyncedAt);
