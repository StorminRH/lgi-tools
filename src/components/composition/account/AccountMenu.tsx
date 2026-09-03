'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { PageMenuSection } from '@/components/composition/PageMenuSection';
import {
  Menu,
  MenuItem,
  MenuLinkItem,
  MenuSeparator,
  menuRow,
  menuSeparator,
  type MenuAnchor,
} from '@/components/ui/menu';
import { authClient } from '@/platform/auth/auth-client';
import type { Session } from '@/platform/auth/types';
import { startCharacterLink } from '@/platform/auth/link-character';

export function AccountMenu({
  session,
  anchor,
  contextualSection,
}: {
  session: Session;
  anchor?: MenuAnchor;
  contextualSection?: ReactNode;
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
      triggerProps={{ 'data-account-menu-trigger': '' }}
      popupProps={{ 'data-account-menu-popup': '' }}
      className="min-w-60 border-t-0"
      anchor={anchor ?? (() => document.querySelector('.app-header'))}
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
      {contextualSection}
      <MenuSeparator className={menuSeparator} />
      <MenuItem
        className={menuRow}
        onClick={() => {

          void authClient.signOut().finally(() => {
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the full document reload is deliberate (see comment above)
            window.location.href = '/';
          });
        }}
      >
        Log out
      </MenuItem>

    </Menu>

  );
}
