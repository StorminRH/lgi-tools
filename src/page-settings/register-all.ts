// Page-settings wiring manifest. Lives in the unclassified src/page-settings/
// layer ABOVE the feature slices (the src/search/register-all.ts pattern): it
// PULLS each feature's exported page-settings spec and registers it. No feature
// imports a layer above itself — features import only the spec TYPE from
// @/page-settings/types. This manifest is the single cross-slice importer and the
// one consumer that keeps every spec reachable (no unused-exports).
//
// Imported for its side effect by the client PageMenuProvider, which fills the
// client registry before the slot resolves (the AppHeaderShell.tsx precedent).
// The list is also exported (the src/purge/register-all.ts precedent) so the
// anti-drift gate can audit every wired spec deterministically.

import { sitesPageSettings } from '@/features/wormhole-sites/page-settings';
import { registerPageSettings } from '@/page-settings';
import { accountPageSettings } from '@/page-settings/account';
import type { PageSettingsSpec } from '@/page-settings/types';

export const PAGE_SETTINGS_SPECS: readonly PageSettingsSpec[] = [
  sitesPageSettings,
  accountPageSettings,
];

for (const spec of PAGE_SETTINGS_SPECS) {
  registerPageSettings(spec);
}
