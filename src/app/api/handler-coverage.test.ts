import { expect, test } from 'vitest';

import { GET } from '@/app/api/account/characters/route';
import { GET as AppApiAccountCorpIndustryJobsRouteGET } from '@/app/api/account/corp-industry-jobs/route';
import { GET as AppApiAccountCorpStructuresRouteGET } from '@/app/api/account/corp-structures/route';
import { POST as AppApiAccountCustomStructuresDeleteRoutePOST } from '@/app/api/account/custom-structures/delete/route';
import { GET as AppApiAccountBoardRouteGET } from '@/app/api/account/board/route';
import { GET as AppApiAccountIndustryJobsRouteGET } from '@/app/api/account/industry-jobs/route';
import { GET as AppApiAccountIndustrySlotsRouteGET } from '@/app/api/account/industry-slots/route';
import { POST as AppApiAccountSavedPlansDeleteRoutePOST } from '@/app/api/account/saved-plans/delete/route';
import { POST as AppApiAccountSavedPlansFavoriteRoutePOST } from '@/app/api/account/saved-plans/favorite/route';
import { POST as AppApiAccountSavedPlansRenameRoutePOST } from '@/app/api/account/saved-plans/rename/route';
import { GET as AppApiAccountStructuresRouteGET } from '@/app/api/account/structures/route';
import { maxDuration } from '@/app/api/cron/purge-maps/route';
import { maxDuration as AppApiCronDailyBatchRouteMaxDuration } from '@/app/api/cron/daily-batch/route';
import { maxDuration as AppApiCronRefreshIndustryIndicesRouteMaxDuration } from '@/app/api/cron/refresh-industry-indices/route';
import { maxDuration as AppApiCronRefreshPricesRouteMaxDuration } from '@/app/api/cron/refresh-prices/route';
import { maxDuration as AppApiCronRefreshSdeRouteMaxDuration } from '@/app/api/cron/refresh-sde/route';
import { maxDuration as AppApiCronRefreshWhStaticsRouteMaxDuration } from '@/app/api/cron/refresh-wh-statics/route';
import { POST as AppApiEveNamesRoutePOST } from '@/app/api/eve/names/route';
import { GET as AppApiIndustryBlueprintsRouteGET } from '@/app/api/industry/blueprints/route';
import { POST as AppApiIndustryBuildLocationRoutePOST } from '@/app/api/industry/build-location/route';
import { POST as AppApiIndustryOwnedAssetsRoutePOST } from '@/app/api/industry/owned-assets/route';
import { POST as AppApiIndustryOwnedBlueprintsRoutePOST } from '@/app/api/industry/owned-blueprints/route';
import { GET as AppApiIndustrySystemsRouteGET } from '@/app/api/industry/systems/route';
import { maxDuration as AppApiMarketHistoryRefreshRouteMaxDuration } from '@/app/api/market-history/refresh/route';
import { maxDuration as AppApiMarketPricesRefreshRouteMaxDuration } from '@/app/api/market-prices/refresh/route';
import { GET as AppApiPreferencesRouteGET } from '@/app/api/preferences/route';
import { GET as AppApiSitesRouteGET } from '@/app/api/sites/route';
import { GET as AppApiUniverseAssetsVersionAdjacencyRouteGET } from '@/app/api/universe/assets/[version]/adjacency/route';
import { GET as AppApiUniverseAssetsVersionSystemsRouteGET } from '@/app/api/universe/assets/[version]/systems/route';
import { GET as AppApiUniverseAssetsVersionWormholesRouteGET } from '@/app/api/universe/assets/[version]/wormholes/route';

test('pins leftover runtime exports on the test graph', () => {
  expect([
    GET,
    AppApiAccountCorpIndustryJobsRouteGET,
    AppApiAccountCorpStructuresRouteGET,
    AppApiAccountCustomStructuresDeleteRoutePOST,
    AppApiAccountBoardRouteGET,
    AppApiAccountIndustryJobsRouteGET,
    AppApiAccountIndustrySlotsRouteGET,
    AppApiAccountSavedPlansDeleteRoutePOST,
    AppApiAccountSavedPlansFavoriteRoutePOST,
    AppApiAccountSavedPlansRenameRoutePOST,
    AppApiAccountStructuresRouteGET,
    maxDuration,
    AppApiCronDailyBatchRouteMaxDuration,
    AppApiCronRefreshIndustryIndicesRouteMaxDuration,
    AppApiCronRefreshPricesRouteMaxDuration,
    AppApiCronRefreshSdeRouteMaxDuration,
    AppApiCronRefreshWhStaticsRouteMaxDuration,
    AppApiEveNamesRoutePOST,
    AppApiIndustryBlueprintsRouteGET,
    AppApiIndustryBuildLocationRoutePOST,
    AppApiIndustryOwnedAssetsRoutePOST,
    AppApiIndustryOwnedBlueprintsRoutePOST,
    AppApiIndustrySystemsRouteGET,
    AppApiMarketHistoryRefreshRouteMaxDuration,
    AppApiMarketPricesRefreshRouteMaxDuration,
    AppApiPreferencesRouteGET,
    AppApiSitesRouteGET,
    AppApiUniverseAssetsVersionAdjacencyRouteGET,
    AppApiUniverseAssetsVersionSystemsRouteGET,
    AppApiUniverseAssetsVersionWormholesRouteGET,
  ]).not.toContain(undefined);
});
