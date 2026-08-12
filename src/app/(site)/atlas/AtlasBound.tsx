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
import { checkAdmin, type SessionCheckResult } from '@/platform/auth/route-guards';
import type { Session } from '@/platform/auth/types';
import { AtlasCanvasFrame } from './AtlasCanvasFrame';

/**
 * Loads the atlas scanner catalogue without taking down an authorized map.
 * Prefers the hourly priced index; falls back to the deploy-static catalogue,
 * then to an empty seed (site-row affordances stay off until the next success).
 */
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
    const data: MapChromeData = {
      maps: [],
      deletedMaps: [],
      corporations: [],
      grantsByMapId: {},
    };
    return { data, listingAvailable: false } as const;
  }
}

function MapDevelopmentWall() {
  return (
    <section
      data-map-development-wall
      className="flex min-h-[70vh] w-full items-center justify-center px-6 py-region text-center"
    >
      <div className="flex max-w-xl flex-col items-center gap-4">
        <div className="font-data text-label uppercase tracking-eyebrow text-isk">
          Atlas · under development
        </div>
        <h1 className="font-display text-display font-bold uppercase tracking-copy text-name">
          Mapping the unknown
        </h1>
        <p className="text-body leading-relaxed text-text">
          The living map is still being assembled behind the development wall.
          It will open once its navigation, collaboration, and safety checks are complete.
        </p>
      </div>
    </section>
  );
}

/**
 * Resolves the atlas administrator wall, then the site-framed catalogue or the
 * full-viewport canvas. The parent site layout already owns header and footer.
 *
 * A thrown authorization check fails closed to the wall rather than escaping:
 * `error.tsx` covers a segment's children, not its own layout, so an escaping
 * throw here would reach Next.js's built-in error page instead of the map's
 * recovery surface. `unstable_rethrow` still lets framework control-flow
 * signals through, matching `loadSection`'s boundary.
 */
export async function AtlasBound({
  mapSelected,
}: {
  readonly mapSelected: boolean;
}) {
  await connection();

  let gate: SessionCheckResult;
  try {
    gate = await checkAdmin();
  } catch (err) {
    unstable_rethrow(err);
    console.error('[map] authorization check unavailable', err);
    return <MapDevelopmentWall />;
  }
  if (!gate.ok) return <MapDevelopmentWall />;

  const session: Session | null =
    gate.session.characterId == null
      ? null
      : {
          characterId: gate.session.characterId,
          name: gate.session.name,
          portraitUrl: gate.session.portraitUrl,
          role: gate.session.role,
        };
  const [siteIndex, chromeSnapshot] = await Promise.all([
    loadScannerCatalogue(),
    loadMapChromeData(gate.session.user.id),
  ]);
  const chromeData = chromeSnapshot.data;

  return (
    <SiteCatalogueProvider siteIndex={siteIndex}>
      <MapCatalogueDataProvider
        corporations={chromeData.corporations}
        maps={chromeData.maps}
        deletedMaps={chromeData.deletedMaps}
        grantsByMapId={chromeData.grantsByMapId}
        listingAvailable={chromeSnapshot.listingAvailable}
      >
        {mapSelected ? <AtlasCanvasFrame session={session} /> : <MapCatalogue />}
      </MapCatalogueDataProvider>
    </SiteCatalogueProvider>
  );
}
