import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { AppHeaderShell } from '@/components/composition/AppHeaderShell';
import {
  HeldServerStatus,
  ServerStatus,
  ServerStatusFallback,
} from '@/components/composition/ServerStatus';
import { getNavServerStatus } from '@/data/eve-status/queries';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

async function NavServerStatus() {
  await connection();
  return (
    <HeldServerStatus>
      <ServerStatus status={await getNavServerStatus()} />
    </HeldServerStatus>
  );
}

export async function AppHeader() {
  const siteIndex = await getSiteSearchIndex();

  return (
    <header className="app-header flex h-[50px] items-stretch border-b border-border bg-section text-ui max-lg:h-auto max-lg:flex-wrap">
      <div className="flex items-center shrink-0 px-4 border-r border-border">
        <Link
          href="/"
          className="font-data font-extrabold text-lead tracking-copy uppercase text-name inline-flex items-center"
        >
          <span className="text-isk">[</span>
          <span className="px-[2px]">LGI</span>
          <span className="text-isk">]</span>
          <span className="text-muted font-normal">.tools</span>
        </Link>
      </div>
      <AppHeaderShell
        siteIndex={siteIndex}
        serverStatusSlot={
          <Suspense fallback={<ServerStatusFallback />}>
            <NavServerStatus />
          </Suspense>
        }
      />
    </header>
  );
}
