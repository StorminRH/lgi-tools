'use client';

import { useState, type ReactNode } from 'react';
import { GlobalSearch } from '@/components/composition/GlobalSearch';
import { LoginButton } from '@/components/composition/account/LoginButton';
import { NavMenu } from '@/components/composition/NavMenu';
import { NavTools } from '@/components/composition/NavTools';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';

import '@/composition/search/register-all';

export function AppHeaderShell({
  siteIndex,
  serverStatusSlot,
}: {
  siteIndex: SiteSearchEntry[];
  serverStatusSlot: ReactNode;
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
      <div
        data-server-status-slot
        className="flex shrink-0 items-stretch border-l border-border max-lg:ml-auto"
      >
        {serverStatusSlot}
      </div>
      <div
        data-account-slot
        className="flex shrink-0 items-center border-l border-border px-3 max-lg:hidden"
      >
        <LoginButton />
      </div>
      <NavMenu />
    </>
  );
}
