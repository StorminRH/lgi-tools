import { io } from 'next/cache';
import Link from 'next/link';
import { Suspense } from 'react';
import { AppHeaderShell } from '@/components/composition/AppHeaderShell';
import { ServerStatus } from '@/components/composition/ServerStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { getNavServerStatus } from '@/data/eve-status/queries';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

async function NavServerStatus() {
  await io();
  return <ServerStatus status={await getNavServerStatus()} />;
}

function NavServerStatusFallback() {
  return (
    <span className="flex h-full items-center px-3">
      <Skeleton label="Loading server status" className="h-3 w-20" />
    </span>
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
          <Suspense fallback={<NavServerStatusFallback />}>
            <NavServerStatus />
          </Suspense>
        }
      />
    </header>
  );
}
