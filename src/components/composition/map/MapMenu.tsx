'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { HamburgerGlyph } from '@/components/composition/HamburgerGlyph';
import {
  AccountMenuItems,
  LogOutMenuItem,
} from '@/components/composition/account/account-menu-items';
import { PageMenuSection } from '@/components/composition/PageMenuSection';
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuLinkItem,
  menuRow,
} from '@/components/ui/menu';
import { floatIconTrigger } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { useCopyFeedback } from '@/components/ui/use-copy-feedback';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import { connectedDialogFocus } from '@/features/maps/map-dialog-state';
import { MapCreationDialog } from '@/features/maps/MapCreationDialog';
import { atlasMapHref } from '@/features/maps/map-navigation';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import type { Session } from '@/platform/auth/types';

// The open menu's header portrait lands exactly on the trigger portrait, so
// the menu reads as drawing out around it. The inset is the header's p-3 plus
// the popup's 1px border.
const PORTRAIT_SIZE = 38;
const PORTRAIT_INSET = 13;
const portraitTrigger =
  'flex cursor-pointer items-center rounded-full transition-opacity hover:opacity-85';
// Circular reveal centred on the header portrait, collapsing back on close.
const portraitReveal =
  '[clip-path:circle(150%_at_calc(100%_-_var(--portrait-center))_var(--portrait-center))] transition-[clip-path,opacity] duration-[360ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ' +
  'data-[starting-style]:[clip-path:circle(var(--portrait-radius)_at_calc(100%_-_var(--portrait-center))_var(--portrait-center))] ' +
  'data-[ending-style]:[clip-path:circle(var(--portrait-radius)_at_calc(100%_-_var(--portrait-center))_var(--portrait-center))] data-[ending-style]:opacity-0';

function IdentityHeader({ session }: { session: Session }) {
  return (
    <div data-map-menu-identity className="flex items-start gap-3 p-3">
      <MenuLinkItem
        closeOnClick
        className="group flex min-w-0 flex-1 flex-col outline-none"
        render={<Link href="/settings/characters" target="_blank" rel="noreferrer" />}
      >
        <span className="truncate font-ui text-nav text-name">{session.name}</span>
        <span className="font-ui text-ui text-muted transition-colors group-hover:text-isk group-data-[highlighted]:text-isk">
          Manage characters
        </span>
      </MenuLinkItem>
      <MenuItem
        closeOnClick
        aria-label="Close menu"
        data-map-menu-close
        className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-full outline-none data-[highlighted]:ring-1 data-[highlighted]:ring-isk"
      >
        <CharacterPortrait
          characterId={session.characterId}
          name={session.name}
          size={PORTRAIT_SIZE}
          src={session.portraitUrl}
        />
      </MenuItem>
    </div>
  );
}

function CopyMapLinkItem({ mapId }: { mapId: string }) {
  const { state, copy } = useCopyFeedback(() =>
    new URL(atlasMapHref(mapId), window.location.origin).toString(),
  );
  const labels = {
    idle: 'Copy map link',
    copied: 'Link copied',
    unavailable: 'Clipboard unavailable',
  };
  const announcements = {
    idle: '',
    copied: 'Map link copied to clipboard',
    unavailable: 'Clipboard unavailable; copy the map link from your address bar',
  };
  return (
    <MenuItem
      closeOnClick={false}
      data-map-menu-copy-link
      className={menuRow}
      onClick={() => void copy()}
    >
      {labels[state]}
      <span aria-live="polite" className="sr-only">
        {announcements[state]}
      </span>
    </MenuItem>
  );
}

function AccountGroup({ isAdmin, mapId }: { isAdmin: boolean; mapId: string | null }) {
  return (
    <MenuGroup label="Account" hideLabel>
      <AccountMenuItems
        showManageCharacters={false}
        isAdmin={isAdmin}
        newTab
        callbackURL={atlasMapHref(mapId ?? undefined)}
      />
      <LogOutMenuItem />
    </MenuGroup>
  );
}

function MenuFooter() {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-soft px-3 py-2.5">
      <MenuLinkItem
        closeOnClick
        aria-label="LGI.tools home"
        data-map-menu-home
        className="font-data text-ui font-extrabold uppercase tracking-copy text-name outline-none transition-colors hover:text-isk data-[highlighted]:text-isk"
        render={<Link href="/" target="_blank" rel="noreferrer" />}
      >
        <span className="text-isk">[</span>
        <span className="px-[2px]">LGI</span>
        <span className="text-isk">]</span>
        <span className="font-normal normal-case text-muted">.tools</span>
      </MenuLinkItem>
      <MenuLinkItem
        data-map-menu-attribution
        href="https://reactflow.dev"
        target="_blank"
        rel="noopener noreferrer"
        closeOnClick
        className="font-ui text-micro text-faint outline-none transition-colors hover:text-isk data-[highlighted]:text-isk"
      >
        Built with React Flow
      </MenuLinkItem>
    </div>
  );
}

export function MapMenu({
  session,
  contextualSection,
  corporations = [],
  mapActionsAvailable = true,
}: {
  readonly session: Session | null;
  readonly contextualSection?: ReactNode;
  readonly corporations?: readonly CorporationAccessOption[];
  readonly mapActionsAvailable?: boolean;
}) {
  const { isAdmin } = useAuth();
  const mapId = useSearchParams().get('map');
  const [creationOpen, setCreationOpen] = useState(false);
  if (!mapActionsAvailable && creationOpen) setCreationOpen(false);
  const ownerRef = useRef<HTMLDivElement | null>(null);
  const creationOpenerRef = useRef<HTMLElement | null>(null);
  const shell = session
    ? {
        label: `${session.name} — Atlas menu`,
        trigger: (
          <CharacterPortrait
            characterId={session.characterId}
            name={session.name}
            size={PORTRAIT_SIZE}
            src={session.portraitUrl}
            preload
          />
        ),
        triggerClassName: portraitTrigger,
        className: portraitReveal,
        sideOffset: -(PORTRAIT_SIZE + PORTRAIT_INSET),
        alignOffset: -PORTRAIT_INSET,
        collisionPadding: 0,
        header: <IdentityHeader session={session} />,
        account: <AccountGroup isAdmin={isAdmin} mapId={mapId} />,
      }
    : {
        label: 'Atlas menu',
        trigger: <HamburgerGlyph />,
        triggerClassName: floatIconTrigger,
        sideOffset: 8,
      };
  const { header, account, className, ...menuShell } = shell;

  return (
    <div ref={ownerRef} tabIndex={-1} data-map-menu-owner className="outline-none">
      <Menu
        {...menuShell}
        triggerProps={{ 'data-map-menu-trigger': '' }}
        popupProps={{
          'data-map-menu-panel': '',
          style: {
            '--portrait-center': `${PORTRAIT_INSET + PORTRAIT_SIZE / 2}px`,
            '--portrait-radius': `${PORTRAIT_SIZE / 2}px`,
          } as CSSProperties,
        }}
        className={cn(
          'w-72 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card',
          className,
        )}
        side="bottom"
        align="end"
      >
        {header}
        <MenuGroup label="Map">
          <MenuLinkItem
            closeOnClick
            data-map-menu-catalogue
            className={menuRow}
            render={<Link href="/atlas" />}
          >
            Maps
          </MenuLinkItem>
          {mapActionsAvailable ? (
            <MenuItem
              closeOnClick
              className={menuRow}
              onClick={(event) => {
                creationOpenerRef.current = event.currentTarget;
                setCreationOpen(true);
              }}
            >
              New map
            </MenuItem>
          ) : null}
          {mapId ? <CopyMapLinkItem mapId={mapId} /> : null}
        </MenuGroup>
        <PageMenuSection>{contextualSection}</PageMenuSection>
        {account}
        <MenuFooter />
      </Menu>
      <MapCreationDialog
        open={mapActionsAvailable && creationOpen}
        onOpenChange={setCreationOpen}
        corporations={corporations}
        openerRef={() =>
          connectedDialogFocus(creationOpenerRef.current, ownerRef.current)
        }
      />
    </div>
  );
}
