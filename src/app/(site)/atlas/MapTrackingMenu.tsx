'use client';

import { useSearchParams } from 'next/navigation';
import { LinkCharacterButton } from '@/components/composition/account/LinkCharacterButton';
import { convexClient } from '@/data/convex/client';
import { atlasSignInReturnHref } from '@/features/maps/map-navigation';
import { TrackingControls } from '@/mapper';

export function MapTrackingMenu() {
  const searchParams = useSearchParams();
  const mapId = searchParams.get('map');
  if (mapId === null || mapId.length === 0 || convexClient === null) return null;
  return (
    <TrackingControls
      mapId={mapId}
      reconnectAction={
        <LinkCharacterButton
          label="Reconnect"
          emphasis="reconnect"
          callbackURL={atlasSignInReturnHref(mapId)}
        />
      }
    />
  );
}
