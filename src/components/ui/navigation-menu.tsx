'use client';

import { NavigationMenu as Base } from '@base-ui/react/navigation-menu';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import type { Tone } from './tones';

export type NavigationMenuTone = Extract<Tone, 'neutral'>;

const list = cva('flex items-center gap-0.5 list-none m-0 p-0', {
  variants: {
    tone: {
      neutral: '',
    } satisfies Record<NavigationMenuTone, string>,
  },
  defaultVariants: { tone: 'neutral' },
});

export const navigationMenuLink = cva(
  'inline-flex items-center whitespace-nowrap font-ui text-nav font-medium text-muted ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset ' +
    'focus-visible:ring-isk-sub motion-reduce:transition-none',
  {
    variants: {
      placement: {
        desktop:
          'relative h-9 rounded-full px-3.5 ' +
          'after:absolute after:inset-x-3.5 after:-bottom-[9px] after:h-px after:bg-isk after:opacity-0 ' +
          'after:shadow-status-info after:transition-opacity motion-reduce:after:transition-none',
        menu: 'w-full border-b border-border-soft px-4 py-3',
      },
      active: {
        true: 'text-name bg-row-on shadow-card-edge after:opacity-100',
        false: '',
      },
      disabled: {
        true: 'cursor-default opacity-40',
        false: 'cursor-pointer',
      },
    },
    compoundVariants: [
      {
        placement: 'desktop',
        disabled: false,
        className: 'hover:bg-row-related hover:text-name',
      },
      {
        placement: 'menu',
        disabled: false,
        className: 'hover:bg-row-active hover:text-name',
      },
    ],
    defaultVariants: {
      placement: 'desktop',
      active: false,
      disabled: false,
    },
  },
);

export function NavigationMenu({
  children,
  label,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  label: string;
  tone?: NavigationMenuTone;
  className?: string;
}) {
  return (
    <Base.Root aria-label={label} className={cn('flex', className)}>
      <Base.List className={list({ tone })}>{children}</Base.List>
    </Base.Root>
  );
}

export const NavigationMenuItem = Base.Item;
export const NavigationMenuLink = Base.Link;
