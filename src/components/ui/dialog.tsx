'use client';

import { Dialog as Base } from '@base-ui/react/dialog';
import { cva } from 'class-variance-authority';
import type { ReactNode, RefObject } from 'react';
import { cn } from './cn';
import type { Tone } from './tones';

// The platform's one modal-overlay primitive — the idiomatic Base UI Dialog,
// styled to the existing tone tokens. `modal` (Base UI's default) gives focus
// trap, scroll lock, Escape, and outside-press dismiss for free; the enter/exit
// scale+fade is CSS via Base UI's `data-[starting-style]`/`data-[ending-style]`
// attributes (no keyframes, no hand-rolled phase machine — Base UI keeps the
// popup mounted through the exit transition, then unmounts). Controlled: the
// caller owns the `open` state, so the dialog can be opened by anything (a
// sibling element, a programmatic trigger), not just a Base UI `Trigger`. Used by
// the `/sites` card lightbox today; reusable anywhere a centred modal is wanted.

export type DialogTone = Extract<Tone, 'neutral'>;

// Abstract tone → token classes (no raw hex). `neutral` is the raised-slate
// surface (matches the shared Modal box). Centring uses fixed + translate (a
// dialog isn't anchored, so no Positioner / `--transform-origin`); the scale
// animates the standalone CSS `scale` property — hence `transition-[scale,...]`,
// not `transition-[transform,...]` (Tailwind v4 emits `translate`/`scale` as
// separate properties, so a constant centre-translate composes with the scale).
const popup = cva(
  'fixed left-1/2 top-1/2 z-overlay -translate-x-1/2 -translate-y-1/2 outline-none ' +
    'transition-[scale,opacity] duration-panel ease-panel ' +
    'data-[starting-style]:scale-[0.92] data-[starting-style]:opacity-0 ' +
    'data-[ending-style]:scale-[0.92] data-[ending-style]:opacity-0 motion-reduce:transition-none',
  {
    variants: {
      tone: {
        neutral: 'bg-section border border-border text-text font-mono rounded-card',
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
  // Controlled open state. The caller owns it (and the close, via onOpenChange).
  open: boolean;
  // Called on every open/close request — Escape, outside-press, and a Close
  // button all funnel here. (Base UI's two-arg signature is collapsed to the
  // boolean so `setOpen` can pass directly.)
  onOpenChange?: (open: boolean) => void;
  // Accessible name for the dialog (an element id rendered inside the popup).
  labelledBy?: string;
  children: ReactNode;
  tone?: DialogTone;
  // Extra classes merged onto the popup (sizing, feature look).
  className?: string;
  // Where focus returns on close. Pass the opener when there's no Base UI
  // Trigger to restore to (the default would guess "previously focused").
  finalFocus?: RefObject<HTMLElement | null>;
  // Where focus moves on open (default: first tabbable element, or the popup on
  // touch to avoid the virtual keyboard).
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <Base.Root open={open} onOpenChange={(next) => onOpenChange?.(next)} modal>
      <Base.Portal>
        <Base.Backdrop className="fixed inset-0 z-overlay bg-black/60 backdrop-blur-sm transition-opacity duration-panel data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <Base.Popup
          aria-labelledby={labelledBy}
          finalFocus={finalFocus}
          initialFocus={initialFocus}
          className={cn(popup({ tone }), className)}
        >
          {children}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}

/**
 * Re-exported so consumers compose the dialog's close affordance through
 * `@/components/ui/dialog` without reaching for the raw Base UI import.
 */
export const DialogClose = Base.Close;
export const DialogTitle = Base.Title;
export const DialogDescription = Base.Description;
