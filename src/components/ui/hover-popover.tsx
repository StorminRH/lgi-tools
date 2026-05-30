'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn';

// Reusable hover/focus popover. One correct implementation for the whole
// platform — the price-freshness chip, the planner's material-price chips, and
// (future) the /sites resource preview. It owns its accessibility and
// interaction so call sites don't each reinvent (and re-break) them:
//
//  - opens on pointer hover AND keyboard focus; the trigger is focusable;
//  - closes on leave/blur after a short delay, and on Escape;
//  - the panel is associated via `aria-describedby` and is NOT `aria-hidden`,
//    so a screen reader announces it when the trigger is focused (the bug the
//    old price-chip popover had);
//  - no invisible click-catching bridge element — the close delay covers the
//    gap between trigger and panel, so nothing underneath swallows clicks (the
//    other old price-chip bug).
//
// Positioning + chrome are CSS (.hover-popover* in globals.css); no inline
// styles, per the CSP.
export function HoverPopover({
  trigger,
  children,
  placement = 'bottom',
  label,
  className,
  panelClassName,
  triggerClassName,
  onOpenChange,
}: {
  trigger: ReactNode;
  children: ReactNode;
  // 'bottom' centers below; 'right' opens to the right.
  placement?: 'bottom' | 'right';
  // Accessible name for the popover region (it has role="tooltip").
  label?: string;
  className?: string;
  panelClassName?: string;
  triggerClassName?: string;
  // Notified whenever the open state changes — e.g. so a consumer can run a
  // live countdown only while the panel is visible.
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  const setOpenState = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const cancelClose = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpenState(true);
  };
  const closeNow = () => {
    cancelClose();
    setOpenState(false);
  };
  // Delay close so moving the cursor across the trigger→panel gap (or between
  // the two) doesn't snap it shut — re-entering cancels the pending close.
  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => setOpenState(false), 90);
  };

  return (
    <span
      className={cn('hover-popover', className)}
      onPointerEnter={openNow}
      onPointerLeave={scheduleClose}
      onFocusCapture={openNow}
      onBlurCapture={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') closeNow();
      }}
    >
      <span
        className={cn('hover-popover-trigger', triggerClassName)}
        tabIndex={0}
        aria-describedby={panelId}
      >
        {trigger}
      </span>
      <span
        id={panelId}
        role="tooltip"
        aria-label={label}
        data-placement={placement}
        data-open={open ? 'true' : undefined}
        className={cn('hover-popover-panel', panelClassName)}
      >
        {children}
      </span>
    </span>
  );
}
