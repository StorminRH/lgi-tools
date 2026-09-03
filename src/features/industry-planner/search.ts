import type { LazySearchSource } from '@/platform/search';

export const blueprintsSearchSource: LazySearchSource = {
  id: 'blueprints',
  name: 'Blueprints',
  limit: 6,
  load: () => import('./blueprints-source').then((m) => m.blueprintsSource),
};
