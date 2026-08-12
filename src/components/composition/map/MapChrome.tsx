'use client';

import type { ReactNode } from 'react';
import { AccountMenu } from '@/components/composition/account/AccountMenu';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import type { Session } from '@/platform/auth/types';
import type {
  CorporationAccessOption,
  MapAccessGrantOption,
} from '@/data/maps/access-contract';
import type { AuthorizedMapRow, DeletedRestorableMapRow } from '@/data/maps/queries';
import { MapSwitcher } from '@/features/maps/MapSwitcher';
import { MapMenu } from './MapMenu';

// Side-effect import: registers every search source on the CLIENT instance of
// the registry. Map routes do not mount AppHeaderShell, so this shell is the
// atlas boot path for the same wiring the industry planner pickers rely on —
// without it, HomePrompt / NodeAddMenu `useSystemSearch().suggest` dispatches
// `searchAll(..., ['systems'])` against an empty registry and the list stays
// blank while Enter-to-parse (the separately loaded index) still works.
import '@/composition/search/register-all';

/**
 * Composes the atlas's floating navigation, reserved search slot, account control, and feedback.
 */
export function MapChrome({
  session,
  contextualSection,
  corporations = [],
  maps = [],
  deletedMaps = [],
  grantsByMapId = {},
}: {
  session: Session | null;
  contextualSection?: ReactNode;
  corporations?: readonly CorporationAccessOption[];
  maps?: readonly AuthorizedMapRow[];
  deletedMaps?: readonly DeletedRestorableMapRow[];
  grantsByMapId?: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
}) {
  return (
    <div
      data-map-chrome
      // z-dropdown: chrome controls (portrait, Atlas menu, search) must stay
      // clickable above the z-sticky window layer — a sticky-side connection
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
        <MapMenu corporations={corporations} deletedMaps={deletedMaps} />
      </div>
      <div
        data-map-search-slot
        className="pointer-events-auto absolute left-1/2 top-4 -translate-x-1/2"
      >
        <MapSwitcher
          maps={maps}
          corporations={corporations}
          grantsByMapId={grantsByMapId}
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
