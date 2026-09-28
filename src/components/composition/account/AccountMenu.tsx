'use client';

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
import { reloadDocumentHome } from '@/platform/auth/reload-document-home';
import type { Session } from '@/platform/auth/types';
import { startCharacterLink } from '@/platform/auth/link-character';

export function LogOutMenuItem() {
  return (
    <MenuItem
      className={menuRow}
      onClick={() => {
        void authClient.signOut().finally(() => {
          reloadDocumentHome();
        });
      }}
    >
      Log out
    </MenuItem>
  );
}

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
      triggerProps={{ 'data-account-menu-trigger': '' }}
      popupProps={{ 'data-account-menu-popup': '' }}
      className="min-w-60 border-t-0"
      anchor={() => document.querySelector('.app-header')}
    >
      <MenuLinkItem closeOnClick className={menuRow} render={<Link href="/settings/characters" />}>
        Manage characters
      </MenuLinkItem>
      <MenuItem className={menuRow} onClick={() => startCharacterLink()}>
        Add character
      </MenuItem>
      <MenuLinkItem closeOnClick className={menuRow} render={<Link href="/settings/account" />}>
        Account settings
      </MenuLinkItem>
      <PageMenuSection />
      <MenuSeparator className={menuSeparator} />
      <LogOutMenuItem />
    </Menu>
  );
}
