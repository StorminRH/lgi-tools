import type { PageSettingsSpec } from '@/platform/page-settings/types';

export const jobsPageSettings = {
  route: '/industry/jobs',
  strip: { surfaceId: 'jobs' },
} satisfies PageSettingsSpec;
