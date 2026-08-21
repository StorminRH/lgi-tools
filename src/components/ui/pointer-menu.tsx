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

// Controlled menu positioned at a virtual pointer anchor — no trigger button.
// Used for right-click / long-press node menus where React Flow owns the
// contextmenu event and the house Menu's required Trigger would be a lie.

/**
 * Closed presentation vocabulary for pointer-menu tone; feature callers map domain
 * meaning to these abstract values before rendering.
 */
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

/**
 * Renders a controlled, triggerless menu at a virtual pointer anchor; callers own
 * open state and semantic content while this primitive owns presentation.
 */
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
  /** Virtual or element anchor; typically `pointerAnchor` (overlay-positioning) at the click. */
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
  // Inside an overlay the popup must share the overlay's stacking context;
  // outside one the context is null and the body-level portal is kept —
  // `container={null}` would disable the portal entirely.
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

/** Action row re-exported so callers stay on the house menu family. */
export { MenuItem, menuRow } from './menu';
