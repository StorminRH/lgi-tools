import { AccountMenu } from '@/components/composition/account/AccountMenu';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import { MapMenu } from '@/components/composition/map/MapMenu';
import type { Session } from '@/platform/auth/types';

/**
 * Floating map chrome composed at the application layer: menu, reserved search
 * slot, account control, and compact feedback. The mapper never imports these.
 */
export function MapChrome({ session }: { session: Session }) {
  return (
    <div className="map-chrome pointer-events-none absolute inset-0 z-dropdown">
      <div className="pointer-events-auto absolute top-3 left-3">
        <MapMenu />
      </div>
      <div
        className="absolute top-3 left-1/2 h-10 w-64 -translate-x-1/2"
        data-map-search-slot
        aria-hidden="true"
      />
      <div className="pointer-events-auto absolute top-3 right-3">
        <AccountMenu session={session} anchorSelector=".map-chrome" />
      </div>
      <div className="pointer-events-auto">
        <FeedbackButton compact />
      </div>
    </div>
  );
}
