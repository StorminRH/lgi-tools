import type { PageSettingsSpec } from '@/platform/page-settings/types';

export const jobsPageSettings = {
  route: '/jobs',
  strip: { surfaceId: 'jobs' },
} satisfies PageSettingsSpec;
