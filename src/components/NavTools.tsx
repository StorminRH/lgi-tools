'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { TOOLS } from '@/data/tools/registry';
import { cn } from '@/components/ui/cn';

// The cross-tool navigation strip. Lives between the global search input
// and the right-side login cluster in `AppHeader`. SOON / nav-disabled tools
// render as inert spans (none in the current two-tab roster, but the contract
// stays for future tools).
//
// The active-tab highlight depends on the current pathname, which is
// request-time data under Cache Components (it can't be known when the header
// is prerendered into the static shell — see `/sites/[id]`). So the strip
// itself is in the static shell (the Suspense fallback renders it with nothing
// highlighted) and the active highlight streams in at request time.

function NavStrip({ pathname }: { pathname: string | null }) {
  return (
    <nav className="nav-tools ml-auto border-l border-border-soft flex items-stretch">
      {TOOLS.filter((tool) => !tool.navHidden).map((tool) => {
        if (tool.href === null || tool.navDisabled) {
          const title = tool.href === null ? `${tool.label} — coming soon` : tool.label;
          return (
            <span key={tool.label} title={title} className="nav-tool soon">
              {tool.label}
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
            aria-current={isActive ? 'page' : undefined}
            className={cn('nav-tool', isActive && 'active')}
          >
            {tool.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveNavStrip() {
  const pathname = usePathname();
  return <NavStrip pathname={pathname} />;
}

export function NavTools() {
  return (
    <Suspense fallback={<NavStrip pathname={null} />}>
      <ActiveNavStrip />
    </Suspense>
  );
}
