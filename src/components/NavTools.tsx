'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { TOOLS } from '@/data/tools/registry';
import { cn } from '@/components/ui/cn';

// The cross-tool navigation strip. Lives between the global search input
// and the right-side login cluster in `AppHeader`. SOON tools render as
// inert spans. Below ~1380px each label collapses to its 2-letter
// abbreviation via a CSS-only media query so the strip still fits.
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
            className={cn('nav-tool', isActive && 'active')}
          >
            <span className="full">{tool.label}</span>
            <span className="abbr">{tool.abbr}</span>
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
