'use client';

// The connection line's right-click menu (ruling D-F): Edit opens the map's
// one Signature Editor, Delete severs through the shipped undo pathway.
//
// Composed from the existing PointerMenu + pointerAnchor primitives rather
// than Base UI's ContextMenu: that primitive's Trigger is a `<div>` area and
// cannot wrap a React Flow SVG edge, and it is hard-wired modal, which would
// lock the map behind the menu.
import type { RefObject } from 'react';
import { pointerAnchor } from '@/components/ui/overlay-positioning';
import { MenuItem, menuRow, PointerMenu } from '@/components/ui/pointer-menu';
import type { EdgeMenuAnchor } from './edge-menu';

/** Props for the connection line's authoring context menu. */
export interface EdgeContextMenuProps {
  readonly menu: EdgeMenuAnchor | null;
  readonly finalFocus?: RefObject<HTMLElement | null>;
  readonly onEdit: (anchor: EdgeMenuAnchor) => void;
  readonly onDelete: (anchor: EdgeMenuAnchor) => void;
  readonly onOpenChange: (open: boolean) => void;
}

/** Renders Edit / Delete at the pointer for one right-clicked connection. */
export function EdgeContextMenu({
  menu,
  finalFocus,
  onEdit,
  onDelete,
  onOpenChange,
}: EdgeContextMenuProps) {
  return (
    <PointerMenu
      open={menu !== null}
      onOpenChange={onOpenChange}
      anchor={menu === null ? null : pointerAnchor(menu.clientX, menu.clientY)}
      label="Connection actions"
      className="min-w-40"
      popupProps={{ 'data-map-edge-menu': '' }}
      finalFocus={finalFocus}
    >
      <MenuItem
        className={menuRow}
        onClick={() => {
          if (menu !== null) onEdit(menu);
        }}
      >
        Edit
      </MenuItem>
      <MenuItem
        className={menuRow}
        onClick={() => {
          if (menu !== null) onDelete(menu);
        }}
      >
        Delete
      </MenuItem>
    </PointerMenu>
  );
}
