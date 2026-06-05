'use client';

// Client-side coordinator for the header's interactive slots. Owns the
// cross-cutting state that both GlobalSearch and NavTools care about:
// whether the search input is currently focused. When `searchActive` is
// true, NavTools collapses to its 2-letter abbreviations to make room
// for the expanded 440px search bar.
//
// AppHeader (the Server Component) renders the wordmark and the
// async-derived site index inside the <header> element; this shell owns the
// rest. Login state is read client-side via useAuth() inside GlobalSearch and
// LoginButton, so it is not threaded through here.

import { useState } from 'react';
import { GlobalSearch } from '@/components/GlobalSearch';
import { LoginButton } from '@/features/auth/components/LoginButton';
import { NavTools } from '@/components/NavTools';
import { PriceFreshness } from '@/components/PriceFreshness';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';

// Side-effect import: registers every search source on the CLIENT instance
// of the registry. Lives here (not in AppHeader, which is a Server
// Component) because Next.js's server + client module graphs are separate
// — each side has its own `sources[]` array, and the search dropdown
// renders client-side.
import '@/search/register-all';

export function AppHeaderShell({
  siteIndex,
  initialLastUpdatedAt,
}: {
  siteIndex: SiteSearchEntry[];
  initialLastUpdatedAt: string | null;
}) {
  const [searchActive, setSearchActive] = useState(false);

  return (
    <>
      <GlobalSearch
        active={searchActive}
        onActiveChange={setSearchActive}
        siteIndex={siteIndex}
      />
      <NavTools shrunk={searchActive} />
      <div className="price-freshness-slot ml-auto flex items-stretch shrink-0 border-l border-border">
        <PriceFreshness initialLastUpdatedAt={initialLastUpdatedAt} />
      </div>
      <div className="login-cluster flex items-center shrink-0 px-3 border-l border-border">
        <LoginButton />
      </div>
    </>
  );
}
