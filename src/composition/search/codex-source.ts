import type { LazySearchSource } from '@/platform/search';

export const codexSearchSource: LazySearchSource = {
  id: 'codex',
  name: 'Codex',
  limit: 6,
  load: () => import('./codex-index-source').then((m) => m.codexIndexSource),
};
