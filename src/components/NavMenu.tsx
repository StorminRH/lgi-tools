'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { LoginButton } from '@/features/auth/components/LoginButton';
import { Menu, MenuLinkItem } from '@/components/ui/menu';
import { cn } from '@/components/ui/cn';
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

const HAMBURGER = (
  <svg className="nav-menu-icon" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <line x1="2" y1="5" x2="16" y2="5" />
    <line x1="2" y1="9" x2="16" y2="9" />
    <line x1="2" y1="13" x2="16" y2="13" />
  </svg>
);

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
            <span key={item.label} className="nav-tool soon">
              {item.label}
            </span>
          );
        }

        return (
          <MenuLinkItem
            key={item.label}
            closeOnClick
            aria-current={item.active ? 'page' : undefined}
            className={cn('nav-tool', item.active && 'active')}
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
      trigger={HAMBURGER}
      triggerClassName="nav-menu-toggle"
      className="nav-menu-panel"
      anchor={() => document.querySelector('.app-header')}
    >
      <Suspense fallback={null}>
        <NavMenuItems />
      </Suspense>
      <div className="nav-menu-login">
        {/* The flat cluster on purpose: the account-menu variant would nest a
            Menu trigger inside this popup. */}
        <LoginButton variant="flat" />
      </div>
    </Menu>
  );
}
