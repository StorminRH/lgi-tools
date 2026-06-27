'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { isToolActive, visibleNavTools } from '@/data/tools/registry';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
} from '@/components/ui/navigation-menu';
import { cn } from '@/components/ui/cn';

// The cross-tool navigation strip — a Base UI NavigationMenu. Lives between the
// global search input and the right-side login cluster in `AppHeader`. Draws its
// links from the shared `visibleNavTools()` (the same source the mobile hamburger
// uses), so a new tool appears in both at once. SOON / nav-disabled tools render
// as inert spans (none in the current roster, but the contract stays for future
// tools).
//
// The active-tab highlight depends on the current pathname, which is request-time
// data under Cache Components (it can't be known when the header is prerendered
// into the static shell — see `/sites/[id]`). So the strip itself is in the
// static shell (the Suspense fallback renders it with nothing highlighted) and
// the active highlight streams in at request time.

function NavStrip({ pathname }: { pathname: string | null }) {
  return (
    <NavigationMenu label="Tools" className="nav-tools ml-auto border-l border-border-soft">
      {visibleNavTools().map((tool) => {
        if (tool.href === null || tool.navDisabled) {
          const title = tool.href === null ? `${tool.label} — coming soon` : tool.label;
          return (
            <NavigationMenuItem key={tool.label} className="flex items-stretch">
              <span title={title} className="nav-tool soon">
                {tool.label}
              </span>
            </NavigationMenuItem>
          );
        }

        const active = isToolActive(tool, pathname);

        return (
          <NavigationMenuItem key={tool.label} className="flex items-stretch">
            <NavigationMenuLink
              active={active}
              title={tool.label}
              className={cn('nav-tool', active && 'active')}
              render={<Link href={tool.href} />}
            >
              {tool.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        );
      })}
    </NavigationMenu>
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
