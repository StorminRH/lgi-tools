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
import { PageMenuSection } from '@/components/composition/PageMenuSection';
import {
  Menu,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
  menuRow,
  menuSeparator,
} from '@/components/ui/menu';
import { authClient } from '@/platform/auth/auth-client';
import type { Session } from '@/platform/auth/types';
import { startCharacterLink } from '@/platform/auth/link-character';

/**
 * Renders the signed-in account menu with character, settings, administrator, and sign-out actions
 * from the auth provider. `anchorSelector` defaults to the site header so existing routes are
 * unchanged; the map passes its floating chrome root.
 */
export function AccountMenu({
  session,
  anchorSelector = '.app-header',
}: {
  session: Session;
  anchorSelector?: string;
}) {
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
      className="min-w-60 border-t-0"
      anchor={() => document.querySelector(anchorSelector)}
    >
      <MenuLinkItem closeOnClick className={menuRow} render={<Link href="/characters" />}>
        Manage characters
      </MenuLinkItem>
      <MenuItem className={menuRow} onClick={() => startCharacterLink()}>
        Add character
      </MenuItem>
      <MenuLinkItem closeOnClick className={menuRow} render={<Link href="/settings" />}>
        Account settings
      </MenuLinkItem>
      <PageMenuSection />
      <MenuSeparator className={menuSeparator} />
      <MenuItem
        className={menuRow}
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
