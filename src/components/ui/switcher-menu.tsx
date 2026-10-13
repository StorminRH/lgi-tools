import type { ReactNode } from 'react';
import { floatSurface } from './card';
import { cn } from './cn';
import { Menu, type DataAttributes, type MenuTriggerProps, type PositionerProps } from './menu';
import { scrollArea } from './scroll-area';

/**
 * The record switcher: a floating glass pill that names the open record with
 * a ⌄ mark and opens a frosted list that scrolls past 24rem. Callers own the
 * rows, including the `aria-current` value that marks the open one, and the
 * panel layout (`className`), which merges last so it can make the panel a grid.
 */
export function SwitcherMenu({
  label,
  current,
  align = 'start',
  className,
  triggerProps,
  popupProps,
  children,
}: {
  label: string;
  current: string;
  align?: PositionerProps['align'];
  className?: string;
  triggerProps?: MenuTriggerProps;
  popupProps?: DataAttributes;
  children: ReactNode;
}) {
  return (
    <Menu
      label={label}
      trigger={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{current}</span>
          <span aria-hidden className="font-data text-label text-faint">⌄</span>
        </span>
      }
      triggerProps={triggerProps}
      popupProps={popupProps}
      triggerClassName={cn(
        floatSurface,
        'flex h-10 w-max max-w-full min-w-0 cursor-pointer items-center rounded-full px-4 font-display text-h3 font-bold tracking-copy text-name outline-none transition-colors hover:border-border-active focus-visible:border-border-active',
      )}
      className={cn(
        scrollArea,
        'rounded-card p-[5px] max-h-[min(24rem,var(--available-height))] overflow-y-auto overscroll-contain',
        className,
      )}
      surface="frosted"
      side="bottom"
      align={align}
      sideOffset={8}
    >
      {children}
    </Menu>
  );
}
