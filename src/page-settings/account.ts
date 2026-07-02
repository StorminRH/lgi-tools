// The account settings page's spec (ACCOUNT.6). Junction-owned, not
// feature-owned: /settings aggregates account-wide controls from MANY slices
// (referenced by feature-control id or preference key — pure data, no feature
// import), and the engine keeps only the FIRST spec registered per route, so a
// second slice exporting its own '/settings' spec would silently be dead (the
// anti-drift test pins route uniqueness). The /settings page itself renders
// this spec's 'inline' controls through resolvePageControls — adding an
// account-wide setting is one ref here (D-8).

import type { PageSettingsSpec } from './types';

export const accountPageSettings: PageSettingsSpec = {
  route: '/settings',
  controls: [{ kind: 'feature', id: 'corp-structure-sharing', placement: 'inline' }],
};
