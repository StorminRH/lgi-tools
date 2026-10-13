'use client';

import { useId, useRef, useState } from 'react';
import { Dialog, DialogCloseButton, DialogTitle } from '@/components/ui/dialog';
import {
  PointerMenu,
  MenuItem,
  menuRow,
  type MenuAnchor,
} from '@/components/ui/pointer-menu';
import { pointerAnchor } from '@/components/ui/overlay-positioning';
import { displayTitle } from '@/components/ui/type-roles';
import { SystemTerminalSearch } from './system-terminal-search';

export interface NodeMenuAnchor {
  readonly systemId: number;
  readonly clientX: number;
  readonly clientY: number;
}

export interface NodeAddMenuProps {
  readonly mapId: string;
  readonly menu: NodeMenuAnchor | null;
  readonly onMenuOpenChange: (open: boolean) => void;
  readonly onAdd: (fromSystemId: number, toSystemId: number) => void;
}

export function NodeAddMenu({
  mapId,
  menu,
  onMenuOpenChange,
  onAdd,
}: NodeAddMenuProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [fromSystemId, setFromSystemId] = useState<number | null>(null);
  const titleId = useId();
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
            <DialogTitle id={titleId} className={displayTitle({ size: 'h3' })}>
              Add connection
            </DialogTitle>
            <DialogCloseButton label="Close add connection" />
          </div>
          <SystemTerminalSearch
            placeholder="Destination system"
            inputRef={searchInputRef}
            excludeSystemId={fromSystemId ?? undefined}
            onPick={(toSystemId) => {
              if (fromSystemId === null) return;
              onAdd(fromSystemId, toSystemId);
              setSearchOpen(false);
              setFromSystemId(null);
            }}
          />
        </div>
      </Dialog>
    </>
  );
}
