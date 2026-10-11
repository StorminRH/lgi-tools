import { connection } from 'next/server';
import {
  listMapChromeData,
  type MapChromeData,
} from '@/composition/map-access';
import { MapCatalogue } from '@/features/maps/MapCatalogue';
import { MapCatalogueDataProvider } from '@/features/maps/map-catalogue-data';
import {
  getScannerSiteIndex,
  getSiteSearchIndex,
  type SiteSearchEntry,
} from '@/features/wormhole-sites/queries';
import { SiteCatalogueProvider } from '@/features/wormhole-sites/site-catalogue';
import {
  checkSession,
  type SessionCheckResult,
} from '@/composition/route-guards';
import type { Session } from '@/platform/auth/types';
import { readOr } from '../read-or';
import { AtlasCanvasFrame } from './AtlasCanvasFrame';
import { AtlasGuestLanding } from './AtlasGuestLanding';
import { AtlasReturnRefresh } from './AtlasReturnRefresh';

const EMPTY_MAP_CHROME: MapChromeData = {
  maps: [],
  deletedMaps: [],
  corporations: [],
  grantsByMapId: {},
  blocksByMapId: {},
};

const UNAVAILABLE_CHROME = { data: EMPTY_MAP_CHROME, listingAvailable: false } as const;

async function loadScannerCatalogue(): Promise<readonly SiteSearchEntry[]> {
  return (
    (await readOr('[map] scanner site catalogue unavailable; degrading', getScannerSiteIndex, null)) ??
    readOr('[map] lightweight site catalogue unavailable; empty seed', getSiteSearchIndex, [])
  );
}

function loadMapChromeData(userId: string) {
  return readOr(
    '[map] map listing unavailable; retry required',
    async () => ({ data: await listMapChromeData(userId), listingAvailable: true }) as const,
    UNAVAILABLE_CHROME,
  );
}

function atlasAccountSession(gate: SessionCheckResult | null): Session | null {
  if (!gate?.ok || gate.session.characterId == null) return null;
  return {
    characterId: gate.session.characterId,
    name: gate.session.name,
    portraitUrl: gate.session.portraitUrl,
    role: gate.session.role,
  };
}

export async function AtlasBound({
  mapSelected,
  returnHref,
}: {
  readonly mapSelected: boolean;
  readonly returnHref: string;
}) {
  await connection();

  const gate = await readOr('[map] authorization check unavailable', checkSession, null);

  if (gate?.ok === false) return <AtlasGuestLanding returnHref={returnHref} />;

  const session = atlasAccountSession(gate);
  const [siteIndex, chromeSnapshot] = await Promise.all([
    loadScannerCatalogue(),
    gate === null ? Promise.resolve(UNAVAILABLE_CHROME) : loadMapChromeData(gate.session.user.id),
  ]);
  const chromeData = chromeSnapshot.data;
  const showCanvas = mapSelected && gate?.ok === true;

  return (
    <SiteCatalogueProvider siteIndex={siteIndex}>
      <MapCatalogueDataProvider
        corporations={chromeData.corporations}
        maps={chromeData.maps}
        deletedMaps={chromeData.deletedMaps}
        grantsByMapId={chromeData.grantsByMapId}
        blocksByMapId={chromeData.blocksByMapId}
        listingAvailable={chromeSnapshot.listingAvailable}
      >
        {gate?.ok === true ? <AtlasReturnRefresh /> : null}
        {showCanvas ? <AtlasCanvasFrame session={session} /> : <MapCatalogue />}
      </MapCatalogueDataProvider>
    </SiteCatalogueProvider>
  );
}
