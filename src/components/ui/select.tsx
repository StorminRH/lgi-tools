'use client';

import { Select as Base } from '@base-ui/react/select';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { dropdownGroupLabel, dropdownItem, dropdownPanel } from './dropdown-panel';
import { fieldText, fieldVariants, focusWell, type FieldSize } from './input';
import { useOverlayPortalContainer } from './overlay-portal-container';
import { scrollArea } from './scroll-area';

export type SelectOption = {
  value: string;
  label: ReactNode;
  triggerLabel?: ReactNode;
  disabled?: boolean;
};
export type SelectOptionGroup = { group: string; options: readonly SelectOption[] };
export type SelectItems = readonly (SelectOption | SelectOptionGroup)[];

function isGroup(entry: SelectOption | SelectOptionGroup): entry is SelectOptionGroup {
  return 'group' in entry;
}

function labelMapOf(items: SelectItems): Record<string, ReactNode> {
  const map: Record<string, ReactNode> = {};
  for (const entry of items) {
    if (isGroup(entry)) {
      for (const option of entry.options) {
        map[option.value] = option.triggerLabel ?? option.label;
      }
    } else {
      map[entry.value] = entry.triggerLabel ?? entry.label;
    }
  }
  return map;
}

export type SelectAlign = 'start' | 'center';

function Option({
  option,
  align,
}: {
  option: SelectOption;
  align: SelectAlign;
}) {
  const centered = align === 'center';
  return (
    <Base.Item
      value={option.value}
      disabled={option.disabled}
      className={cn(
        dropdownItem,
        centered && 'relative justify-center px-6 text-center',
      )}
    >
      <Base.ItemText className={cn(centered && 'text-center')}>
        {option.label}
      </Base.ItemText>
      <Base.ItemIndicator
        className={cn(
          'shrink-0 text-isk',
          centered && 'pointer-events-none absolute end-2.5',
        )}
      >
        ✓
      </Base.ItemIndicator>
    </Base.Item>
  );
}

export function Select({
  value,
  onValueChange,
  items,
  ariaLabel,
  size,
  disabled,
  className,
  align = 'start',
  open,
  onOpenChange,
  caret = true,
}: FieldSize & {
  value: string;
  onValueChange: (value: string) => void;
  items: SelectItems;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  align?: SelectAlign;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  caret?: boolean;
}) {
  const centered = align === 'center';
  const overlayContainer = useOverlayPortalContainer();
  return (
    <Base.Root
      items={labelMapOf(items)}
      value={value}
      onValueChange={(next) => onValueChange(next as string)}
      disabled={disabled}
      {...(open === undefined
        ? {}
        : { open, onOpenChange: (next: boolean) => onOpenChange?.(next) })}
    >
      <Base.Trigger
        aria-label={ariaLabel}
        className={cn(
          fieldVariants({ size }),
          focusWell,
          'flex w-full cursor-pointer items-center gap-1.5',
          centered
            ? 'relative justify-center text-center'
            : 'text-left',
          'data-[popup-open]:border-isk-sub data-[popup-open]:shadow-field-focus',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <Base.Value
          className={cn(
            fieldText,
            'min-w-0 truncate',
            centered ? 'w-full px-6 text-center' : 'flex-1',
          )}
        />
        {caret ? (
          <Base.Icon
            className={cn(
              'shrink-0 text-muted',
              centered &&
                'pointer-events-none absolute end-2 top-1/2 -translate-y-1/2',
            )}
          >
            ▾
          </Base.Icon>
        ) : null}
      </Base.Trigger>
      <Base.Portal {...(overlayContainer ? { container: overlayContainer } : {})}>
        <Base.Positioner side="bottom" sideOffset={4} alignItemWithTrigger={false} className="z-dropdown">
          <Base.Popup
            aria-label={ariaLabel}
            className={cn(
              dropdownPanel,
              scrollArea,
              'max-h-80 overflow-y-auto',
              centered && '!pl-[15px]',
            )}
          >
            <Base.List>
              {items.map((entry, index) =>
                isGroup(entry) ? (
                  <Base.Group key={`group-${index}`}>
                    <Base.GroupLabel
                      className={cn(
                        dropdownGroupLabel,
                        centered && 'text-center',
                      )}
                    >
                      {entry.group}
                    </Base.GroupLabel>
                    {entry.options.map((option) => (
                      <Option
                        key={option.value}
                        option={option}
                        align={align}
                      />
                    ))}
                  </Base.Group>
                ) : (
                  <Option
                    key={entry.value}
                    option={entry}
                    align={align}
                  />
                ),
              )}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
