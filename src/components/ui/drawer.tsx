'use client';

import { Drawer as Base } from '@base-ui/react/drawer';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { scrollArea } from './scroll-area';

/**
 * The edge-anchored sheet: a bottom drawer for small-screen composition a centred dialog cannot
 * serve. It is uncontrolled by construction so the real trigger owns focus movement and restore.
 */
export function Drawer({
  title,
  trigger,
  triggerClassName,
  className,
  children,
}: {
  title: string;
  trigger: ReactNode;
  triggerClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Base.Root swipeDirection="down">
      <Base.Trigger
        type="button"
        data-drawer-trigger
        className={triggerClassName}
      >
        {trigger}
      </Base.Trigger>
      <Base.Portal>
        <Base.Backdrop
          data-drawer-backdrop
          className="fixed inset-0 z-overlay min-h-dvh bg-backdrop-dim opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-panel ease-panel data-swiping:transition-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:duration-0 motion-reduce:transition-none supports-[-webkit-touch-callout:none]:absolute"
        />
        <Base.Viewport className="fixed inset-0 z-overlay flex items-end justify-center">
          <Base.Popup
            data-drawer-popup
            className={cn(
              scrollArea,
              'max-h-[75dvh] w-full overflow-y-auto overscroll-contain rounded-t-card border border-b-0 border-border bg-section px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3 text-text shadow-dd outline-hidden touch-auto',
              '[transform:translateY(var(--drawer-swipe-movement-y))] transition-transform duration-panel ease-panel data-swiping:select-none data-swiping:transition-none',
              'data-ending-style:[transform:translateY(calc(100%+2px))] data-starting-style:[transform:translateY(calc(100%+2px))] motion-reduce:duration-0 motion-reduce:transition-none',
              className,
            )}
          >
            <div
              className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-active"
              aria-hidden="true"
            />
            <Base.Content data-drawer-content>
              <Base.Title className="mb-3 font-ui text-h3 font-semibold text-name">
                {title}
              </Base.Title>
              {children}
            </Base.Content>
          </Base.Popup>
        </Base.Viewport>
      </Base.Portal>
    </Base.Root>
  );
}

/**
 * Adopted Base UI drawer close part exposed through the house wrapper so consumers close the
 * uncontrolled sheet without reaching into the package.
 */
export const DrawerClose = Base.Close;
