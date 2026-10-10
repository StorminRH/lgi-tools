'use client';

import { Menu as Base } from '@base-ui/react/menu';
import { cva } from 'class-variance-authority';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn';
import {
  menuControlRow,
  menuRow,
  menuSection,
  menuSectionLabel,
  menuSeparator,
  panelSurface,
  menuPanelSurface,
} from './dropdown-panel';

const popup = cva('flex flex-col outline-none', {
  variants: {
    surface: {
      solid: menuPanelSurface,
      frosted: panelSurface,
    },
  },
  defaultVariants: { surface: 'solid' },
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
  surface = 'solid',
  side = 'bottom',
  align = 'end',
  sideOffset = 0,
  alignOffset = 0,
  collisionPadding,
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
  surface?: 'solid' | 'frosted';
  side?: PositionerProps['side'];
  align?: PositionerProps['align'];
  sideOffset?: PositionerProps['sideOffset'];
  alignOffset?: PositionerProps['alignOffset'];
  collisionPadding?: PositionerProps['collisionPadding'];
  anchor?: MenuAnchor;
  modal?: boolean;
  triggerClassName?: string;
  triggerProps?: MenuTriggerProps;
  popupProps?: DataAttributes & { style?: CSSProperties };
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
          alignOffset={alignOffset}
          collisionPadding={collisionPadding}
          anchor={anchor}
          className="z-dropdown"
        >
          <Base.Popup
            {...popupProps}
            aria-label={label}
            className={cn(popup({ surface }), className)}
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

export function MenuGroup({
  label,
  hideLabel = false,
  children,
  ...props
}: DataAttributes & { label: string; hideLabel?: boolean; children: ReactNode }) {
  return (
    <div {...props} className={cn(menuSection, hideLabel && 'pt-1')} role="group" aria-label={label}>
      {!hideLabel && (
        <div className={menuSectionLabel} aria-hidden="true">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

export { menuControlRow, menuRow, menuSeparator };
