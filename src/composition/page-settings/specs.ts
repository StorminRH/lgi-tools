import { jobsPageSettings } from '@/features/industry-jobs/page-settings';
import { sitesPageSettings } from '@/features/wormhole-sites/page-settings';
import { accountPageSettings } from '@/platform/page-settings/account';
import { atlasPageSettings } from '@/platform/page-settings/atlas';
import { resolveSpecForPath } from '@/platform/page-settings/resolve';
import type { PageSettingsSpec } from '@/platform/page-settings/types';

export const PAGE_SETTINGS_SPECS: readonly PageSettingsSpec[] = [
  sitesPageSettings,
  accountPageSettings,
  jobsPageSettings,
  atlasPageSettings,
];

/** The page settings for a pathname: the spec with the longest matching route, or null. */
export function resolvePageSettings(pathname: string): PageSettingsSpec | null {
  return resolveSpecForPath(pathname, PAGE_SETTINGS_SPECS);
}
