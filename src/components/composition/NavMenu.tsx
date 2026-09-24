'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { HamburgerGlyph } from '@/components/composition/HamburgerGlyph';
import { LoginButton } from '@/components/composition/account/LoginButton';
import { PageMenuSection } from '@/components/composition/PageMenuSection';
import { Menu, MenuLinkItem } from '@/components/ui/menu';
import { navigationMenuLink } from '@/components/ui/navigation-menu';
import { deriveNavToolItem, visibleNavTools } from '@/data/tools/registry';

function NavMenuItems() {
  const pathname = usePathname();
  return (
    <>
      {visibleNavTools().map((tool) => {
        const item = deriveNavToolItem(tool, pathname);
        if (item.kind === 'soon') {
          return (
            <span
              key={item.label}
              className={navigationMenuLink({ placement: 'menu', disabled: true })}
            >
              {item.label}
            </span>
          );
        }

        return (
          <MenuLinkItem
            key={item.label}
            closeOnClick
            aria-current={item.active ? 'page' : undefined}
            className={navigationMenuLink({ placement: 'menu', active: item.active })}
            render={<Link href={item.href} />}
          >
            {item.label}
          </MenuLinkItem>
        );
      })}
    </>
  );
}

export function NavMenu() {
  return (
    <Menu
      label="Menu"
      trigger={<HamburgerGlyph />}
      triggerClassName="hidden size-10 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-row-on hover:text-name data-[popup-open]:bg-row-on data-[popup-open]:text-name max-lg:inline-flex"
      triggerProps={{ 'data-nav-menu-toggle': '' }}
      popupProps={{ 'data-nav-menu-panel': '' }}
      className="mt-2 min-w-56"
      anchor={() => document.querySelector('.app-header')}
    >
      <Suspense fallback={null}>
        <NavMenuItems />
      </Suspense>
      <PageMenuSection />
      <div data-nav-login-footer className="flex border-t border-border px-4 py-3">
        <LoginButton variant="flat" />
      </div>
    </Menu>
  );
}
