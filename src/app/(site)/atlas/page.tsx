import { Suspense } from 'react';
import { atlasMapQueryPresent } from '@/features/maps/map-navigation';
import { buildPageMetadata } from '@/lib/page-metadata';
import { AtlasBound } from './AtlasBound';
import { AtlasLandingFallback } from './AtlasLandingFallback';

export const metadata = buildPageMetadata({
  title: 'Atlas',
  description:
    'Chart wormhole chains, paste scanner results, and share a live map with your corporation.',
  canonical: '/atlas',
});

async function AtlasFromParams({
  searchParams,
}: {
  searchParams: Promise<{ map?: string | string[] }>;
}) {
  const params = await searchParams;
  return <AtlasBound mapSelected={atlasMapQueryPresent(params.map)} />;
}

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
