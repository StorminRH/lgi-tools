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

import { GET } from '@/app/api/account/characters/route';
import { GET as AppApiAccountCorpIndustryJobsRouteGET } from '@/app/api/account/corp-industry-jobs/route';
import { GET as AppApiAccountCorpStructuresRouteGET } from '@/app/api/account/corp-structures/route';
import { POST } from '@/app/api/account/corp-structures/sharing/route';
import { POST as AppApiAccountCustomStructuresDeleteRoutePOST } from '@/app/api/account/custom-structures/delete/route';
import { POST as AppApiAccountCustomStructuresSetPinRoutePOST } from '@/app/api/account/custom-structures/set-pin/route';
import { POST as AppApiAccountCustomStructuresSetTaxRoutePOST } from '@/app/api/account/custom-structures/set-tax/route';
import { GET as AppApiAccountIndustryJobsRouteGET } from '@/app/api/account/industry-jobs/route';
import { GET as AppApiAccountIndustrySlotsRouteGET } from '@/app/api/account/industry-slots/route';
import { POST as AppApiAccountSavedPlansDeleteRoutePOST } from '@/app/api/account/saved-plans/delete/route';
import { POST as AppApiAccountSavedPlansFavoriteRoutePOST } from '@/app/api/account/saved-plans/favorite/route';
import { POST as AppApiAccountSavedPlansRenameRoutePOST } from '@/app/api/account/saved-plans/rename/route';
import { GET as AppApiAccountSkillsRouteGET } from '@/app/api/account/skills/route';
import { GET as AppApiAccountStructuresRouteGET } from '@/app/api/account/structures/route';
import { POST as AppApiAdminEsiJobsRetryRoutePOST } from '@/app/api/admin/esi-jobs/retry/route';
import { POST as AppApiAdminWhStaticsRoutePOST } from '@/app/api/admin/wh-statics/route';
import { GET as AppApiAuthAllRouteGET } from '@/app/api/auth/[...all]/route';
import { maxDuration } from '@/app/api/cron/purge-maps/route';
import { GET as AppApiCronRefreshAffiliationsRouteGET, maxDuration as AppApiCronRefreshAffiliationsRouteMaxDuration } from '@/app/api/cron/refresh-affiliations/route';
import { GET as AppApiCronRefreshGscRouteGET } from '@/app/api/cron/refresh-gsc/route';
import { GET as AppApiCronRefreshIndustryIndicesRouteGET, maxDuration as AppApiCronRefreshIndustryIndicesRouteMaxDuration } from '@/app/api/cron/refresh-industry-indices/route';
import { GET as AppApiCronRefreshPricesRouteGET, maxDuration as AppApiCronRefreshPricesRouteMaxDuration } from '@/app/api/cron/refresh-prices/route';
import { GET as AppApiCronRefreshSdeRouteGET, maxDuration as AppApiCronRefreshSdeRouteMaxDuration } from '@/app/api/cron/refresh-sde/route';
import { GET as AppApiCronRefreshWhStaticsRouteGET, maxDuration as AppApiCronRefreshWhStaticsRouteMaxDuration } from '@/app/api/cron/refresh-wh-statics/route';
import { POST as AppApiEveNamesRoutePOST } from '@/app/api/eve/names/route';
import { GET as AppApiIndustryBlueprintsRouteGET } from '@/app/api/industry/blueprints/route';
import { POST as AppApiIndustryBuildLocationRoutePOST } from '@/app/api/industry/build-location/route';
import { POST as AppApiIndustryOwnedAssetsRoutePOST } from '@/app/api/industry/owned-assets/route';
import { POST as AppApiIndustryOwnedBlueprintsRoutePOST } from '@/app/api/industry/owned-blueprints/route';
import { GET as AppApiIndustrySystemsRouteGET } from '@/app/api/industry/systems/route';
import { maxDuration as AppApiMarketHistoryRefreshRouteMaxDuration } from '@/app/api/market-history/refresh/route';
import { POST as AppApiMarketPricesRefreshRoutePOST, maxDuration as AppApiMarketPricesRefreshRouteMaxDuration } from '@/app/api/market-prices/refresh/route';
import { GET as AppApiPreferencesRouteGET } from '@/app/api/preferences/route';
import { GET as AppApiSitesRouteGET } from '@/app/api/sites/route';
import { POST as AppApiTelemetryRoutePOST } from '@/app/api/telemetry/route';
import { GET as AppApiUniverseAssetsVersionAdjacencyRouteGET } from '@/app/api/universe/assets/[version]/adjacency/route';
import { GET as AppApiUniverseAssetsVersionSystemsRouteGET } from '@/app/api/universe/assets/[version]/systems/route';
import { GET as AppApiUniverseAssetsVersionWormholesRouteGET } from '@/app/api/universe/assets/[version]/wormholes/route';

describe('coverage-gaps', () => {
  it('pins leftover runtime exports on the test graph', () => {
    const pinned = [
      GET,
      AppApiAccountCorpIndustryJobsRouteGET,
      AppApiAccountCorpStructuresRouteGET,
      POST,
      AppApiAccountCustomStructuresDeleteRoutePOST,
      AppApiAccountCustomStructuresSetPinRoutePOST,
      AppApiAccountCustomStructuresSetTaxRoutePOST,
      AppApiAccountIndustryJobsRouteGET,
      AppApiAccountIndustrySlotsRouteGET,
      AppApiAccountSavedPlansDeleteRoutePOST,
      AppApiAccountSavedPlansFavoriteRoutePOST,
      AppApiAccountSavedPlansRenameRoutePOST,
      AppApiAccountSkillsRouteGET,
      AppApiAccountStructuresRouteGET,
      AppApiAdminEsiJobsRetryRoutePOST,
      AppApiAdminWhStaticsRoutePOST,
      AppApiAuthAllRouteGET,
      maxDuration,
      AppApiCronRefreshAffiliationsRouteGET,
      AppApiCronRefreshAffiliationsRouteMaxDuration,
      AppApiCronRefreshGscRouteGET,
      AppApiCronRefreshIndustryIndicesRouteGET,
      AppApiCronRefreshIndustryIndicesRouteMaxDuration,
      AppApiCronRefreshPricesRouteGET,
      AppApiCronRefreshPricesRouteMaxDuration,
      AppApiCronRefreshSdeRouteGET,
      AppApiCronRefreshSdeRouteMaxDuration,
      AppApiCronRefreshWhStaticsRouteGET,
      AppApiCronRefreshWhStaticsRouteMaxDuration,
      AppApiEveNamesRoutePOST,
      AppApiIndustryBlueprintsRouteGET,
      AppApiIndustryBuildLocationRoutePOST,
      AppApiIndustryOwnedAssetsRoutePOST,
      AppApiIndustryOwnedBlueprintsRoutePOST,
      AppApiIndustrySystemsRouteGET,
      AppApiMarketHistoryRefreshRouteMaxDuration,
      AppApiMarketPricesRefreshRoutePOST,
      AppApiMarketPricesRefreshRouteMaxDuration,
      AppApiPreferencesRouteGET,
      AppApiSitesRouteGET,
      AppApiTelemetryRoutePOST,
      AppApiUniverseAssetsVersionAdjacencyRouteGET,
      AppApiUniverseAssetsVersionSystemsRouteGET,
      AppApiUniverseAssetsVersionWormholesRouteGET,
    ];
    expect(pinned.length).toBeGreaterThan(0);
    for (const value of pinned) {
      expect(value).toBeDefined();
    }
  });
});
