'use client';

import { Menu as Base } from '@base-ui/react/menu';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { panelSurface } from './dropdown-panel';
import type { DataAttributes, MenuAnchor, PositionerProps } from './menu';
import { useOverlayPortalContainer } from './overlay-portal-container';
import type { Tone } from './tones';

export type { MenuAnchor };

export type PointerMenuTone = Extract<Tone, 'neutral'>;

const popup = cva(cn('flex flex-col outline-none', panelSurface), {
  variants: {
    tone: {
      neutral: '',
    } satisfies Record<PointerMenuTone, string>,
  },
  defaultVariants: { tone: 'neutral' },
});

export type PopupProps = React.ComponentProps<typeof Base.Popup>;

export function PointerMenu({
  open,
  onOpenChange,
  anchor,
  children,
  label,
  tone = 'neutral',
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
  tone?: PointerMenuTone;
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
            className={cn(popup({ tone }), className)}
          >
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

export { MenuItem, menuRow } from './menu';
