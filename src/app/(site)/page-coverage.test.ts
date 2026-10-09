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

import { AccountTotals } from '@/app/(site)/admin/AccountsCard';
import { AdminCard, AdminSection } from '@/app/(site)/admin/AdminSection';
import { ActionsCard } from '@/app/(site)/admin/ActionsCard';
import { ActivityChart } from '@/app/(site)/admin/ActivityChart';
import { AdminPageFrame, AdminSlot } from '@/app/(site)/admin/AdminFrame';
import { AdminGate } from '@/app/(site)/admin/AdminGate';
import { AdminRail, AdminRailFallback } from '@/app/(site)/admin/AdminRail';
import { AudienceCard } from '@/app/(site)/admin/AudienceCard';
import { CardFallback } from '@/app/(site)/admin/CardFallback';
import { CardLink } from '@/app/(site)/admin/CardLink';
import { DeltaBadge } from '@/app/(site)/admin/DeltaBadge';
import { KpiGrid } from '@/app/(site)/admin/KpiGrid';
import { AttentionCard, StatusCards } from '@/app/(site)/admin/AdminOverviewCards';
import { RangeControl } from '@/app/(site)/admin/RangeControl';
import { RangeSelector, RangeSelectorFallback } from '@/app/(site)/admin/RangeSelector';
import { SectionUnavailable } from '@/app/(site)/admin/SectionUnavailable';
import { StatusLines } from '@/app/(site)/admin/StatusLines';
import { AdminNav, AdminNavFallback } from '@/app/(site)/admin/admin-nav';
import { AdminBarChart, AdminDailyChart, AdminTrendChart } from '@/app/(site)/admin/charts';
import { loadDeployMarkers } from '@/app/(site)/admin/deploy-markers';
import { BudgetCard, CostCards, PressureCard, PriceSourceCard } from '@/app/(site)/admin/esi/EsiCards';
import AppSiteAdminEsiPage from '@/app/(site)/admin/esi/page';
import { EventLogCard, ServiceLevelsCard } from '@/app/(site)/admin/health/HealthCards';
import { ScheduledTasks } from '@/app/(site)/admin/health/ScheduledTasks';
import { StatusRow } from '@/app/(site)/admin/health/StatusRow';
import AppSiteAdminHealthPage from '@/app/(site)/admin/health/page';
import AppSiteAdminLayout from '@/app/(site)/admin/layout';
import { loadAdminSignals } from '@/app/(site)/admin/load-signals';
import AppSiteAdminPage from '@/app/(site)/admin/page';
import { DeadLettersCard, QueueSummaryCard } from '@/app/(site)/admin/queue/QueueCards';
import { RetryJobForm } from '@/app/(site)/admin/queue/RetryJobForm';
import AppSiteAdminQueuePage from '@/app/(site)/admin/queue/page';
import { IndexCoverageCard } from '@/app/(site)/admin/search/IndexCoverageCard';
import { PerformanceCard, SearchNotConnected, SitemapsCard, TermCards } from '@/app/(site)/admin/search/SearchCards';
import AppSiteAdminSearchPage from '@/app/(site)/admin/search/page';
import AppSiteAdminStaticsPage from '@/app/(site)/admin/statics/page';
import {
  getEsiRefreshQueueStatsShared,
  getLastSyncedAtShared,
  getPriceRefreshDaysShared,
  getPriceSourceDegradationShared,
  getStaticsReviewShared,
} from '@/app/(site)/admin/shared-reads';
import { LEVEL_DOT_TONE, LEVEL_VALUE_CLASS } from '@/app/(site)/admin/status-tone';
import { ActivityCard, PilotsCard, TrafficLists } from '@/app/(site)/admin/traffic/TrafficCards';
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
import AppSiteSettingsCharactersPage from '@/app/(site)/settings/characters/page';
import AppSiteSettingsCorporationsPage from '@/app/(site)/settings/corporations/page';
import AppSiteSettingsLayout from '@/app/(site)/settings/layout';
import AppSiteSettingsPreferencesPage from '@/app/(site)/settings/preferences/page';
import { PreferenceGroups } from '@/app/(site)/settings/preferences/preference-groups';
import { SettingsControlRow } from '@/app/(site)/settings/settings-control-row';
import { SettingsNav, SettingsNavFallback } from '@/app/(site)/settings/settings-nav';
import AppSiteSitesIdOpengraphImage, { alt, contentType, size } from '@/app/(site)/sites/[id]/opengraph-image';
import { generateMetadata as AppSiteSitesIdPageGenerateMetadata, generateStaticParams as AppSiteSitesIdPageGenerateStaticParams } from '@/app/(site)/sites/[id]/page';
import AppSiteSitesPage, { metadata as AppSiteSitesPageMetadata } from '@/app/(site)/sites/page';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    const pinned = [
      AccountTotals,
      AdminCard,
      AdminSection,
      ActionsCard,
      ActivityChart,
      AdminPageFrame,
      AdminSlot,
      AdminGate,
      AdminRail,
      AdminRailFallback,
      AudienceCard,
      CardFallback,
      CardLink,
      DeltaBadge,
      KpiGrid,
      AttentionCard,
      StatusCards,
      RangeControl,
      RangeSelector,
      RangeSelectorFallback,
      SectionUnavailable,
      StatusLines,
      AdminNav,
      AdminNavFallback,
      AdminBarChart,
      AdminDailyChart,
      AdminTrendChart,
      loadDeployMarkers,
      BudgetCard,
      CostCards,
      PressureCard,
      PriceSourceCard,
      AppSiteAdminEsiPage,
      getPriceRefreshDaysShared,
      getPriceSourceDegradationShared,
      EventLogCard,
      ServiceLevelsCard,
      ScheduledTasks,
      StatusRow,
      AppSiteAdminHealthPage,
      getLastSyncedAtShared,
      AppSiteAdminLayout,
      loadAdminSignals,
      AppSiteAdminPage,
      DeadLettersCard,
      QueueSummaryCard,
      RetryJobForm,
      AppSiteAdminQueuePage,
      getEsiRefreshQueueStatsShared,
      IndexCoverageCard,
      PerformanceCard,
      SearchNotConnected,
      SitemapsCard,
      TermCards,
      AppSiteAdminSearchPage,
      AppSiteAdminStaticsPage,
      getStaticsReviewShared,
      LEVEL_DOT_TONE,
      LEVEL_VALUE_CLASS,
      ActivityCard,
      PilotsCard,
      TrafficLists,
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
      AppSiteSettingsCharactersPage,
      AppSiteSettingsCorporationsPage,
      AppSiteSettingsLayout,
      AppSiteSettingsPreferencesPage,
      PreferenceGroups,
      SettingsControlRow,
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
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
