'use client';

import { type ReactNode, useId } from 'react';
import { Button } from './button';
import { Dialog, DialogClose, type DialogFocusTarget, DialogTitle } from './dialog';
import { CloseIcon } from './icons';
import { scrollArea } from './scroll-area';

/** A right-edge workspace panel with modal focus and nested-overlay support. */
export function SidePanel({ open, onOpenChange, title, children, finalFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  finalFocus?: DialogFocusTarget;
}) {
  const titleId = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      labelledBy={titleId}
      finalFocus={finalFocus}
      keepMounted
      className="left-auto right-0 top-0 flex h-dvh w-full max-w-[640px] translate-x-0 translate-y-0 flex-col rounded-none border-y-0 border-r-0 transition-[translate,opacity] data-[starting-style]:translate-x-full data-[starting-style]:scale-100 data-[ending-style]:translate-x-full data-[ending-style]:scale-100"
    >
      <header className="flex shrink-0 items-start justify-between gap-4 px-5 py-4">
        <DialogTitle id={titleId} className="font-display text-h2 font-bold text-name">
          {title}
        </DialogTitle>
        <DialogClose render={<Button variant="ghost" size="sm" />} aria-label="Close side panel">
          <CloseIcon size={14} />
        </DialogClose>
      </header>
      <div className={`${scrollArea} min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]`}>
        {children}
      </div>
    </Dialog>
  );
}
