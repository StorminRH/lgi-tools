'use client';

import { Menu as Base } from '@base-ui/react/menu';
import type { ReactNode } from 'react';
import {
  MenuPopup,
  type DataAttributes,
  type MenuAnchor,
  type PopupProps,
  type PositionerProps,
} from './menu';

export type { MenuAnchor };

export function PointerMenu({
  open,
  onOpenChange,
  anchor,
  children,
  label,
  side = 'bottom',
  align = 'start',
  sideOffset = 4,
  modal = false,
  popupProps,
  finalFocus,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: MenuAnchor | null;
  children: ReactNode;
  label: string;
  side?: PositionerProps['side'];
  align?: PositionerProps['align'];
  sideOffset?: PositionerProps['sideOffset'];
  modal?: boolean;
  popupProps?: DataAttributes;
  finalFocus?: PopupProps['finalFocus'];
  className?: string;
}) {
  return (
    <Base.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <MenuPopup
        label={label}
        surface="frosted"
        side={side}
        align={align}
        sideOffset={sideOffset}
        anchor={anchor ?? undefined}
        popupProps={popupProps}
        finalFocus={finalFocus}
        className={className}
      >
        {children}
      </MenuPopup>
    </Base.Root>
  );
}

export { MenuItem, menuRow } from './menu';
