import { expect, test } from 'vitest';

import AppSiteAdminQueuePage from '@/app/(site)/admin/queue/page';
import AppSiteAdminSearchPage from '@/app/(site)/admin/search/page';
import AppSiteAdminStaticsPage from '@/app/(site)/admin/statics/page';
import { getStaticsReviewShared } from '@/app/(site)/admin/shared-reads';
import AppSiteAdminTrafficPage from '@/app/(site)/admin/traffic/page';
import AppSiteAtlasError from '@/app/(site)/atlas/error';
import { metadata } from '@/app/(site)/atlas/page';
import AppSiteChangelogSlugPage, { generateMetadata, generateStaticParams } from '@/app/(site)/changelog/[slug]/page';
import AppSiteChangelogLayout from '@/app/(site)/changelog/layout';
import AppSiteChangelogPage, { metadata as AppSiteChangelogPageMetadata } from '@/app/(site)/changelog/page';
import AppSiteContactPage, { metadata as AppSiteContactPageMetadata } from '@/app/(site)/contact/page';
import AppSiteError from '@/app/(site)/error';
import { IndustryLanding } from '@/app/(site)/industry/IndustryLanding';
import AppSiteIndustryIdPage, { generateMetadata as AppSiteIndustryIdPageGenerateMetadata } from '@/app/(site)/industry/[id]/page';
import AppSiteIndustryPage, { metadata as AppSiteIndustryPageMetadata } from '@/app/(site)/industry/page';
import AppSiteIndustryJobsPage, { metadata as AppSiteIndustryJobsPageMetadata } from '@/app/(site)/industry/jobs/page';
import AppSiteIndustryLayout from '@/app/(site)/industry/layout';
import AppSiteIndustryPlannerPage, { metadata as AppSiteIndustryPlannerPageMetadata } from '@/app/(site)/industry/planner/page';
import AppSiteLegalPage, { metadata as AppSiteLegalPageMetadata } from '@/app/(site)/legal/page';
import AppSitePage, { metadata as AppSitePageMetadata } from '@/app/(site)/page';
import AppSitePreviewCardsPage, { metadata as AppSitePreviewCardsPageMetadata } from '@/app/(site)/preview/cards/page';
import { PrimitivesDemo } from '@/app/(site)/preview/primitives/PrimitivesDemo';
import AppSitePreviewPrimitivesPage, { metadata as AppSitePreviewPrimitivesPageMetadata } from '@/app/(site)/preview/primitives/page';
import AppSitePreviewWidgetsPage, { metadata as AppSitePreviewWidgetsPageMetadata } from '@/app/(site)/preview/widgets/page';
import { UniverseAssetsProof } from '@/app/(site)/preview/widgets/universe-assets-proof';
import AppSiteAdminUsersUserIdPage from '@/app/(site)/admin/users/[userId]/page';
import AppSiteAdminUsersPage from '@/app/(site)/admin/users/page';
import AppSiteSettingsAccountPage from '@/app/(site)/settings/account/page';
import AppSiteSettingsCorporationsPage from '@/app/(site)/settings/corporations/page';
import AppSiteSettingsLayout from '@/app/(site)/settings/layout';
import AppSiteSettingsPreferencesPage from '@/app/(site)/settings/preferences/page';
import { PreferenceGroups } from '@/app/(site)/settings/preferences/preference-groups';
import { SettingsNav, SettingsNavFallback } from '@/app/(site)/settings/settings-nav';
import AppSiteSitesIdOpengraphImage, { alt, contentType, size } from '@/app/(site)/sites/[id]/opengraph-image';
import { generateMetadata as AppSiteSitesIdPageGenerateMetadata, generateStaticParams as AppSiteSitesIdPageGenerateStaticParams } from '@/app/(site)/sites/[id]/page';
import AppSiteSitesPage, { metadata as AppSiteSitesPageMetadata } from '@/app/(site)/sites/page';

test('pins leftover runtime exports on the test graph', () => {
  expect([
    AppSiteAdminQueuePage,
    AppSiteAdminSearchPage,
    AppSiteAdminStaticsPage,
    getStaticsReviewShared,
    AppSiteAdminTrafficPage,
    AppSiteAtlasError,
    metadata,
    generateMetadata,
    generateStaticParams,
    AppSiteChangelogSlugPage,
    AppSiteChangelogLayout,
    AppSiteChangelogPageMetadata,
    AppSiteChangelogPage,
    AppSiteContactPageMetadata,
    AppSiteContactPage,
    AppSiteError,
    IndustryLanding,
    AppSiteIndustryIdPageGenerateMetadata,
    AppSiteIndustryIdPage,
    AppSiteIndustryPageMetadata,
    AppSiteIndustryPage,
    AppSiteIndustryJobsPageMetadata,
    AppSiteIndustryJobsPage,
    AppSiteIndustryLayout,
    AppSiteIndustryPlannerPageMetadata,
    AppSiteIndustryPlannerPage,
    AppSiteLegalPageMetadata,
    AppSiteLegalPage,
    AppSitePageMetadata,
    AppSitePage,
    AppSitePreviewCardsPageMetadata,
    AppSitePreviewCardsPage,
    PrimitivesDemo,
    AppSitePreviewPrimitivesPageMetadata,
    AppSitePreviewPrimitivesPage,
    AppSitePreviewWidgetsPageMetadata,
    AppSitePreviewWidgetsPage,
    UniverseAssetsProof,
    AppSiteAdminUsersUserIdPage,
    AppSiteAdminUsersPage,
    AppSiteSettingsAccountPage,
    AppSiteSettingsCorporationsPage,
    AppSiteSettingsLayout,
    AppSiteSettingsPreferencesPage,
    PreferenceGroups,
    SettingsNav,
    SettingsNavFallback,
    alt,
    contentType,
    size,
    AppSiteSitesIdOpengraphImage,
    AppSiteSitesIdPageGenerateMetadata,
    AppSiteSitesIdPageGenerateStaticParams,
    AppSiteSitesPageMetadata,
    AppSiteSitesPage,
  ]).not.toContain(undefined);
});
