import { unstable_rethrow } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { MapChrome } from '@/components/composition/map/MapChrome';
import { listMapChromeData } from '@/composition/map-access';
import {
  getScannerSiteIndex,
  getSiteSearchIndex,
  type SiteSearchEntry,
} from '@/features/wormhole-sites/queries';
import { SiteCatalogueProvider } from '@/features/wormhole-sites/site-catalogue';
import { checkAdmin, type SessionCheckResult } from '@/platform/auth/route-guards';
import type { Session } from '@/platform/auth/types';
import { MapTrackingMenu } from './MapTrackingMenu';

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
    return await listMapChromeData(userId);
  } catch (err) {
    unstable_rethrow(err);
    console.error('[map] switcher data unavailable; empty seed', err);
    return { maps: [], corporations: [], grantsByMapId: {} };
  }
}

function MapDevelopmentWall() {
  return (
    <section
      data-map-development-wall
      className="flex h-full w-full items-center justify-center px-6 text-center"
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
 * Resolves the atlas's server-side administrator wall before rendering its canvas subtree.
 *
 * A thrown authorization check fails closed to the wall rather than escaping:
 * `error.tsx` covers a segment's children, not its own layout, so an escaping
 * throw here would reach Next.js's built-in error page instead of the map's
 * recovery surface. `unstable_rethrow` still lets framework control-flow
 * signals through, matching `loadSection`'s boundary.
 */
export async function MapAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  // Better Auth consults the current clock while resolving a session. Stop
  // prerendering before that guarded work; the parent Suspense boundary keeps
  // the development wall in the static shell while this runs per request.
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
  // Live-priced scanner catalogue preferred; failures must not wall the map.
  // AppHeader/sitemap keep calling getSiteSearchIndex directly on their own.
  const [siteIndex, chromeData] = await Promise.all([
    loadScannerCatalogue(),
    loadMapChromeData(gate.session.user.id),
  ]);

  return (
    <SiteCatalogueProvider siteIndex={siteIndex}>
      <MapChrome
        session={session}
        contextualSection={<MapTrackingMenu />}
        corporations={chromeData.corporations}
        maps={chromeData.maps}
        grantsByMapId={chromeData.grantsByMapId}
      />
      {children}
    </SiteCatalogueProvider>
  );
}

/**
 * Provides the full-dynamic-viewport frame and request-time authorization hole for map routes.
 * The Suspense fallback keeps a chrome-shaped shell (development wall) instant while
 * `checkAdmin()` resolves — never a blank viewport on soft navigation.
 */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <Suspense fallback={<MapDevelopmentWall />}>
        <MapAccessGate>{children}</MapAccessGate>
      </Suspense>
    </div>
  );
}
