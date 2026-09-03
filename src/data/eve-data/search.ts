import type { LazySearchSource } from '@/platform/search';

export const systemsSearchSource: LazySearchSource = {
  id: 'systems',
  name: 'Systems',
  limit: 10,
  excludeFromDefaultScope: true,
  load: () => import('./systems-search').then((m) => m.systemsSource),
};
