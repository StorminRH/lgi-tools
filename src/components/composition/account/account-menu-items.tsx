'use client';

import Link from 'next/link';
import { MenuItem, MenuLinkItem, menuRow } from '@/components/ui/menu';
import { authClient } from '@/platform/auth/auth-client';
import { reloadDocumentHome } from '@/platform/auth/reload-document-home';
import { startCharacterLink } from '@/platform/auth/link-character';

export function LogOutMenuItem() {
  return (
    <MenuItem
      className={menuRow}
      onClick={() => {
        void authClient.signOut().finally(reloadDocumentHome);
      }}
    >
      Log out
    </MenuItem>
  );
}

export function AccountMenuItems({
  showManageCharacters = true,
  isAdmin = false,
  newTab = false,
  callbackURL,
}: {
  showManageCharacters?: boolean;
  isAdmin?: boolean;
  newTab?: boolean;
  callbackURL?: string;
}) {
  const linkProps = newTab ? { target: '_blank', rel: 'noreferrer' } : {};
  return (
    <>
      {showManageCharacters && (
        <MenuLinkItem
          closeOnClick
          className={menuRow}
          render={<Link href="/settings/characters" {...linkProps} />}
        >
          Manage characters
        </MenuLinkItem>
      )}
      <MenuItem className={menuRow} onClick={() => startCharacterLink(callbackURL)}>
        Add character
      </MenuItem>
      <MenuLinkItem
        closeOnClick
        className={menuRow}
        render={<Link href="/settings/account" {...linkProps} />}
      >
        Account settings
      </MenuLinkItem>
      {isAdmin && (
        <MenuLinkItem
          closeOnClick
          className={menuRow}
          render={<Link href="/admin" {...linkProps} />}
        >
          Admin
        </MenuLinkItem>
      )}
    </>
  );
}
