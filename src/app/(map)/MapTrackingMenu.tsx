'use client';

// App-owned junction between the map query string, the mapper's tracking
// surface, and the shared account menu. Keeping this bridge here prevents the
// account composition layer from importing mapper code.
import { useSearchParams } from 'next/navigation';
import { convexClient } from '@/data/convex/client';
import { TrackingControls } from '@/mapper';

/** Resolves the active map id and renders its contextual tracking settings when Convex is present. */
export function MapTrackingMenu() {
  const mapId = useSearchParams().get('map');
  if (mapId === null || mapId.length === 0 || convexClient === null) return null;
  return <TrackingControls mapId={mapId} />;
}
