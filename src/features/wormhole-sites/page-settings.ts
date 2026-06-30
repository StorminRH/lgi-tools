// The /sites page's contextual settings, declared for the settings-presentation
// registry (ACCOUNT.4). It references EXISTING value-registry preferences BY KEY
// — the menu never invents a setting; lib/preferences.ts stays the one value
// registry. Structure only: no control is rendered here (ACCOUNT.6 maps a key to
// its control). Per D-7, /sites declares no character strip (it is pure settings).

import { sitesView, sitesDetailMode } from '@/lib/preferences';
import type { PageSettingsSpec } from '@/page-settings/types';

export const sitesPageSettings: PageSettingsSpec = {
  route: '/sites',
  controls: [
    { key: sitesView.key, placement: 'section' },
    { key: sitesDetailMode.key, placement: 'section' },
  ],
};
