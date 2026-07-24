'use client';

// The signed-in portrait menu (ACCOUNT.5): the top-right portrait as a Base UI
// Menu trigger instead of a link. GLOBAL half: the ambient account actions —
// navigate to manage characters or account settings, start the add-character
// link flow, and plain current-session log-out (D-3: the destructive flows stay
// behind the account pages' confirm gates; this menu never hosts one).
// DYNAMIC half: <PageMenuSection /> renders the current route's page-settings
// spec, empty where none.
//
// Desktop-only by construction: the header's login cluster is hidden <1024px,
// where the hamburger's footer renders the flat LoginButton cluster instead
// (never a menu nested inside the hamburger's popup).

import Link from 'next/link';
import { CharacterPortrait } from '@/components/character-portrait';
import { PageMenuSection } from '@/components/PageMenuSection';
import { Menu, MenuItem, MenuLinkItem, MenuSeparator } from '@/components/ui/menu';
import { authClient } from '../auth-client';
import type { Session } from '../types';
import { startCharacterLink } from '../link-character';

/**
 * Renders the signed-in account menu with character, settings, administrator, and sign-out actions
 * from the auth provider.
 */
export function AccountMenu({ session }: { session: Session }) {
  return (
    <Menu
      label={`${session.name} — account menu`}
      trigger={
        <CharacterPortrait
          characterId={session.characterId}
          name={session.name}
          size={32}
          src={session.portraitUrl}
          preload
        />
      }
      triggerClassName="flex items-center cursor-pointer transition-opacity hover:opacity-80 data-[popup-open]:opacity-80"
      className="account-menu-panel"
      anchor={() => document.querySelector('.app-header')}
    >
      <MenuLinkItem closeOnClick className="account-menu-item" render={<Link href="/characters" />}>
        Manage characters
      </MenuLinkItem>
      <MenuItem className="account-menu-item" onClick={() => startCharacterLink()}>
        Add character
      </MenuItem>
      <MenuLinkItem closeOnClick className="account-menu-item" render={<Link href="/settings" />}>
        Account settings
      </MenuLinkItem>
      <PageMenuSection />
      <MenuSeparator className="account-menu-separator" />
      <MenuItem
        className="account-menu-item"
        onClick={() => {
          // Clear the CURRENT session only, then hard-navigate home so cached
          // server-component output that referenced the now-gone session is
          // dropped (today's exact log-out handler; the finally keeps the
          // redirect on the error path).
          void authClient.signOut().finally(() => {
            window.location.href = '/';
          });
        }}
      >
        Log out
      </MenuItem>
    </Menu>
  );
}
