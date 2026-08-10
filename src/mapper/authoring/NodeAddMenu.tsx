'use client';

import { useId, useRef, useState } from 'react';
import { Dialog, DialogClose, DialogTitle } from '@/components/ui/dialog';
import {
  PointerMenu,
  MenuItem,
  menuRow,
  pointerAnchor,
  type MenuAnchor,
} from '@/components/ui/pointer-menu';
import { TerminalSearch } from '@/components/ui/terminal-search';
import {
  useSystemSearch,
  type SystemErr,
  type SystemParams,
} from '@/components/use-system-search';

/** One open node context-menu placement. */
export interface NodeMenuAnchor {
  readonly systemId: number;
  readonly clientX: number;
  readonly clientY: number;
}

/** Props for the node-bound add-connection menu and search dialog. */
export interface NodeAddMenuProps {
  readonly mapId: string;
  readonly menu: NodeMenuAnchor | null;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onAdd: (fromSystemId: number, toSystemId: number) => void;
}

/**
 * Pointer-anchored "Add connection…" menu plus a follow-up system search dialog.
 * Only the host opens the menu (from a node contextmenu event).
 */
export function NodeAddMenu({
  mapId,
  menu,
  onMenuOpenChange,
  onAdd,
}: NodeAddMenuProps) {
  const { parse, suggest } = useSystemSearch();
  const [searchOpen, setSearchOpen] = useState(false);
  const [fromSystemId, setFromSystemId] = useState<number | null>(null);
  const titleId = useId();
  // Dialog owns open-focus; without this the Close control (earlier in the
  // tree) wins and the operator has to click the field before typing.
  const searchInputRef = useRef<HTMLInputElement>(null);

  const anchor: MenuAnchor | null =
    menu === null ? null : pointerAnchor(menu.clientX, menu.clientY);

  return (
    <>
      <PointerMenu
        open={menu !== null}
        onOpenChange={onMenuOpenChange}
        anchor={anchor}
        label="Node actions"
        popupProps={{ 'data-map-node-add-menu': '', 'data-map-id': mapId }}
      >
        <MenuItem
          className={menuRow}
          onClick={() => {
            if (menu === null) return;
            setFromSystemId(menu.systemId);
            setSearchOpen(true);
          }}
        >
          Add connection…
        </MenuItem>
      </PointerMenu>
      <Dialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        labelledBy={titleId}
        initialFocus={searchInputRef}
        className="w-[min(24rem,calc(100vw-2rem))] p-4"
      >
        <div className="flex flex-col gap-3" data-map-node-add-search>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle
              id={titleId}
              className="font-display text-h3 font-semibold tracking-copy uppercase text-name"
            >
              Add connection
            </DialogTitle>
            <DialogClose className="font-ui text-nav text-muted hover:text-name">
              ×
            </DialogClose>
          </div>
          <p className="font-ui text-ui leading-relaxed text-muted">
            Pick a destination system. Loops back to systems already on the map
            are allowed.
          </p>
          <TerminalSearch<SystemParams, SystemErr>
            initialValue=""
            placeholder="Destination system — type a name"
            parse={parse}
            suggest={suggest}
            inputRef={searchInputRef}
            errorMessage={() => 'No system matches that name.'}
            onSubmit={(params) => {
              if (fromSystemId === null) return;
              onAdd(fromSystemId, params.system.id);
              setSearchOpen(false);
              setFromSystemId(null);
            }}
            onClear={() => undefined}
            errorLabel="System"
          />
        </div>
      </Dialog>
    </>
  );
}
