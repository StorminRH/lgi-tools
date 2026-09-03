'use client';

import type { RefObject } from 'react';
import { pointerAnchor } from '@/components/ui/overlay-positioning';
import { MenuItem, menuRow, PointerMenu } from '@/components/ui/pointer-menu';
import type { EdgeMenuAnchor } from './edge-menu';

export interface EdgeContextMenuProps {
  readonly menu: EdgeMenuAnchor | null;
  readonly finalFocus?: RefObject<HTMLElement | null>;
  readonly onEdit: (anchor: EdgeMenuAnchor) => void;
  readonly onDelete: (anchor: EdgeMenuAnchor) => void;
  readonly onOpenChange: (open: boolean) => void;
}

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
