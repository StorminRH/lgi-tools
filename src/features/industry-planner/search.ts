import { lazySearchSource } from '@/platform/search';

export const blueprintsSearchSource = lazySearchSource({
  id: 'blueprints',
  name: 'Blueprints',
  limit: 6,
  load: () => import('./blueprints-source').then((m) => m.searchBlueprints),
});
