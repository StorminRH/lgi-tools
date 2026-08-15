'use client';

import { useRef, type ReactNode } from 'react';
import { AccountMenu } from '@/components/composition/account/AccountMenu';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import { useMapCatalogueData } from '@/features/maps/map-catalogue-data';
import { MapSwitcher } from '@/features/maps/MapSwitcher';
import type { Session } from '@/platform/auth/types';
import { MapMenu } from './MapMenu';

// Side-effect import: registers every search source on the CLIENT instance of
// the registry. Atlas canvas chrome is the boot path when the site header is
// hidden; without it, HomePrompt / NodeAddMenu `useSystemSearch().suggest`
// dispatches `searchAll(..., ['systems'])` against an empty registry and the
// list stays blank while Enter-to-parse (the separately loaded index) still
// works.
import '@/composition/search/register-all';

/**
 * Composes the atlas's floating navigation, reserved search slot, account control, and feedback.
 */
export function MapChrome({
  session,
  contextualSection,
}: {
  session: Session | null;
  contextualSection?: ReactNode;
}) {
  const {
    corporations,
    maps,
    deletedMaps,
    grantsByMapId,
    listingAvailable,
  } = useMapCatalogueData();
  const switcherFocusFallback = useRef<HTMLDivElement | null>(null);
  return (
    <div
      data-map-chrome
      // z-dropdown: chrome controls (portrait, Atlas menu, search) must stay
      // clickable above the z-float window layer — a float-side connection
      // card clamped into the top-right corner would otherwise cover them.
      className="pointer-events-none absolute inset-0 z-dropdown"
    >
      <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2">
        {session ? (
          <div data-map-account-anchor>
            <AccountMenu
              session={session}
              anchor={() => document.querySelector('[data-map-account-anchor]')}
              contextualSection={contextualSection}
            />
          </div>
        ) : null}
        <MapMenu
          corporations={corporations}
          deletedMaps={deletedMaps}
          mapActionsAvailable={listingAvailable}
        />
      </div>
      <div
        ref={switcherFocusFallback}
        tabIndex={-1}
        data-map-search-slot
        className="pointer-events-auto absolute left-1/2 top-4 min-w-0 max-w-[min(20rem,calc(100%-14rem))] -translate-x-1/2"
      >
        <MapSwitcher
          maps={maps}
          corporations={corporations}
          grantsByMapId={grantsByMapId}
          focusFallback={switcherFocusFallback}
        />
      </div>
      <div
        data-map-chrome-chips
        className="pointer-events-auto absolute bottom-4 right-4 flex items-center gap-2"
      >
        <FeedbackButton compact embedded />
      </div>
    </div>
  );
}
