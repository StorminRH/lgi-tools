'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
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
import { isToolActive, visibleNavTools } from '@/data/tools/registry';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import type { DeletedRestorableMapRow } from '@/data/maps/queries';
import {
  closedMapDialogs,
  mapDialogAuthorityKey,
  reconcileAuthorityScopedMapDialogs,
} from '@/features/maps/map-dialog-state';
import { MapLifecycleDialogs } from '@/features/maps/MapLifecycleDialogs';
import { atlasSignInReturnHref } from '@/features/maps/map-navigation';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { startCharacterLink } from '@/platform/auth/link-character';
import type { Session } from '@/platform/auth/types';

const portraitTrigger =
  'flex cursor-pointer items-center rounded-full ring-offset-2 ring-offset-bg-deep transition-[opacity,box-shadow] hover:opacity-85 data-[popup-open]:ring-1 data-[popup-open]:ring-isk';
const glyphTrigger =
  'inline-flex size-10 cursor-pointer items-center justify-center rounded-ctl border border-border bg-section text-muted shadow-card-edge transition-colors hover:border-border-active hover:text-name';
const newTabHint = 'ml-auto font-data text-micro text-faint';

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

function IdentityHeader({ session }: { session: Session }) {
  return (
    <MenuLinkItem
      closeOnClick
      data-map-menu-identity
      className="flex items-center gap-3 px-3 py-3 outline-none data-[highlighted]:bg-row-active"
      render={<Link href="/characters" target="_blank" rel="noreferrer" />}
    >
      <CharacterPortrait
        characterId={session.characterId}
        name={session.name}
        size={38}
        src={session.portraitUrl}
      />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-ui text-nav text-name">{session.name}</span>
        <span className="font-data text-micro text-muted">Manage characters</span>
      </span>
    </MenuLinkItem>
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

function ToolsGroup() {
  const pathname = usePathname();
  const tools = visibleNavTools().filter(
    (tool) => tool.href !== null && !isToolActive(tool, pathname),
  );
  return (
    <MenuGroup label="Tools">
      {tools.map((tool) => (
        <MenuLinkItem
          key={tool.label}
          closeOnClick
          className={menuRow}
          render={<Link href={tool.href ?? '/'} target="_blank" rel="noreferrer" />}
        >
          {tool.label}
          <span className={newTabHint} aria-hidden="true">
            ↗
          </span>
        </MenuLinkItem>
      ))}
    </MenuGroup>
  );
}

function AccountGroup({ isAdmin }: { isAdmin: boolean }) {
  return (
    <MenuGroup label="Account">
      <MenuItem className={menuRow} onClick={() => startCharacterLink()}>
        Add character
      </MenuItem>
      <MenuLinkItem
        closeOnClick
        className={menuRow}
        render={<Link href="/settings" target="_blank" rel="noreferrer" />}
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
    </MenuGroup>
  );
}

function MenuFooter() {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border-soft px-3 py-2 font-data text-micro text-muted">
      <MenuLinkItem
        closeOnClick
        className="font-extrabold uppercase tracking-copy text-name outline-none data-[highlighted]:text-isk"
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
        className="outline-none transition-colors hover:text-isk data-[highlighted]:text-isk"
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
  deletedMaps = [],
  mapActionsAvailable = true,
}: {
  readonly session: Session | null;
  readonly contextualSection?: ReactNode;
  readonly corporations?: readonly CorporationAccessOption[];
  readonly deletedMaps?: readonly DeletedRestorableMapRow[];
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
  const trashOpenerRef = useRef<HTMLElement | null>(null);

  return (
    <div ref={ownerRef} tabIndex={-1} data-map-menu-owner className="outline-none">
      <Menu
        label={session ? `${session.name} — account menu` : 'Atlas menu'}
        trigger={
          session ? (
            <CharacterPortrait
              characterId={session.characterId}
              name={session.name}
              size={38}
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
        className="w-72 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-card"
        side="bottom"
        align="end"
        sideOffset={8}
      >
        {session ? <IdentityHeader session={session} /> : null}
        {mapActionsAvailable ? (
          <MenuGroup label="Map">
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
            {mapId ? <CopyMapLinkItem mapId={mapId} /> : null}
            <MenuItem
              closeOnClick
              className={menuRow}
              onClick={(event) => {
                trashOpenerRef.current = event.currentTarget;
                setStoredDialogs((current) => ({ ...current, trashOpen: true }));
              }}
            >
              Trash
              {deletedMaps.length > 0 ? (
                <span className="ml-auto font-data text-micro tabular-nums text-faint">
                  {deletedMaps.length}
                </span>
              ) : null}
            </MenuItem>
          </MenuGroup>
        ) : null}
        {contextualSection}
        <PageMenuSection />
        <ToolsGroup />
        {session ? <AccountGroup isAdmin={isAdmin} /> : null}
        <MenuFooter />
      </Menu>
      <MapLifecycleDialogs
        dialogs={dialogs}
        onDialogsChange={setStoredDialogs}
        corporations={corporations}
        deletedMaps={deletedMaps}
        creationOpenerRef={creationOpenerRef}
        trashOpenerRef={trashOpenerRef}
        hostRef={ownerRef}
      />
    </div>
  );
}
