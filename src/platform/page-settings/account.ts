import type { PageSettingsSpec } from './types';

export const accountPageSettings: PageSettingsSpec = {
  route: '/settings',
  controls: [{ kind: 'feature', id: 'corp-structure-sharing', placement: 'inline' }],
};
