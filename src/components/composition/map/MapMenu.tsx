'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { HamburgerGlyph } from '@/components/composition/HamburgerGlyph';
import { Menu, MenuItem, MenuLinkItem, menuRow } from '@/components/ui/menu';
import { navigationMenuLink } from '@/components/ui/navigation-menu';
import { visibleNavTools } from '@/data/tools/registry';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import type { DeletedRestorableMapRow } from '@/data/maps/queries';
import {
  closedMapDialogs,
  connectedDialogFocus,
  mapDialogAuthorityKey,
  reconcileAuthorityScopedMapDialogs,
} from '@/features/maps/map-dialog-state';
import { MapLifecycleDialogs } from '@/features/maps/MapLifecycleDialogs';

/**
 * Renders map-safe navigation and the creation door while external links open
 * away from the live atlas tab.
 */
export function MapMenu({
  corporations = [],
  deletedMaps = [],
  mapActionsAvailable = true,
}: {
  readonly corporations?: readonly CorporationAccessOption[];
  readonly deletedMaps?: readonly DeletedRestorableMapRow[];
  readonly mapActionsAvailable?: boolean;
}) {
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
        label="Atlas menu"
        trigger={<HamburgerGlyph />}
        triggerClassName="inline-flex size-10 cursor-pointer items-center justify-center rounded-ctl border border-border bg-section text-muted shadow-card transition-colors hover:border-border-active hover:text-name"
        popupProps={{ 'data-map-menu-panel': '' }}
        className="min-w-60"
        side="bottom"
        align="end"
        sideOffset={8}
      >
        <MenuLinkItem
          closeOnClick
          className={navigationMenuLink({ placement: 'menu' })}
          render={<Link href="/" target="_blank" rel="noreferrer" />}
        >
          <span className="font-data font-extrabold tracking-copy uppercase text-name">
            <span className="text-isk">[</span>
            <span className="px-[2px]">LGI</span>
            <span className="text-isk">]</span>
            <span className="text-muted font-normal">.tools</span>
          </span>
        </MenuLinkItem>
        {mapActionsAvailable ? (
          <>
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
              Create map
            </MenuItem>
            <MenuItem
              closeOnClick
              className={menuRow}
              onClick={(event) => {
                trashOpenerRef.current = event.currentTarget;
                setStoredDialogs((current) => ({ ...current, trashOpen: true }));
              }}
            >
              Trash{deletedMaps.length > 0 ? ` (${deletedMaps.length})` : ''}
            </MenuItem>
          </>
        ) : null}
        {visibleNavTools().map((tool) =>
          tool.href ? (
            <MenuLinkItem
              key={tool.label}
              closeOnClick
              className={navigationMenuLink({ placement: 'menu' })}
              render={
                <Link href={tool.href} target="_blank" rel="noreferrer" />
              }
            >
              {tool.label}
            </MenuLinkItem>
          ) : null,
        )}
        <MenuLinkItem
          data-map-menu-attribution
          href="https://reactflow.dev"
          target="_blank"
          rel="noopener noreferrer"
          closeOnClick
          className="block border-t border-border-soft px-3 py-2 font-data text-micro text-muted transition-colors hover:text-isk data-[highlighted]:text-isk"
        >
          Built with React Flow
        </MenuLinkItem>
      </Menu>
      <MapLifecycleDialogs
        creationOpen={dialogs.creationOpen}
        trashOpen={dialogs.trashOpen}
        onCreationOpenChange={(open) =>
          setStoredDialogs((current) => ({ ...current, creationOpen: open }))
        }
        onTrashOpenChange={(open) =>
          setStoredDialogs((current) => ({ ...current, trashOpen: open }))
        }
        corporations={corporations}
        deletedMaps={deletedMaps}
        creationFocus={() =>
          connectedDialogFocus(creationOpenerRef.current, ownerRef.current)
        }
        trashFocus={() =>
          connectedDialogFocus(trashOpenerRef.current, ownerRef.current)
        }
      />
    </div>
  );
}
