import type { Metadata } from 'next';
import { Suspense } from 'react';
import { atlasMapQueryPresent } from '@/features/maps/map-navigation';
import { AtlasBound } from './AtlasBound';
import { AtlasLandingFallback } from './AtlasLandingFallback';

/**
 * The administrator wall intentionally replaces this page for unauthorized
 * requests, so Next cannot validate the leaf in every staged render. Request-
 * time session work is separately bounded by `AtlasBound`.
 */
export const instant = false;

/** Static search and crawler metadata for the development-walled atlas route. */
export const metadata: Metadata = {
  title: 'Atlas — LGI.tools',
  robots: { index: false },
};

async function AtlasFromParams({
  searchParams,
}: {
  searchParams: Promise<{ map?: string | string[] }>;
}) {
  const params = await searchParams;
  return <AtlasBound mapSelected={atlasMapQueryPresent(params.map)} />;
}

/**
 * Renders Atlas inside the site frame. The landing catalogue streams through
 * the same PageHead shell as Industry and Sites; a selected map covers that
 * chrome with the full-viewport canvas.
 */
export default function AtlasPage({
  searchParams,
}: {
  searchParams: Promise<{ map?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<AtlasLandingFallback />}>
      <AtlasFromParams searchParams={searchParams} />
    </Suspense>
  );
}
