'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MenuItem, menuRow } from '@/components/ui/menu';
import { SwitcherMenu } from '@/components/ui/switcher-menu';
import type {
  CorporationAccessOption,
  MapAccessGrantOption,
  MapBlockOption,
} from '@/data/maps/access-contract';
import type { AuthorizedMapRow } from '@/data/maps/queries';
import { MapAccessDialog } from './MapAccessDialog';
import {
  closedMapDialogs,
  connectedDialogFocus,
  currentAdminMap,
  editingMapRows,
  mapDialogAuthorityKey,
  reconcileAuthorityScopedMapDialogs,
} from './map-dialog-state';
import { mapSelectionHref } from './map-navigation';

function CogGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-[18px] stroke-current"
      fill="none"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function MapSwitcher({
  maps,
  corporations,
  grantsByMapId,
  blocksByMapId,
  focusFallback,
}: {
  readonly maps: readonly AuthorizedMapRow[];
  readonly corporations: readonly CorporationAccessOption[];
  readonly grantsByMapId: Readonly<Record<string, readonly MapAccessGrantOption[]>>;
  readonly blocksByMapId: Readonly<Record<string, readonly MapBlockOption[]>>;
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
      <SwitcherMenu
        label={`Switch map from ${selected.name}`}
        current={selected.name}
        align="center"
        triggerProps={{
          ref: triggerRef,
          'data-map-switcher-trigger': '',
          'data-map-id': selected.id,
        }}
        popupProps={{ 'data-map-switcher-panel': '' }}
        className="grid min-w-72 grid-cols-[minmax(0,1fr)_auto]"
      >
        {maps.map((map) => (
          <div key={map.id} className="col-span-2 grid grid-cols-subgrid">
            <MenuItem
              closeOnClick
              aria-current={map.id === selected.id ? 'page' : undefined}
              data-map-switcher-map={map.id}
              className={`${menuRow} min-w-0 rounded-l-ctl ${
                map.id === selected.id ? 'bg-row-on text-name' : ''
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
                className="flex cursor-pointer items-center rounded-r-ctl px-2.5 text-muted outline-none data-[highlighted]:bg-row-on data-[highlighted]:text-name"
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
      </SwitcherMenu>
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
          initialGrants={editingMapRows(grantsByMapId, currentEditingMap)}
          initialBlocks={editingMapRows(blocksByMapId, currentEditingMap)}
        />
      ) : null}
    </>
  );
}
