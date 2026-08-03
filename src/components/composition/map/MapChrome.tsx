'use client';

import { AccountMenu } from '@/components/composition/account/AccountMenu';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import type { Session } from '@/platform/auth/types';
import { MapMenu } from './MapMenu';

/**
 * Composes the atlas's floating navigation, reserved search slot, account control, and feedback.
 */
export function MapChrome({ session }: { session: Session | null }) {
  return (
    <div
      data-map-chrome
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <div className="pointer-events-auto absolute left-4 top-4 flex items-center gap-2">
        <MapMenu />
        {session ? (
          <div data-map-account-anchor>
            <AccountMenu
              session={session}
              anchor={() => document.querySelector('[data-map-account-anchor]')}
            />
          </div>
        ) : null}
      </div>
      <div
        data-map-search-slot
        aria-hidden="true"
        className="absolute left-1/2 top-4 h-10 w-72 -translate-x-1/2"
      />
      <div className="pointer-events-auto">
        <FeedbackButton compact />
      </div>
    </div>
  );
}
