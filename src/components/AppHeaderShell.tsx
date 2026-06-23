'use client';

// Client-side coordinator for the header's interactive slots. Owns one piece
// of cross-cutting state: whether the global search is active (focused with
// its results dropdown open). GlobalSearch reads it to show the dropdown and
// its active styling — the search bar is a fixed width, so nothing else
// depends on it.
//
// AppHeader (the Server Component) renders the wordmark and the
// async-derived site index inside the <header> element; this shell owns the
// rest. Login state is read client-side via useAuth() inside GlobalSearch and
// LoginButton, so it is not threaded through here.

import { useState } from 'react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LoginButton } from '@/features/auth/components/LoginButton';
import { NavTools } from '@/components/NavTools';
import { ServerStatus } from '@/components/ServerStatus';
import type { ServerStatus as ServerStatusValue } from '@/data/eve-status/types';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';

// Side-effect import: registers every search source on the CLIENT instance
// of the registry. Lives here (not in AppHeader, which is a Server
// Component) because Next.js's server + client module graphs are separate
// — each side has its own `sources[]` array, and the search dropdown
// renders client-side.
import '@/search/register-all';

export function AppHeaderShell({
  siteIndex,
  serverStatus,
}: {
  siteIndex: SiteSearchEntry[];
  serverStatus: ServerStatusValue;
}) {
  const [searchActive, setSearchActive] = useState(false);

  return (
    <>
      <GlobalSearch
        active={searchActive}
        onActiveChange={setSearchActive}
        siteIndex={siteIndex}
      />
      <NavTools />
      <div className="server-status-slot flex items-stretch shrink-0 border-l border-border">
        <ServerStatus status={serverStatus} />
      </div>
      <div className="login-cluster flex items-center shrink-0 px-3 border-l border-border">
        <LoginButton />
      </div>
    </>
  );
}
