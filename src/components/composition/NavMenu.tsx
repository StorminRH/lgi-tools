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

// Mobile-only hamburger (globals.css reveals the trigger below 1024px and hides
// the inline tool strip + login cluster there). Built on the shared Base UI Menu
// primitive: the trigger is a native <button>, the panel a dropdown of the same
// tools the desktop strip shows (as navigable menu rows) plus the reused
// LoginButton in a footer.
//
// Base UI owns the open/close, keyboard nav, focus, and dismiss. `closeOnClick`
// on each link row closes the menu after a tap — the header persists across
// client navigations, so it would otherwise stay open on the new page. The panel
// drops below the whole (wrapped) header by anchoring to `.app-header` rather
// than the trigger.

// The tool rows, in their own component so `usePathname` (request-time data under
// Cache Components) is read only when the popup is open — the popup mounts on
// interaction, never in the prerendered static shell. Shares `visibleNavTools()`
// + `isToolActive()` with the desktop strip (one source); SOON / nav-disabled
// tools render as inert spans (none in the current roster, but the contract stays
// and it guards a null href).
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

/**
 * Renders the small-screen navigation menu from the shared route definitions; the menu owns
 * disclosure behavior while routes remain owned by the navigation model.
 */
export function NavMenu() {
  return (
    <Menu
      label="Menu"
      trigger={<HamburgerGlyph />}
      triggerClassName="hidden cursor-pointer items-center justify-center border-l border-border px-4 text-muted transition-colors hover:bg-row-hover hover:text-name data-[popup-open]:bg-row-hover data-[popup-open]:text-name max-lg:inline-flex"
      triggerProps={{ 'data-nav-menu-toggle': '' }}
      popupProps={{ 'data-nav-menu-panel': '' }}
      className="min-w-56 border-t-0"
      anchor={() => document.querySelector('.app-header')}
    >
      <Suspense fallback={null}>
        <NavMenuItems />
      </Suspense>
      <PageMenuSection />
      <div data-nav-login-footer className="flex border-t border-border px-4 py-3">
        {/* The flat cluster on purpose: the account-menu variant would nest a
            Menu trigger inside this popup. */}
        <LoginButton variant="flat" />
      </div>
    </Menu>
  );
}
