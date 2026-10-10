'use client';

import { Menu as Base } from '@base-ui/react/menu';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { panelSurface } from './dropdown-panel';
import type { DataAttributes, MenuAnchor, PositionerProps } from './menu';
import { useOverlayPortalContainer } from './overlay-portal-container';

export type { MenuAnchor };

const popup = cn('flex flex-col outline-none', panelSurface);

export type PopupProps = React.ComponentProps<typeof Base.Popup>;

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
  const overlayContainer = useOverlayPortalContainer();
  return (
    <Base.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Base.Portal {...(overlayContainer ? { container: overlayContainer } : {})}>
        <Base.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          anchor={anchor ?? undefined}
          className="z-dropdown"
        >
          <Base.Popup
            {...popupProps}
            aria-label={label}
            finalFocus={finalFocus}
            className={cn(popup, className)}
          >
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

export { MenuItem, menuRow } from './menu';
