import { sitesView, sitesDetailMode } from '@/lib/preferences';
import type { PageSettingsSpec } from '@/platform/page-settings/types';

export const sitesPageSettings: PageSettingsSpec = {
  route: '/sites',
  controls: [
    { key: sitesView.key, placement: 'section' },
    { key: sitesDetailMode.key, placement: 'section' },
  ],
};
