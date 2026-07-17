// The /skills page's contextual settings, declared for the settings-presentation
// registry (ACCOUNT.4). No menu controls yet — the spec exists to declare the
// per-surface character strip (D-7 opt-in): `surfaceId` keys the dimmed-set
// preference, the page threads `strip` into SkillQueuePanel, and the panel
// mounts the strip + filters its render by it. Data-only on purpose: this module
// reaches the root-layout client bundle via register-all → PageMenuProvider.
// `satisfies` (not an annotation) keeps `strip` non-optional on the inferred
// type, so consumers read `skillsPageSettings.strip` without a null guard.

import type { PageSettingsSpec } from '@/page-settings/types';

/** Declarative skill-queue controls registered with the shared page-settings system. */
export const skillsPageSettings = {
  route: '/skills',
  strip: { surfaceId: 'skills' },
} satisfies PageSettingsSpec;
