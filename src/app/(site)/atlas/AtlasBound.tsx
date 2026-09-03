import { unstable_rethrow } from 'next/navigation';
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
} from '@/platform/auth/route-guards';
import type { Session } from '@/platform/auth/types';
import { AtlasCanvasFrame } from './AtlasCanvasFrame';

const EMPTY_MAP_CHROME: MapChromeData = {
  maps: [],
  deletedMaps: [],
  corporations: [],
  grantsByMapId: {},
};

async function loadScannerCatalogue(): Promise<readonly SiteSearchEntry[]> {
  try {
    return await getScannerSiteIndex();
  } catch (err) {
    unstable_rethrow(err);
    console.error('[map] scanner site catalogue unavailable; degrading', err);
  }
  try {
    return await getSiteSearchIndex();
  } catch (err) {
    unstable_rethrow(err);
    console.error('[map] lightweight site catalogue unavailable; empty seed', err);
  }
  return [];
}

async function loadMapChromeData(userId: string) {
  try {
    return {
      data: await listMapChromeData(userId),
      listingAvailable: true,
    } as const;
  } catch (err) {
    unstable_rethrow(err);
    console.error('[map] map listing unavailable; retry required', err);
    return { data: EMPTY_MAP_CHROME, listingAvailable: false } as const;
  }
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
}: {
  readonly mapSelected: boolean;
}) {
  await connection();

  let gate: SessionCheckResult | null = null;
  try {
    gate = await checkSession();
  } catch (err) {
    unstable_rethrow(err);
    console.error('[map] authorization check unavailable', err);
  }

  const session = atlasAccountSession(gate);
  const [siteIndex, chromeSnapshot] = await Promise.all([
    loadScannerCatalogue(),
    gate?.ok
      ? loadMapChromeData(gate.session.user.id)
      : Promise.resolve({
          data: EMPTY_MAP_CHROME,
          listingAvailable: gate !== null,
        } as const),
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
        listingAvailable={chromeSnapshot.listingAvailable}
      >
        {showCanvas ? <AtlasCanvasFrame session={session} /> : <MapCatalogue />}
      </MapCatalogueDataProvider>

    </SiteCatalogueProvider>

  );
}
