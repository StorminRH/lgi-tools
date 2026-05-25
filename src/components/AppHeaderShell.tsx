'use client';

// Client-side coordinator for the header's interactive slots. Owns the
// cross-cutting state that both GlobalSearch and NavTools care about:
// whether the search input is currently focused. When `searchActive` is
// true, NavTools collapses to its 2-letter abbreviations to make room
// for the expanded 440px search bar.
//
// AppHeader (the Server Component) renders the wordmark and the
// async-derived data (session, site index) inside the <header> element;
// this shell owns the rest.

import { useState } from 'react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LoginButton } from '@/features/auth/components/LoginButton';
import { NavTools } from '@/components/NavTools';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';
import type { Session } from '@/features/auth/types';

// Side-effect import: registers every search source on the CLIENT instance
// of the registry. Lives here (not in AppHeader, which is a Server
// Component) because Next.js's server + client module graphs are separate
// — each side has its own `sources[]` array, and the search dropdown
// renders client-side.
import '@/data/search/register-all';

export function AppHeaderShell({
  session,
  showAdminLink,
  siteIndex,
}: {
  session: Session | null;
  showAdminLink: boolean;
  siteIndex: SiteSearchEntry[];
}) {
  const [searchActive, setSearchActive] = useState(false);

  return (
    <>
      <GlobalSearch
        active={searchActive}
        onActiveChange={setSearchActive}
        session={session}
        isAdmin={showAdminLink}
        siteIndex={siteIndex}
      />
      <NavTools shrunk={searchActive} />
      <div className="login-cluster ml-auto flex items-center shrink-0 px-3 border-l border-border">
        <LoginButton session={session} showAdminLink={showAdminLink} />
      </div>
    </>
  );
}
