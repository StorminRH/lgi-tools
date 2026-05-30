'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { TOOLS } from '@/data/tools/registry';
import { cn } from '@/components/ui/cn';

// The cross-tool navigation strip. Lives between the global search input
// and the right-side login cluster in `AppHeader`. SOON tools render as
// inert spans. When `shrunk` is true (the parent's global search is
// focused), every label collapses to its 2-letter abbreviation so the
// expanded search bar can claim the room.
//
// The active-tab highlight depends on the current pathname, which is
// request-time data under Cache Components (it can't be known when the header
// is prerendered into the static shell — see `/sites/[id]`). So the strip
// itself is in the static shell (the Suspense fallback renders it with nothing
// highlighted) and the active highlight streams in at request time.

function NavStrip({ shrunk, pathname }: { shrunk: boolean; pathname: string | null }) {
  return (
    <nav
      className={cn(
        'nav-tools flex items-stretch min-w-0 overflow-hidden',
        shrunk && 'shrunk',
      )}
    >
      {TOOLS.map((tool) => {
        if (tool.href === null) {
          return (
            <span
              key={tool.label}
              title={`${tool.label} — coming soon`}
              className="nav-tool flex items-center px-3.5 text-[11px] font-medium text-muted opacity-55 cursor-default whitespace-nowrap tracking-[0.03em]"
            >
              <span className="full">{tool.label}</span>
              <span className="abbr">{tool.abbr}</span>
            </span>
          );
        }

        const isActive =
          pathname != null && !!tool.matchPrefix && pathname.startsWith(tool.matchPrefix);

        return (
          <Link
            key={tool.label}
            href={tool.href}
            title={tool.label}
            className={cn(
              'nav-tool flex items-center px-3.5 text-[11px] font-medium tracking-[0.03em] whitespace-nowrap border-b-2 transition-colors',
              isActive
                ? 'text-name border-isk'
                : 'text-muted border-transparent',
            )}
          >
            <span className="full">{tool.label}</span>
            <span className="abbr">{tool.abbr}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveNavStrip({ shrunk }: { shrunk: boolean }) {
  const pathname = usePathname();
  return <NavStrip shrunk={shrunk} pathname={pathname} />;
}

export function NavTools({ shrunk = false }: { shrunk?: boolean }) {
  return (
    <Suspense fallback={<NavStrip shrunk={shrunk} pathname={null} />}>
      <ActiveNavStrip shrunk={shrunk} />
    </Suspense>
  );
}
