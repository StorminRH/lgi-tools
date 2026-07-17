'use client';

import { Menu as Base } from '@base-ui/react/menu';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { panelSurface } from './dropdown-panel';
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

/**
 * Closed presentation vocabulary for menu tone; feature callers map domain meaning to these
 * abstract values before rendering.
 */
export type MenuTone = Extract<Tone, 'neutral'>;

// Abstract tone → token classes. The base owns the shared dropdown-panel SURFACE
// (bg-deep well + idle border + the dd shadow, from dropdown-panel.ts) so every menu
// matches the Select popup and the Popover. The call site's `className` supplies only
// structure — the per-panel min-width, the header-flush `border-top: none`, and the
// row rules (globals.css `.nav-menu-panel` / `.account-menu-panel` / `.run-as-menu-panel`).
// Menus stay square with full-width rows, so they take the surface atom, not the full
// dropdownPanel (which adds card radius + a 5px inset the Select popup wants).
const popup = cva(`flex flex-col outline-none ${panelSurface}`, {
  variants: {
    tone: {
      neutral: '',
    } satisfies Record<MenuTone, string>,
  },
  defaultVariants: { tone: 'neutral' },
});

type PositionerProps = React.ComponentProps<typeof Base.Positioner>;

/**
 * Renders the domain-neutral menu with house behavior and tokens; callers own semantic meaning and
 * content while this primitive owns presentation.
 */
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
          className="z-dropdown"
        >
          <Base.Popup aria-label={label} className={cn(popup({ tone }), className)}>
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

/**
 * Re-exported so consumers compose navigable menu rows through `@/components/ui/menu`
 * without reaching for the raw Base UI import (matching how `dialog.tsx` re-exports
 * its Close). Renders an `<a>`; pass `render={<Link … />}` to compose with Next.
 */
export const MenuLinkItem = Base.LinkItem;

/**
 * The non-link action row (closes the menu on select by default) and the section
 * divider, re-exported on the same terms as MenuLinkItem. First consumer is the
 * account menu's global half; the Run-As selector (ACCOUNT.8) composes the same
 * parts.
 */
export const MenuItem = Base.Item;
/**
 * Adopted Base UI menu separator part exposed through the single house wrapper; consumers compose
 * it only within this primitive family.
 */
export const MenuSeparator = Base.Separator;

/**
 * The pick-one-of-N rows (`role="menuitemradio"` + aria-checked for free),
 * re-exported on the same terms. First consumer is the Run-As build-character
 * selector (ACCOUNT.8). ⚠️ Unlike MenuItem, a RadioItem does NOT close the menu
 * on select by default — pass `closeOnClick` explicitly.
 */
export const MenuRadioGroup = Base.RadioGroup;
/**
 * Adopted Base UI menu radio item part exposed through the single house wrapper; consumers compose
 * it only within this primitive family.
 */
export const MenuRadioItem = Base.RadioItem;
/**
 * Adopted Base UI menu radio item indicator part exposed through the single house wrapper;
 * consumers compose it only within this primitive family.
 */
export const MenuRadioItemIndicator = Base.RadioItemIndicator;
