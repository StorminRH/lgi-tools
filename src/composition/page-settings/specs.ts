import { jobsPageSettings } from '@/features/industry-jobs/page-settings';
import { skillsPageSettings } from '@/features/skill-queue/page-settings';
import { sitesPageSettings } from '@/features/wormhole-sites/page-settings';
import { accountPageSettings } from '@/platform/page-settings/account';
import { atlasPageSettings } from '@/platform/page-settings/atlas';
import type { PageSettingsSpec } from '@/platform/page-settings/types';

export const PAGE_SETTINGS_SPECS: readonly PageSettingsSpec[] = [
  sitesPageSettings,
  accountPageSettings,
  skillsPageSettings,
  jobsPageSettings,
  atlasPageSettings,
];
