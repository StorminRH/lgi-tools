// Page-settings wiring manifest. Composition pulls each feature's exported
// page-settings spec into the platform registry. Features import only the
// platform-owned spec contract.
//
// Imported for its side effect by the client PageMenuProvider, which fills the
// client registry before the slot resolves (the AppHeaderShell.tsx precedent).
// The list is also exported (the composition/purge registry precedent) so the
// anti-drift gate can audit every wired spec deterministically.

import { jobsPageSettings } from '@/features/industry-jobs/page-settings';
import { skillsPageSettings } from '@/features/skill-queue/page-settings';
import { sitesPageSettings } from '@/features/wormhole-sites/page-settings';
import { registerPageSettings } from '@/platform/page-settings';
import { accountPageSettings } from '@/platform/page-settings/account';
import type { PageSettingsSpec } from '@/platform/page-settings/types';

/** Complete ordered page-settings specification set registered at application startup. */
export const PAGE_SETTINGS_SPECS: readonly PageSettingsSpec[] = [
  sitesPageSettings,
  accountPageSettings,
  skillsPageSettings,
  jobsPageSettings,
];

for (const spec of PAGE_SETTINGS_SPECS) {
  registerPageSettings(spec);
}
