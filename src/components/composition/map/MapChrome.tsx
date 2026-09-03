'use client';

import { useRef, type ReactNode } from 'react';
import { AccountMenu } from '@/components/composition/account/AccountMenu';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import { useMapCatalogueData } from '@/features/maps/map-catalogue-data';
import { MapSwitcher } from '@/features/maps/MapSwitcher';
import type { Session } from '@/platform/auth/types';
import { MapMenu } from './MapMenu';

import '@/composition/search/register-all';

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
