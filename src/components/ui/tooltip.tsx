'use client';

import { Tooltip as Base } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import { cn } from './cn';
import { panelSurface, popIn } from './dropdown-panel';
import { useOverlayPortalContainer } from './overlay-portal-container';

export type TooltipPositionerProps = React.ComponentProps<typeof Base.Positioner>;

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  disabled,
  className,
}: {
  content: ReactNode;
  children: ReactElement;
  side?: TooltipPositionerProps['side'];
  align?: TooltipPositionerProps['align'];
  disabled?: boolean;
  className?: string;
}) {
  const overlayContainer = useOverlayPortalContainer();
  return (
    <Base.Provider delay={250} closeDelay={80}>
      <Base.Root disabled={disabled}>
        <Base.Trigger render={children} />
        <Base.Portal container={overlayContainer}>
          <Base.Positioner side={side} align={align} sideOffset={8} className="z-dropdown">
            <Base.Popup
              className={cn(
                panelSurface,
                'max-w-[260px] rounded-card px-3 py-2 font-ui text-label leading-relaxed text-text outline-none',
                popIn,
                className,
              )}
            >
              {content}
              <Base.Arrow className="fill-border-active" />
            </Base.Popup>
          </Base.Positioner>
        </Base.Portal>
      </Base.Root>
    </Base.Provider>
  );
}
