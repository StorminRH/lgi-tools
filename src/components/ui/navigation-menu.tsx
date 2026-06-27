'use client';

import { NavigationMenu as Base } from '@base-ui/react/navigation-menu';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import type { Tone } from './tones';

// The platform's horizontal navigation-bar primitive — the idiomatic Base UI
// NavigationMenu, styled to the existing tokens. Renders a <nav> of full-height
// link cells (the desktop tool strip today). Built on NavigationMenu rather than
// a bare <nav> so a tool can later grow a dropdown panel: a `NavigationMenuItem`
// gains a Base UI `Trigger` + `Content` without restructuring the bar. Nothing
// dropdown-related is wired yet — this is the open seam. `NavigationMenuLink`
// carries a native `active` (current page → `aria-current`). The cell look lives
// at the call site (globals.css `.nav-tool`), abstract-tone style; the primitive
// owns only layout (a full-height flex row).

export type NavigationMenuTone = Extract<Tone, 'neutral'>;

// The list is the flex row. Structural-only tone (the cell surface is the call
// site's `.nav-tool`), matching `menu.tsx`'s lean tone; reset the <ul> defaults.
const list = cva('flex items-stretch list-none m-0 p-0', {
  variants: {
    tone: {
      neutral: '',
    } satisfies Record<NavigationMenuTone, string>,
  },
  defaultVariants: { tone: 'neutral' },
});

export function NavigationMenu({
  children,
  label,
  tone = 'neutral',
  className,
}: {
  // The `NavigationMenuItem`s (each wrapping a link or, later, a dropdown).
  children: ReactNode;
  // Accessible name for the <nav> landmark. Required so the landmark is always
  // distinguishable to assistive tech.
  label: string;
  tone?: NavigationMenuTone;
  // Classes for the <nav> root (placement + the strip's framing hairlines).
  className?: string;
}) {
  return (
    // `flex` on the root <nav> lets the list stretch to the header's full height.
    <Base.Root aria-label={label} className={cn('flex', className)}>
      <Base.List className={list({ tone })}>{children}</Base.List>
    </Base.Root>
  );
}

// Re-exported so consumers compose the bar through `@/components/ui/navigation-menu`
// (matching how `menu.tsx` re-exports `MenuLinkItem`). `Item` renders an <li>;
// `Link` an <a> — pass `render={<Link … />}` to compose with Next, and `active`
// for the current page.
export const NavigationMenuItem = Base.Item;
export const NavigationMenuLink = Base.Link;
