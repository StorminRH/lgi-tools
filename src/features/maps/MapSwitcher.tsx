'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Menu, MenuItem, menuRow } from '@/components/ui/menu';
import type {
  CorporationAccessOption,
  MapAccessGrantOption,
} from '@/data/maps/access-contract';
import type { AuthorizedMapRow } from '@/data/maps/queries';
import { MapAccessDialog } from './MapAccessDialog';
import {
  closedMapDialogs,
  connectedDialogFocus,
  currentAdminMap,
  mapDialogAuthorityKey,
  reconcileAuthorityScopedMapDialogs,
} from './map-dialog-state';
import { mapSelectionHref } from './map-navigation';

function CogGlyph() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-[18px] stroke-current" fill="none">
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 2.5v2M9 13.5v2M2.5 9h2M13.5 9h2M4.4 4.4l1.4 1.4M12.2 12.2l1.4 1.4M13.6 4.4l-1.4 1.4M5.8 12.2l-1.4 1.4" />
    </svg>
  );
}

/**
 * Renders the selected map name as Atlas's top-center switcher and opens the
 * shared access-management door for maps where the listing reports admin.
 */
export function MapSwitcher({
  maps,
  corporations,
  grantsByMapId,
  focusFallback,
}: {
  readonly maps: readonly AuthorizedMapRow[];
  readonly corporations: readonly CorporationAccessOption[];
  readonly grantsByMapId: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
  readonly focusFallback?: React.RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('map');
  const selected = maps.find((map) => map.id === selectedId);
  const refreshedMissingId = useRef<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const authorityKey = mapDialogAuthorityKey(true, maps);
  const [storedDialogs, setStoredDialogs] = useState(() =>
    closedMapDialogs(authorityKey),
  );
  const dialogs = reconcileAuthorityScopedMapDialogs(storedDialogs, authorityKey);
  if (dialogs !== storedDialogs) setStoredDialogs(dialogs);
  const currentEditingMap = currentAdminMap(maps, dialogs.editingMapId);

  useEffect(() => {
    if (
      selectedId !== null &&
      selected === undefined &&
      refreshedMissingId.current !== selectedId
    ) {
      refreshedMissingId.current = selectedId;
      router.refresh();
    }
  }, [router, selected, selectedId]);

  if (selected === undefined) return null;

  return (
    <>
      <Menu
        label={`Switch map from ${selected.name}`}
        trigger={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{selected.name}</span>
            <span aria-hidden className="font-data text-label text-faint">⌄</span>
          </span>
        }
        triggerProps={{
          ref: triggerRef,
          'data-map-switcher-trigger': '',
          'data-map-id': selected.id,
        }}
        popupProps={{ 'data-map-switcher-panel': '' }}
        triggerClassName="glass-panel-faint flex h-10 max-w-80 cursor-pointer items-center rounded-card border border-border-idle px-3.5 font-display text-h3 font-bold tracking-copy text-name shadow-dd outline-none transition-colors hover:border-border-active focus-visible:border-border-active focus-visible:ring-1 focus-visible:ring-isk-sub"
        className="grid min-w-72 grid-cols-[minmax(0,1fr)_auto] rounded-card p-[5px]"
        surface="frosted"
        side="bottom"
        align="center"
        sideOffset={8}
      >
        {maps.map((map) => (
          <div key={map.id} className="col-span-2 grid grid-cols-subgrid">
            <MenuItem
              closeOnClick
              aria-current={map.id === selected.id ? 'page' : undefined}
              data-map-switcher-map={map.id}
              className={`${menuRow} min-w-0 rounded-l-ctl ${
                map.id === selected.id ? 'bg-row-active text-name' : ''
              }`}
              onClick={() => {
                if (map.id !== selected.id) {
                  router.push(mapSelectionHref(pathname, searchParams, map.id));
                }
              }}
            >
              <span className="truncate">{map.name}</span>
            </MenuItem>
            {map.role === 'admin' ? (
              <MenuItem
                closeOnClick
                aria-label={`Manage ${map.name}`}
                data-map-switcher-manage={map.id}
                className="flex cursor-pointer items-center rounded-r-ctl px-2.5 text-muted outline-none data-[highlighted]:bg-row-active data-[highlighted]:text-name"
                onClick={() =>
                  setStoredDialogs((current) => ({
                    ...current,
                    editingMapId: map.id,
                  }))
                }
              >
                <CogGlyph />
              </MenuItem>
            ) : (
              <span aria-hidden />
            )}
          </div>
        ))}
      </Menu>
      {dialogs.editingMapId !== null ? (
        <MapAccessDialog
          key={dialogs.editingMapId}
          mapId={dialogs.editingMapId}
          mapName={currentEditingMap?.name ?? 'map'}
          open={currentEditingMap !== null}
          finalFocus={() =>
            connectedDialogFocus(triggerRef.current, focusFallback?.current)
          }
          onOpenChange={(open) => {
            if (!open) {
              setStoredDialogs((current) => ({ ...current, editingMapId: null }));
            }
          }}
          corporations={corporations}
          initialGrants={
            currentEditingMap === null
              ? []
              : grantsByMapId[currentEditingMap.id] ?? []
          }
        />
      ) : null}
    </>
  );
}
