'use client';

import { MapChrome } from '@/components/composition/map/MapChrome';
import type { Session } from '@/platform/auth/types';
import { MapCanvas } from '@/mapper';
import { MapTrackingMenu } from './MapTrackingMenu';

/**
 * Covers the site chrome with the full-viewport map surface. Document scroll
 * is locked by `body:has([data-map-canvas-frame])` so Base UI dialogs keep
 * owning overlay scroll-lock.
 */
export function AtlasCanvasFrame({ session }: { readonly session: Session | null }) {
  return (
    <div
      data-map-canvas-frame
      className="fixed inset-0 z-dropdown overflow-hidden"
    >
      <MapChrome
        session={session}
        contextualSection={<MapTrackingMenu />}
      />
      <MapCanvas />
    </div>
  );
}
