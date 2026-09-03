'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { deriveNavToolItem, visibleNavTools } from '@/data/tools/registry';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  navigationMenuLink,
} from '@/components/ui/navigation-menu';
import { cn } from '@/components/ui/cn';

function NavStrip({ pathname }: { pathname: string | null }) {
  return (
    <NavigationMenu label="Tools" className="ml-auto max-lg:hidden">
      {visibleNavTools().map((tool) => {
        const item = deriveNavToolItem(tool, pathname);
        if (item.kind === 'soon') {
          return (
            <NavigationMenuItem key={item.label} className="flex items-stretch">
              <span
                title={item.title}
                className={navigationMenuLink({ disabled: true })}
              >
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
              className={cn(navigationMenuLink({ active: item.active }))}
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

export function NavTools() {
  return (
    <Suspense fallback={<NavStrip pathname={null} />}>
      <ActiveNavStrip />
    </Suspense>

  );
}
