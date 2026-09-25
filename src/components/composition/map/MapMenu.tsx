'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { HamburgerGlyph } from '@/components/composition/HamburgerGlyph';
import { LogOutMenuItem } from '@/components/composition/account/AccountMenu';
import { PageMenuSection } from '@/components/composition/PageMenuSection';
import {
  Menu,
  MenuItem,
  MenuLinkItem,
  menuRow,
  menuSection,
  menuSectionLabel,
} from '@/components/ui/menu';
import { cn } from '@/components/ui/cn';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import {
  closedMapDialogs,
  connectedDialogFocus,
  mapDialogAuthorityKey,
  reconcileAuthorityScopedMapDialogs,
} from '@/features/maps/map-dialog-state';
import { MapCreationDialog } from '@/features/maps/MapCreationDialog';
import { atlasSignInReturnHref } from '@/features/maps/map-navigation';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { startCharacterLink } from '@/platform/auth/link-character';
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
  '[clip-path:circle(150%_at_calc(100%_-_32px)_32px)] transition-[clip-path,opacity] duration-[360ms] ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ' +
  'data-[starting-style]:[clip-path:circle(19px_at_calc(100%_-_32px)_32px)] ' +
  'data-[ending-style]:[clip-path:circle(19px_at_calc(100%_-_32px)_32px)] data-[ending-style]:opacity-0';
const glyphTrigger =
  'inline-flex size-10 cursor-pointer items-center justify-center rounded-ctl border border-border bg-section text-muted shadow-card-edge transition-colors hover:border-border-active hover:text-name';

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={menuSection} role="group" aria-label={label}>
      <div className={menuSectionLabel} aria-hidden="true">
        {label}
      </div>
      {children}
    </div>
  );
}

function MenuRows({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col border-t border-border-soft py-1" role="group" aria-label={label}>
      {children}
    </div>
  );
}

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

function useCopiedFlag(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [copied]);
  return [copied, () => setCopied(true)];
}

function CopyMapLinkItem({ mapId }: { mapId: string }) {
  const [copied, markCopied] = useCopiedFlag();
  return (
    <MenuItem
      closeOnClick={false}
      data-map-menu-copy-link
      className={menuRow}
      onClick={() => {
        const href = new URL(atlasSignInReturnHref(mapId), window.location.origin);
        void navigator.clipboard?.writeText(href.toString()).then(markCopied, () => {});
      }}
    >
      {copied ? 'Link copied' : 'Copy map link'}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Map link copied to clipboard' : ''}
      </span>
    </MenuItem>
  );
}

function AccountGroup({ isAdmin }: { isAdmin: boolean }) {
  return (
    <MenuRows label="Account">
      <MenuItem className={menuRow} onClick={() => startCharacterLink()}>
        Add character
      </MenuItem>
      <MenuLinkItem
        closeOnClick
        className={menuRow}
        render={<Link href="/settings/account" target="_blank" rel="noreferrer" />}
      >
        Account settings
      </MenuLinkItem>
      {isAdmin ? (
        <MenuLinkItem
          closeOnClick
          className={menuRow}
          render={<Link href="/admin" target="_blank" rel="noreferrer" />}
        >
          Admin
        </MenuLinkItem>
      ) : null}
      <LogOutMenuItem />
    </MenuRows>
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
  const authorityKey = mapDialogAuthorityKey(mapActionsAvailable, []);
  const [storedDialogs, setStoredDialogs] = useState(() =>
    closedMapDialogs(authorityKey),
  );
  const dialogs = reconcileAuthorityScopedMapDialogs(storedDialogs, authorityKey);
  if (dialogs !== storedDialogs) setStoredDialogs(dialogs);
  const ownerRef = useRef<HTMLDivElement | null>(null);
  const creationOpenerRef = useRef<HTMLElement | null>(null);

  return (
    <div ref={ownerRef} tabIndex={-1} data-map-menu-owner className="outline-none">
      <Menu
        label={session ? `${session.name} — account menu` : 'Atlas menu'}
        trigger={
          session ? (
            <CharacterPortrait
              characterId={session.characterId}
              name={session.name}
              size={PORTRAIT_SIZE}
              src={session.portraitUrl}
              preload
            />
          ) : (
            <HamburgerGlyph />
          )
        }
        triggerClassName={session ? portraitTrigger : glyphTrigger}
        triggerProps={{ 'data-map-menu-trigger': '' }}
        popupProps={{ 'data-map-menu-panel': '' }}
        className={cn(
          'w-72 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-card',
          session && portraitReveal,
        )}
        side="bottom"
        align="end"
        {...(session
          ? {
              sideOffset: -(PORTRAIT_SIZE + PORTRAIT_INSET),
              alignOffset: -PORTRAIT_INSET,
              collisionPadding: 0,
            }
          : { sideOffset: 8 })}
      >
        {session ? <IdentityHeader session={session} /> : null}
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
                setStoredDialogs((current) => ({
                  ...current,
                  creationOpen: true,
                }));
              }}
            >
              New map
            </MenuItem>
          ) : null}
          {mapId ? <CopyMapLinkItem mapId={mapId} /> : null}
        </MenuGroup>
        <PageMenuSection>{contextualSection}</PageMenuSection>
        {session ? <AccountGroup isAdmin={isAdmin} /> : null}
        <MenuFooter />
      </Menu>
      <MapCreationDialog
        open={dialogs.creationOpen}
        onOpenChange={(open) =>
          setStoredDialogs((current) => ({ ...current, creationOpen: open }))
        }
        corporations={corporations}
        openerRef={() =>
          connectedDialogFocus(creationOpenerRef.current, ownerRef.current)
        }
      />
    </div>
  );
}
