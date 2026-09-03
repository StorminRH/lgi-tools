import { io } from 'next/cache';
import Link from 'next/link';
import { Suspense } from 'react';
import { AppHeaderShell } from '@/components/composition/AppHeaderShell';
import { ServerStatus } from '@/components/composition/ServerStatus';
import { Skeleton } from '@/components/ui/skeleton';
import { getNavServerStatus } from '@/data/eve-status/queries';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

// Note: the search-source side-effect registration (`register-all`) is done
// from AppHeaderShell, which is the Client Component — Next.js's server +
// client module graphs are separate, and the dropdown logic lives on the
// client. Importing `register-all` here would only populate the server
// instance of the registry, leaving the client's empty.

async function NavServerStatus() {
  // `stale: 30` is still prerender-eligible. Without `io()`, build HTML can
  // bake one player count and request-time RSC another — React #418 on hydrate.
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
