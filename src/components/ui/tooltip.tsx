'use client';

import { Tooltip as Base } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';
import { cn } from './cn';
import { panelSurface } from './dropdown-panel';

type PositionerProps = React.ComponentProps<typeof Base.Positioner>;

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
  side?: PositionerProps['side'];
  align?: PositionerProps['align'];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Base.Provider delay={250} closeDelay={80}>
      <Base.Root disabled={disabled}>
        <Base.Trigger render={children} />
        <Base.Portal>
          <Base.Positioner side={side} align={align} sideOffset={8} className="z-dropdown">
            <Base.Popup
              className={cn(
                panelSurface,
                'max-w-[260px] rounded-card px-3 py-2 font-mono text-label leading-relaxed text-text outline-none ' +
                  'origin-[var(--transform-origin)] transition-[opacity,transform] duration-fast ' +
                  'data-[starting-style]:scale-95 data-[starting-style]:opacity-0 ' +
                  'data-[ending-style]:scale-95 data-[ending-style]:opacity-0 motion-reduce:transition-none',
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
