import { atlasCameraFollow, atlasClickFocus } from '@/lib/preferences';
import type { PageSettingsSpec } from './types';

export const atlasPageSettings: PageSettingsSpec = {
  route: '/atlas',
  title: 'Map settings',
  controls: [
    { key: atlasCameraFollow.key, placement: 'section' },
    { key: atlasClickFocus.key, placement: 'section' },
  ],
};
