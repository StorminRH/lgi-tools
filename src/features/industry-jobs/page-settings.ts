// The /jobs page's contextual settings, declared for the settings-presentation
// registry (ACCOUNT.4). No menu controls yet — the spec exists to declare the
// per-surface character strip (D-7 opt-in) for the PERSONAL jobs panel only
// (the corp board is corporation-keyed — no per-character participation there).
// Data-only on purpose: this module reaches the root-layout client bundle via
// register-all → PageMenuProvider. `satisfies` keeps `strip` non-optional on
// the inferred type, so consumers read `jobsPageSettings.strip` unguarded.

import type { PageSettingsSpec } from '@/page-settings/types';

export const jobsPageSettings = {
  route: '/jobs',
  strip: { surfaceId: 'jobs' },
} satisfies PageSettingsSpec;
