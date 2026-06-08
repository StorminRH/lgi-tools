import Link from 'next/link';
import { AppHeaderShell } from '@/components/AppHeaderShell';
import { getCachedPricesFreshness } from '@/data/market-prices/cache';
import { getSiteSearchIndex } from '@/features/wormhole-sites/queries';

// Note: the search-source side-effect registration (`register-all`) is done
// from AppHeaderShell, which is the Client Component — Next.js's server +
// client module graphs are separate, and the dropdown logic lives on the
// client. Importing `register-all` here would only populate the server
// instance of the registry, leaving the client's empty.

// Application-shell header. Four-slot layout per the 2.9.1 wireframe:
// bracket-stamp wordmark · global search · cross-tool nav strip · login
// cluster. Renders the <header> element directly rather than wrapping a
// shared header primitive because the four slots are unique to this surface.
//
// Right-slot `shrink-0` on the login cluster is load-bearing — never let
// search expansion or tool growth push it.
export async function AppHeader() {
  const [siteIndex, { lastUpdatedAt }] = await Promise.all([
    getSiteSearchIndex(),
    getCachedPricesFreshness(),
  ]);

  return (
    <header className="app-header flex items-stretch h-11 text-body border-b border-border bg-section">
      <div className="flex items-center shrink-0 px-4 border-r border-border">
        <Link
          href="/"
          className="font-jb font-extrabold text-[14px] tracking-[0.04em] uppercase text-name inline-flex items-center"
        >
          <span className="text-isk">[</span>
          <span className="px-[2px]">LGI</span>
          <span className="text-isk">]</span>
          <span className="text-muted font-normal">.tools</span>
        </Link>
      </div>
      <AppHeaderShell
        siteIndex={siteIndex}
        initialLastUpdatedAt={lastUpdatedAt?.toISOString() ?? null}
      />
    </header>
  );
}
