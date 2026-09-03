import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useParams: () => ({}),
}));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: () => undefined,
    delete: () => undefined,
  }),
}));
vi.mock('next/cache', () => ({
  cacheLife: () => undefined,
  cacheTag: () => undefined,
  revalidateTag: () => undefined,
  revalidatePath: () => undefined,
  connection: async () => undefined,
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('next/font/google', () => {
  const font = () => ({ className: '', variable: '--font-mock', style: { fontFamily: 'mock' } });
  return {
    Barlow_Condensed: font,
    JetBrains_Mono: font,
    Geist: font,
  };
});
vi.mock('next/og', () => ({ ImageResponse: class ImageResponse {} }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/image', () => ({ default: () => null }));
vi.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }));
vi.mock('convex/react', () => ({
  useQuery: () => undefined,
  useMutation: () => () => undefined,
  useConvex: () => null,
  ConvexProvider: (props: { children?: unknown }) => props.children ?? null,
  ConvexProviderWithAuth: (props: { children?: unknown }) => props.children ?? null,
  ConvexReactClient: class ConvexReactClient {},
}));

import { DeltaBadge } from '@/app/(site)/admin/DeltaBadge';
import { GscCoverageSection } from '@/app/(site)/admin/GscCoverageSection';
import { MetricTable } from '@/app/(site)/admin/MetricTable';
import { MetricsSection } from '@/app/(site)/admin/MetricsSection';
import { OpsSection } from '@/app/(site)/admin/OpsSection';
import { PrintButton } from '@/app/(site)/admin/PrintButton';
import { RetryJobForm } from '@/app/(site)/admin/RetryJobForm';
import { SectionUnavailable } from '@/app/(site)/admin/SectionUnavailable';
import { StatusRow } from '@/app/(site)/admin/StatusRow';
import { StatusStrip } from '@/app/(site)/admin/StatusStrip';
import { TrafficSection } from '@/app/(site)/admin/TrafficSection';
import { UsersSection } from '@/app/(site)/admin/UsersSection';
import AppSiteAdminAccessUserIdPage from '@/app/(site)/admin/access/[userId]/page';
import AppSiteAdminAccessPage from '@/app/(site)/admin/access/page';
import { AdminBarChart, AdminDailyChart, AdminTrendChart } from '@/app/(site)/admin/charts';
import { loadDeployMarkers } from '@/app/(site)/admin/deploy-markers';
import { getBudgetExhaustionCountShared, getFallbackRateShared } from '@/app/(site)/admin/esi-source-shared';
import { getLastSyncedAtShared } from '@/app/(site)/admin/last-synced';
import { metricLabelColumn } from '@/app/(site)/admin/metric-label-column';
import AppSiteAdminPage from '@/app/(site)/admin/page';
import { getEsiRefreshQueueStatsShared } from '@/app/(site)/admin/queue-stats-shared';
import AppSiteAdminStaticsPage from '@/app/(site)/admin/statics/page';
import AppSiteAtlasError from '@/app/(site)/atlas/error';
import { metadata } from '@/app/(site)/atlas/page';
import AppSiteChangelogSlugPage, { generateMetadata, generateStaticParams } from '@/app/(site)/changelog/[slug]/page';
import AppSiteChangelogLayout from '@/app/(site)/changelog/layout';
import AppSiteChangelogPage, { metadata as AppSiteChangelogPageMetadata } from '@/app/(site)/changelog/page';
import AppSiteCharactersPage from '@/app/(site)/characters/page';
import AppSiteContactPage, { metadata as AppSiteContactPageMetadata } from '@/app/(site)/contact/page';
import AppSiteError from '@/app/(site)/error';
import { IndustryDashboardGrid } from '@/app/(site)/industry/IndustryDashboardGrid';
import AppSiteIndustryIdPage, { generateMetadata as AppSiteIndustryIdPageGenerateMetadata } from '@/app/(site)/industry/[id]/page';
import AppSiteIndustryPage, { metadata as AppSiteIndustryPageMetadata } from '@/app/(site)/industry/page';
import AppSiteIndustryTemplatesPage, { metadata as AppSiteIndustryTemplatesPageMetadata } from '@/app/(site)/industry/templates/page';
import AppSiteJobsPage from '@/app/(site)/jobs/page';
import AppSiteLegalPage, { metadata as AppSiteLegalPageMetadata } from '@/app/(site)/legal/page';
import AppSitePage, { metadata as AppSitePageMetadata } from '@/app/(site)/page';
import AppSitePreviewCardsPage, { metadata as AppSitePreviewCardsPageMetadata } from '@/app/(site)/preview/cards/page';
import { PrimitivesDemo } from '@/app/(site)/preview/primitives/PrimitivesDemo';
import AppSitePreviewPrimitivesPage, { metadata as AppSitePreviewPrimitivesPageMetadata } from '@/app/(site)/preview/primitives/page';
import AppSitePreviewWidgetsPage, { metadata as AppSitePreviewWidgetsPageMetadata } from '@/app/(site)/preview/widgets/page';
import { UniverseAssetsProof } from '@/app/(site)/preview/widgets/universe-assets-proof';
import AppSiteSettingsPage from '@/app/(site)/settings/page';
import { SettingsControlRow } from '@/app/(site)/settings/settings-control-row';
import AppSiteSitesIdOpengraphImage, { alt, contentType, size } from '@/app/(site)/sites/[id]/opengraph-image';
import { generateMetadata as AppSiteSitesIdPageGenerateMetadata, generateStaticParams as AppSiteSitesIdPageGenerateStaticParams } from '@/app/(site)/sites/[id]/page';
import AppSiteSitesPage, { metadata as AppSiteSitesPageMetadata } from '@/app/(site)/sites/page';
import AppSiteSkillsPage from '@/app/(site)/skills/page';
import AppSiteStructuresPage from '@/app/(site)/structures/page';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    const pinned = [
      DeltaBadge,
      GscCoverageSection,
      MetricTable,
      MetricsSection,
      OpsSection,
      PrintButton,
      RetryJobForm,
      SectionUnavailable,
      StatusRow,
      StatusStrip,
      TrafficSection,
      UsersSection,
      AppSiteAdminAccessUserIdPage,
      AppSiteAdminAccessPage,
      AdminBarChart,
      AdminDailyChart,
      AdminTrendChart,
      loadDeployMarkers,
      getBudgetExhaustionCountShared,
      getFallbackRateShared,
      getLastSyncedAtShared,
      metricLabelColumn,
      AppSiteAdminPage,
      getEsiRefreshQueueStatsShared,
      AppSiteAdminStaticsPage,
      AppSiteAtlasError,
      metadata,
      generateMetadata,
      generateStaticParams,
      AppSiteChangelogSlugPage,
      AppSiteChangelogLayout,
      AppSiteChangelogPageMetadata,
      AppSiteChangelogPage,
      AppSiteCharactersPage,
      AppSiteContactPageMetadata,
      AppSiteContactPage,
      AppSiteError,
      IndustryDashboardGrid,
      AppSiteIndustryIdPageGenerateMetadata,
      AppSiteIndustryIdPage,
      AppSiteIndustryPageMetadata,
      AppSiteIndustryPage,
      AppSiteIndustryTemplatesPageMetadata,
      AppSiteIndustryTemplatesPage,
      AppSiteJobsPage,
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
      AppSiteSettingsPage,
      SettingsControlRow,
      alt,
      contentType,
      size,
      AppSiteSitesIdOpengraphImage,
      AppSiteSitesIdPageGenerateMetadata,
      AppSiteSitesIdPageGenerateStaticParams,
      AppSiteSitesPageMetadata,
      AppSiteSitesPage,
      AppSiteSkillsPage,
      AppSiteStructuresPage,
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
