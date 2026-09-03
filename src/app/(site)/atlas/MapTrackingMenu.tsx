'use client';

import { useSearchParams } from 'next/navigation';
import { convexClient } from '@/data/convex/client';
import { TrackingControls } from '@/mapper';

export function MapTrackingMenu() {
  const mapId = useSearchParams().get('map');
  if (mapId === null || mapId.length === 0 || convexClient === null) return null;
  return <TrackingControls mapId={mapId} />;
}
