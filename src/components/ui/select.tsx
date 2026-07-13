'use client';

import { Select as Base } from '@base-ui/react/select';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { dropdownGroupLabel, dropdownItem, dropdownPanel } from './dropdown-panel';
import { fieldText, fieldVariants, focusWell, type FieldSize } from './input';

// The platform's one dropdown-select primitive — the idiomatic Base UI Select,
// wearing the C1 field WELL as its closed trigger (so a shut select is
// indistinguishable from an Input/Textarea) and the shared dropdown-panel as its
// open popup (so no OS-styled <select> popup ever renders inside the dark UI). It
// supersedes the native <select> the C1 field primitive shipped as an interim home.
//
// Data-driven: the caller hands in an `items` list — flat `{ value, label }`
// options, or `{ group, options }` sections — and the primitive both renders the
// popup rows AND feeds Base UI the value→label map its trigger needs. (Base UI shows
// the raw value in the trigger otherwise: item labels register only once the popup
// has opened, so without the map a freshly-loaded select would show its encoded
// value until first opened.) Controlled: the caller owns `value` + `onValueChange`.
// Base UI supplies typeahead, roving focus, Esc + outside-press dismiss, and
// touch/keyboard open — none hand-rolled.

export type SelectOption = { value: string; label: ReactNode; disabled?: boolean };
export type SelectOptionGroup = { group: string; options: readonly SelectOption[] };
export type SelectItems = readonly (SelectOption | SelectOptionGroup)[];

function isGroup(entry: SelectOption | SelectOptionGroup): entry is SelectOptionGroup {
  return 'group' in entry;
}

// The value→label map Base UI's `Select.Value` resolves the trigger label from.
function labelMapOf(items: SelectItems): Record<string, ReactNode> {
  const map: Record<string, ReactNode> = {};
  for (const entry of items) {
    if (isGroup(entry)) {
      for (const option of entry.options) map[option.value] = option.label;
    } else {
      map[entry.value] = entry.label;
    }
  }
  return map;
}

function Option({ option }: { option: SelectOption }) {
  return (
    <Base.Item value={option.value} disabled={option.disabled} className={dropdownItem}>
      <Base.ItemText>{option.label}</Base.ItemText>
      <Base.ItemIndicator className="shrink-0 text-isk">✓</Base.ItemIndicator>
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
}: FieldSize & {
  // Controlled selected value (the encoded option value).
  value: string;
  onValueChange: (value: string) => void;
  // The options — flat, or grouped into labelled sections.
  items: SelectItems;
  // Accessible name for the trigger + popup (the trigger is value-only chrome).
  ariaLabel: string;
  disabled?: boolean;
  // Extra classes on the trigger well (width/height overrides ride here).
  className?: string;
}) {
  return (
    <Base.Root
      items={labelMapOf(items)}
      value={value}
      onValueChange={(next) => onValueChange(next as string)}
      disabled={disabled}
    >
      <Base.Trigger
        aria-label={ariaLabel}
        className={cn(
          fieldVariants({ size }),
          focusWell,
          'flex w-full cursor-pointer items-center gap-1.5 text-left',
          'data-[popup-open]:border-isk-sub data-[popup-open]:shadow-field-focus',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <Base.Value className={cn(fieldText, 'min-w-0 flex-1 truncate')} />
        <Base.Icon className="shrink-0 text-muted">▾</Base.Icon>
      </Base.Trigger>
      <Base.Portal>
        <Base.Positioner side="bottom" sideOffset={4} alignItemWithTrigger={false} className="z-dropdown">
          <Base.Popup
            aria-label={ariaLabel}
            className={cn(dropdownPanel, 'max-h-80 overflow-y-auto')}
          >
            <Base.List>
              {items.map((entry, index) =>
                isGroup(entry) ? (
                  <Base.Group key={`group-${index}`}>
                    <Base.GroupLabel className={dropdownGroupLabel}>{entry.group}</Base.GroupLabel>
                    {entry.options.map((option) => (
                      <Option key={option.value} option={option} />
                    ))}
                  </Base.Group>
                ) : (
                  <Option key={entry.value} option={entry} />
                ),
              )}
            </Base.List>
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}
