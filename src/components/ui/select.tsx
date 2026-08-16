'use client';

import { Select as Base } from '@base-ui/react/select';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { dropdownGroupLabel, dropdownItem, dropdownPanel } from './dropdown-panel';
import { fieldText, fieldVariants, focusWell, type FieldSize } from './input';
import { useOverlayPortalContainer } from './overlay-portal-container';
import { scrollArea } from './scroll-area';

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

/**
 * One caller-supplied select option; its value is the stable control key and its label or marker
 * is presentation-ready.
 */
export type SelectOption = {
  value: string;
  label: ReactNode;
  /** Closed-trigger text; defaults to `label` so the list and trigger stay in sync. */
  triggerLabel?: ReactNode;
  disabled?: boolean;
};
/**
 * One labelled select group containing ordered options; group labels are presentation only and
 * option values remain the control keys.
 */
export type SelectOptionGroup = { group: string; options: readonly SelectOption[] };
/**
 * Ordered select input accepted by the shared wrapper, allowing plain options and labelled groups
 * in one canonical collection.
 */
export type SelectItems = readonly (SelectOption | SelectOptionGroup)[];

function isGroup(entry: SelectOption | SelectOptionGroup): entry is SelectOptionGroup {
  return 'group' in entry;
}

// The value→label map Base UI's `Select.Value` resolves the trigger label from.
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

/** Closed-trigger and popup-item text alignment; default keeps start/left house layout. */
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
          // Out of flow so selected checkmarks do not shift the centered label.
          centered && 'pointer-events-none absolute end-2.5',
        )}
      >
        ✓
      </Base.ItemIndicator>
    </Base.Item>
  );
}

/**
 * Renders the domain-neutral select with house behavior and tokens; callers own semantic meaning
 * and content while this primitive owns presentation. `align="center"` opts a
 * consumer into optically centered value/rows (with the caret gutter); the
 * default keeps every existing start-aligned call site byte-identical.
 */
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
  // Optical content alignment for the closed value and open list rows.
  align?: SelectAlign;
  // Optional controlled popup; omit both to keep Base UI's uncontrolled open.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Closed-trigger caret. Flat scanner cells hide it once a value is set.
  caret?: boolean;
}) {
  const centered = align === 'center';
  // Prefer the enclosing Dialog/Drawer popup so the list stacks above the
  // overlay (same seam as Combobox/Popover/PointerMenu). Outside an overlay,
  // omit container and keep the default body portal.
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
            // Equal horizontal pad matches the absolute caret width so short
            // values stay optically centered in the full well.
            centered ? 'w-full px-6 text-center' : 'flex-1',
          )}
        />
        {caret ? (
          <Base.Icon
            className={cn(
              'shrink-0 text-muted',
              // Absolute caret so the value centers in the full well width.
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
              // Centered lists need a left gutter so scroll-track asymmetry
              // does not pull option labels off optical center.
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
