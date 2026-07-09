'use client';

import { Menu as Base } from '@base-ui/react/menu';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import type { Tone } from './tones';

// The platform's one click/tap-toggled dropdown-menu primitive — the idiomatic
// Base UI Menu, styled to the existing tone tokens. The trigger is a native
// <button>; the popup is portaled to <body> and positioned by Floating UI
// against the trigger (or any element via `anchor`), and holds `MenuLinkItem`
// navigation rows. Base UI supplies roving arrow-key focus + typeahead over the
// items, focus-into-popup on open / restore-to-trigger on close, and Esc +
// outside-press dismiss — none hand-rolled. `MenuLinkItem closeOnClick` closes
// the menu on select (so a menu whose trigger persists across navigations doesn't
// stay open on the new page). Backs the mobile nav hamburger today; reusable
// anywhere a dropdown of links is wanted via `tone`.

export type MenuTone = Extract<Tone, 'neutral'>;

// Abstract tone → token classes. Intentionally structural — this primitive's
// surface is supplied by the call site's `className` (the nav panel's look lives
// in globals.css `.nav-menu-panel`), matching the codebase's call-site-styling
// philosophy. The base owns layout (vertical stack) + focus reset; add a richer
// tone when a real second consumer needs one.
const popup = cva('flex flex-col outline-none', {
  variants: {
    tone: {
      neutral: '',
    } satisfies Record<MenuTone, string>,
  },
  defaultVariants: { tone: 'neutral' },
});

type PositionerProps = React.ComponentProps<typeof Base.Positioner>;

export function Menu({
  trigger,
  children,
  label,
  tone = 'neutral',
  side = 'bottom',
  align = 'end',
  sideOffset = 0,
  anchor,
  modal = false,
  triggerClassName,
  className,
}: {
  // The visible content of the trigger button (e.g. the hamburger glyph).
  trigger: ReactNode;
  // The popup content — `MenuLinkItem`s and/or arbitrary footer content.
  children: ReactNode;
  // Accessible name for both the trigger and the popup menu. Required: the
  // trigger is often an icon (e.g. the hamburger), so without it the button would
  // ship unnamed in the accessibility tree.
  label: string;
  tone?: MenuTone;
  side?: PositionerProps['side'];
  align?: PositionerProps['align'];
  sideOffset?: PositionerProps['sideOffset'];
  // Element to position against (defaults to the trigger). Accepts Base UI's
  // anchor shapes — e.g. `() => document.querySelector('.app-header')`.
  anchor?: PositionerProps['anchor'];
  // Modal locks page scroll + blocks outside interaction. Default off (a
  // lightweight dropdown that doesn't trap the page).
  modal?: boolean;
  // Classes for the trigger button (the glyph/badge styling lives at the call
  // site, like the abstract-tone pattern across the UI primitives).
  triggerClassName?: string;
  // Extra classes merged onto the popup (the surface look + sizing).
  className?: string;
}) {
  return (
    <Base.Root modal={modal}>
      <Base.Trigger type="button" aria-label={label} className={triggerClassName}>
        {trigger}
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner
          side={side}
          align={align}
          sideOffset={sideOffset}
          anchor={anchor}
          className="z-50"
        >
          <Base.Popup aria-label={label} className={cn(popup({ tone }), className)}>
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

// Re-exported so consumers compose navigable menu rows through `@/components/ui/menu`
// without reaching for the raw Base UI import (matching how `dialog.tsx` re-exports
// its Close). Renders an `<a>`; pass `render={<Link … />}` to compose with Next.
export const MenuLinkItem = Base.LinkItem;

// The non-link action row (closes the menu on select by default) and the section
// divider, re-exported on the same terms as MenuLinkItem. First consumer is the
// account menu's global half; the Run-As selector (ACCOUNT.8) composes the same
// parts.
export const MenuItem = Base.Item;
export const MenuSeparator = Base.Separator;

// The pick-one-of-N rows (`role="menuitemradio"` + aria-checked for free),
// re-exported on the same terms. First consumer is the Run-As build-character
// selector (ACCOUNT.8). ⚠️ Unlike MenuItem, a RadioItem does NOT close the menu
// on select by default — pass `closeOnClick` explicitly.
export const MenuRadioGroup = Base.RadioGroup;
export const MenuRadioItem = Base.RadioItem;
export const MenuRadioItemIndicator = Base.RadioItemIndicator;
