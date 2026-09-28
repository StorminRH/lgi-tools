import type { PageSettingsSpec } from './types';

export const accountPageSettings: PageSettingsSpec = {
  route: '/settings',
  controls: [{ kind: 'feature', id: 'corp-data-sharing', placement: 'inline' }],
};
