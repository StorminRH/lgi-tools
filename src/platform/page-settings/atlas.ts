// The /atlas page's contextual settings, declared for the settings-presentation
// registry (ACCOUNT.4). Junction-owned like account settings: the mapper zone
// must not be imported by composition, and these controls are preference keys
// (not mapper UI). Structure only — PageMenuSection maps each key to Switch.

import {
  atlasAutoLayout,
  atlasCameraFollow,
  atlasClickFocus,
} from '@/lib/preferences';
import type { PageSettingsSpec } from './types';

/** Declarative atlas map-settings controls registered with the shared page-settings system. */
export const atlasPageSettings: PageSettingsSpec = {
  route: '/atlas',
  title: 'Map settings',
  controls: [
    {
      key: atlasAutoLayout.key,
      placement: 'section',
      // Turning auto layout back ON discards dragged positions — the one
      // destructive-ish consequence in this menu, disclosed on the row.
      description: 're-enabling restores the computed layout',
    },
    { key: atlasCameraFollow.key, placement: 'section' },
    { key: atlasClickFocus.key, placement: 'section' },
  ],
};
