'use client';

import { Dialog as Base } from '@base-ui/react/dialog';
import { cva } from 'class-variance-authority';
import {
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react';
import { Button } from './button';
import { cn } from './cn';
import { OverlayPortalContainerProvider } from './overlay-portal-container';
import type { Tone } from './tones';

export type DialogTone = Extract<Tone, 'neutral'>;

export type DialogFocusTarget = ComponentProps<typeof Base.Popup>['finalFocus'];

const popup = cva(
  'fixed left-1/2 top-1/2 z-overlay -translate-x-1/2 -translate-y-1/2 outline-none ' +
    'transition-[scale,opacity] duration-panel ease-panel ' +
    'data-[starting-style]:scale-[0.92] data-[starting-style]:opacity-0 ' +
    'data-[ending-style]:scale-[0.92] data-[ending-style]:opacity-0 motion-reduce:transition-none',
  {
    variants: {
      tone: {
        neutral: 'bg-section border border-border text-text font-ui rounded-card',
      } satisfies Record<DialogTone, string>,
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Dialog({
  open,
  onOpenChange,
  labelledBy,
  children,
  tone = 'neutral',
  className,
  finalFocus,
  initialFocus,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  labelledBy?: string;
  children: ReactNode;
  tone?: DialogTone;
  className?: string;
  finalFocus?: DialogFocusTarget;
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  const [popupEl, setPopupEl] = useState<HTMLDivElement | null>(null);

  return (
    <Base.Root open={open} onOpenChange={(next) => onOpenChange?.(next)} modal>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 z-overlay bg-black/60 backdrop-blur-sm transition-opacity duration-panel data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <Base.Popup
          ref={setPopupEl}
          {...(labelledBy !== undefined ? { 'aria-labelledby': labelledBy } : {})}
          finalFocus={finalFocus}
          initialFocus={initialFocus}
          className={cn(popup({ tone }), className)}
        >
          <OverlayPortalContainerProvider container={popupEl}>
            {children}
          </OverlayPortalContainerProvider>
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

export const DialogClose = Base.Close;
export const DialogTitle = Base.Title;
export const DialogDescription = Base.Description;

export function DialogHeader({
  titleId,
  title,
  description,
  closeLabel,
}: {
  titleId: string;
  title: ReactNode;
  description: ReactNode;
  closeLabel: string;
}) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-border-soft px-4 py-3">
      <div className="flex flex-col gap-1">
        <DialogTitle
          id={titleId}
          className="font-display text-h2 font-semibold tracking-copy uppercase text-name"
        >
          {title}
        </DialogTitle>
        <DialogDescription className="font-ui text-ui text-muted">
          {description}
        </DialogDescription>
      </div>
      <DialogClose render={<Button variant="ghost" size="sm" />} aria-label={closeLabel}>
        ×
      </DialogClose>
    </header>
  );
}
