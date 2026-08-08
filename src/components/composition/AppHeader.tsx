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

/** Streams the short-stale Tranquility status read behind its own boundary. */
async function NavServerStatus() {
  return <ServerStatus status={await getNavServerStatus()} />;
}

function NavServerStatusFallback() {
  return (
    <span className="flex h-full items-center px-3">
      <Skeleton label="Loading server status" className="h-3 w-20" />
    </span>
  );
}

/**
 * Application-shell header. Four-slot layout per the 2.9.1 wireframe:
 * bracket-stamp wordmark · global search · cross-tool nav strip · login
 * cluster. Renders the <header> element directly rather than wrapping a
 * shared header primitive because the four slots are unique to this surface.
 *
 * The Tranquility status chip is the header's only short-stale read
 * (`stale: 30` — below the 5-minute App Shell threshold), so it streams from
 * its own chip-shaped Suspense hole. Everything else here reads
 * `cacheLife('max')` data, keeping the header inside every route's App Shell
 * for instant soft navigation.
 *
 * Right-slot `shrink-0` on the login cluster is load-bearing — never let
 * search expansion or tool growth push it.
 */
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
