'use client';

import { Menu as Base } from '@base-ui/react/menu';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from './cn';
import {
  menuControlRow,
  menuRow,
  menuSection,
  menuSectionLabel,
  menuSeparator,
  panelSurface,
  panelSurfaceSolid,
} from './dropdown-panel';
import type { Tone } from './tones';

export type MenuTone = Extract<Tone, 'neutral'>;

const popup = cva('flex flex-col outline-none', {
  variants: {
    tone: {
      neutral: '',
    } satisfies Record<MenuTone, string>,
    surface: {
      solid: panelSurfaceSolid,
      frosted: panelSurface,
    },
  },
  defaultVariants: { tone: 'neutral', surface: 'solid' },
});

export type PositionerProps = React.ComponentProps<typeof Base.Positioner>;
export type MenuAnchor = PositionerProps['anchor'];
export type DataAttributes = {
  [key: `data-${string}`]: string | number | boolean | undefined;
};
export type MenuTriggerProps = DataAttributes & {
  ref?: React.Ref<HTMLButtonElement>;
};

export function Menu({
  trigger,
  children,
  label,
  tone = 'neutral',
  surface = 'solid',
  side = 'bottom',
  align = 'end',
  sideOffset = 0,
  anchor,
  modal = false,
  triggerClassName,
  triggerProps,
  popupProps,
  className,
}: {
  trigger: ReactNode;
  children: ReactNode;
  label: string;
  tone?: MenuTone;
  surface?: 'solid' | 'frosted';
  side?: PositionerProps['side'];
  align?: PositionerProps['align'];
  sideOffset?: PositionerProps['sideOffset'];
  anchor?: MenuAnchor;
  modal?: boolean;
  triggerClassName?: string;
  triggerProps?: MenuTriggerProps;
  popupProps?: DataAttributes;
  className?: string;
}) {
  return (
    <Base.Root modal={modal}>
      <Base.Trigger {...triggerProps} type="button" aria-label={label} className={triggerClassName}>
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
          <Base.Popup
            {...popupProps}
            aria-label={label}
            className={cn(popup({ tone, surface }), className)}
          >
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

export const MenuLinkItem = Base.LinkItem;

export const MenuItem = Base.Item;
export const MenuCheckboxItem = Base.CheckboxItem;
export const MenuSeparator = Base.Separator;

export const MenuRadioGroup = Base.RadioGroup;
export const MenuRadioItem = Base.RadioItem;
export const MenuRadioItemIndicator = Base.RadioItemIndicator;

export { menuControlRow, menuRow, menuSection, menuSectionLabel, menuSeparator };
