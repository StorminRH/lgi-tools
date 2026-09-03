import {
  atlasAutoLayout,
  atlasCameraFollow,
  atlasClickFocus,
} from '@/lib/preferences';
import type { PageSettingsSpec } from './types';

export const atlasPageSettings: PageSettingsSpec = {
  route: '/atlas',
  title: 'Map settings',
  controls: [
    { key: atlasAutoLayout.key, placement: 'section' },
    { key: atlasCameraFollow.key, placement: 'section' },
    { key: atlasClickFocus.key, placement: 'section' },
  ],
};
