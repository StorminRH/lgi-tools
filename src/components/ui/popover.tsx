'use client';

import { Popover as Base } from '@base-ui/react/popover';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { panelSurface } from './dropdown-panel';
import type { Tone } from './tones';

// The platform's one hover/tap/focus help-panel primitive — the idiomatic Base
// UI Popover, styled to the existing tone tokens. A Popover (not a Tooltip) is
// the right component for a "?" info icon: per Base UI's own guidance the trigger
// exists to OPEN the panel, so the content must be reachable by touch and screen
// readers — which a tooltip is not (it never opens on tap). `openOnHover` keeps
// the desktop hover feel; press/Enter open it on touch + keyboard, Escape and
// outside-press dismiss, and the panel is a labelled dialog. Used by every "?"
// help glyph today; reusable anywhere a hover/tap hint is wanted via `tone`.

export type PopoverTone = Extract<Tone, 'neutral' | 'green'>;

// Abstract tone → token classes (no raw hex at the call site; the green-glow
// shadow uses rgba, which the hex-only lint rule permits). `neutral` wears the
// shared dropdown-panel SURFACE (from dropdown-panel.ts) so the "?" help panels
// match the Select popup and the menus; `green` is the data-quality tint, kept as
// its own semantic look. The base keeps the popover's content padding + open/close
// animation (the shared surface is colours/border/shadow only).
const popup = cva(
  'flex w-[272px] flex-col gap-3 rounded-card border px-[14px] py-[12px] text-ui normal-case tracking-normal outline-none ' +
    'origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 motion-reduce:transition-none ' +
    'data-[starting-style]:scale-95 data-[starting-style]:opacity-0 ' +
    'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
  {
    variants: {
      tone: {
        neutral: `${panelSurface} text-text`,
        green:
          'bg-section text-text border-isk-dim ' +
          'shadow-[0_0_0_1px_rgba(61,214,140,0.12),0_8px_24px_-8px_rgba(61,214,140,0.2)]',
      } satisfies Record<PopoverTone, string>,
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Popover({
  trigger,
  children,
  label,
  tone = 'neutral',
  side = 'bottom',
  openOnHover = true,
  onOpenChange,
  triggerClassName,
  className,
}: {
  // The visible content of the trigger button (e.g. the "?" glyph).
  trigger: ReactNode;
  // The panel content.
  children: ReactNode;
  // Accessible name for both the trigger and the popup dialog. Required: the
  // trigger is often an icon (or empty) and the popup is a dialog, so without it
  // they'd ship unnamed in the accessibility tree.
  label: string;
  tone?: PopoverTone;
  side?: 'top' | 'bottom' | 'left' | 'right';
  // Opens on hover in addition to press/focus (the info-icon default). Set false
  // for a click-only popover.
  openOnHover?: boolean;
  // Open-state observer (Base UI's own callback) — for consumers that refresh
  // their panel data on open. The popover stays uncontrolled.
  onOpenChange?: (open: boolean) => void;
  // Classes for the trigger button (the glyph/badge styling lives at the call
  // site, like the abstract-tone pattern across the UI primitives).
  triggerClassName?: string;
  // Extra classes merged onto the popup (e.g. a width override).
  className?: string;
}) {
  return (
    // Non-modal: no scroll-lock or focus-trap for a lightweight info panel.
    <Base.Root modal={false} onOpenChange={onOpenChange}>
      {/* delay/closeDelay match the old instant-open / 90ms-close feel; the
          trigger is a native, focusable <button> that opens on hover, press,
          and keyboard. */}
      <Base.Trigger
        type="button"
        aria-label={label}
        openOnHover={openOnHover}
        delay={0}
        closeDelay={90}
        className={triggerClassName}
      >
        {trigger}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner side={side} sideOffset={8} className="z-50">
          <Base.Popup aria-label={label} className={cn(popup({ tone }), className)}>
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

// The panel's green terminal-style header. Pairs with the rows below; the popup
// itself supplies the chrome + gap-3 rhythm.
export function PopoverHeading({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-label font-semibold uppercase tracking-[0.16em] text-isk">
      {children}
    </div>
  );
}

// A "Label — description" row: bright bold label, em dash, then muted body text.
// Put the concrete value in parentheses, e.g.
// <PopoverRow label="Liquidity">how fast a batch sells (≈ 3 days to clear)</PopoverRow>.
export function PopoverRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="font-body text-body leading-snug text-muted">
      <span className="font-semibold text-text">{label}</span> — {children}
    </p>
  );
}
