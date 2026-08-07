'use client';

import type { ReactNode } from 'react';
import { AccountMenu } from '@/components/composition/account/AccountMenu';
import { FeedbackButton } from '@/components/composition/FeedbackButton';
import type { Session } from '@/platform/auth/types';
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
}: {
  session: Session | null;
  contextualSection?: ReactNode;
}) {
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
              contextualSection={contextualSection}
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
