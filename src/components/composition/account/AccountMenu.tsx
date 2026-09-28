'use client';

import { CharacterPortrait } from '@/components/character-portrait';
import { PageMenuSection } from '@/components/composition/PageMenuSection';
import {
  Menu,
  MenuSeparator,
  menuSeparator,
} from '@/components/ui/menu';
import type { Session } from '@/platform/auth/types';
import { AccountMenuItems, LogOutMenuItem } from './account-menu-items';

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
      <AccountMenuItems />
      <PageMenuSection />
      <MenuSeparator className={menuSeparator} />
      <LogOutMenuItem />
    </Menu>
  );
}
