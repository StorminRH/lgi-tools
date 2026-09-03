'use client';

import { Autocomplete } from '@base-ui/react/autocomplete';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';
import { dropdownGroupLabel, dropdownPanel } from './dropdown-panel';
import { fieldText, fieldVariants, focusWell, type FieldSize } from './input';
import { useOverlayPortalContainer } from './overlay-portal-container';

export const Root = Autocomplete.Root;

export const Field = forwardRef<
  HTMLInputElement,
  FieldSize & {
    prompt?: ReactNode;
    trailing?: ReactNode;
    className?: string;
  } & Omit<ComponentProps<'input'>, 'size'>
>(function Field({ prompt, trailing, size, className, ...inputProps }, ref) {
  return (
    <Autocomplete.InputGroup
      className={cn(fieldVariants({ size }), focusWell, 'flex items-center gap-1.5', className)}
    >
      {prompt}
      <Autocomplete.Input
        ref={ref}
        className={cn(fieldText, 'min-w-0 flex-1 border-0 bg-transparent outline-none field-own-focus')}
        {...inputProps}
      />
      {trailing}
    </Autocomplete.InputGroup>
  );
});

export function Panel({
  className,
  sideOffset = 6,
  align = 'start',
  children,
}: {
  className?: string;
  sideOffset?: number;
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
}) {
  const overlayContainer = useOverlayPortalContainer();

  return (
    <Autocomplete.Portal {...(overlayContainer ? { container: overlayContainer } : {})}>
      <Autocomplete.Positioner side="bottom" align={align} sideOffset={sideOffset} className="z-dropdown">
        <Autocomplete.Popup className={cn(dropdownPanel, className)}>{children}</Autocomplete.Popup>
      </Autocomplete.Positioner>
    </Autocomplete.Portal>
  );
}

export const List = Autocomplete.List;

export function Group({ className, ...props }: ComponentProps<typeof Autocomplete.Group>) {
  return <Autocomplete.Group className={cn('px-0.5 pt-0.5 pb-1', className)} {...props} />;
}

export function GroupLabel({ className, ...props }: ComponentProps<typeof Autocomplete.GroupLabel>) {
  return (
    <Autocomplete.GroupLabel
      className={cn(dropdownGroupLabel, 'flex items-center justify-between', className)}
      {...props}
    />
  );
}

export function Item({ className, ...props }: ComponentProps<typeof Autocomplete.Item>) {
  return (
    <Autocomplete.Item
      className={cn(
        'cursor-default select-none rounded-ctl outline-none',
        'data-[highlighted]:bg-row-active data-[highlighted]:text-name',
        className,
      )}
      {...props}
    />
  );
}
