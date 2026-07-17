'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { deriveNavToolItem, visibleNavTools } from '@/data/tools/registry';
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
        const item = deriveNavToolItem(tool, pathname);
        if (item.kind === 'soon') {
          return (
            <NavigationMenuItem key={item.label} className="flex items-stretch">
              <span title={item.title} className="nav-tool soon">
                {item.label}
              </span>
            </NavigationMenuItem>
          );
        }

        return (
          <NavigationMenuItem key={item.label} className="flex items-stretch">
            <NavigationMenuLink
              active={item.active}
              title={item.title}
              className={cn('nav-tool', item.active && 'active')}
              render={<Link href={item.href} />}
            >
              {item.label}
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

/** Renders desktop tool navigation and its active-route indicator from the shared page menu state. */
export function NavTools() {
  return (
    <Suspense fallback={<NavStrip pathname={null} />}>
      <ActiveNavStrip />
    </Suspense>
  );
}
