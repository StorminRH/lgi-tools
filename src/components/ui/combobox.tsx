'use client';

// The platform's one combobox primitive — the idiomatic Base UI Autocomplete,
// wearing the C1 field WELL as its text input (so an open combobox is
// indistinguishable from an Input/Select) and the shared dropdown-panel as its
// floating popup (so search dropdowns finally match the Menu/Select/Popover). It
// supersedes the two hand-rolled comboboxes (the terminal-style picker and the
// header global search), retiring their bespoke listbox/keyboard/focus code.
//
// Base UI Autocomplete (not Combobox) is the fit: both consumers are free-text
// search that navigate on select with no persisted selection. It supplies roving
// highlight, aria-activedescendant, Esc + outside-press dismiss, and touch/keyboard
// open — none hand-rolled. Results come from our own search engine, so consumers
// pass `filter={null}` and feed `items` themselves (external filtering); the input
// text is controlled via Root's `value`/`onValueChange`.
//
// Compositional, not packaged: the two surfaces render very different rows (flat
// suggestion strings vs grouped, grid-laid-out rich rows), so this exposes styled
// parts rather than one `items`-driven component. Every token is already minted in
// globals.css and registered in cn.ts — no new families here.

import { Autocomplete } from '@base-ui/react/autocomplete';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';
import { dropdownGroupLabel, dropdownPanel } from './dropdown-panel';
import { fieldText, fieldVariants, focusWell, type FieldSize } from './input';

// Root renders no DOM of its own; re-exported as-is so Base UI's generic item
// typing flows through untouched. Consumers own the controlled surface —
// `value`/`onValueChange` for the text, `items` for the (already-filtered) model,
// `filter={null}` to keep Base UI from re-filtering, and `open`/`onOpenChange`
// when the open state must sync with an external one (the header search box).
export const Root = Autocomplete.Root;

// The field WELL as the combobox's input row: the InputGroup wears the same
// engraved well as Input/Select/Textarea (`fieldVariants` + `focusWell` + the
// `.field-own-focus` opt-out of the global ring), framing a leading `prompt` slot
// (e.g. a `>`), the text input, and a trailing adornment slot. The ref forwards to
// the real `<input>` so a consumer can focus it (⌘K) or tag it with a data hook.
export const Field = forwardRef<
  HTMLInputElement,
  FieldSize & {
    // Leading element rendered before the input (the `>` prompt).
    prompt?: ReactNode;
    // Trailing element rendered after the input (a ⌘K / esc hint chip).
    trailing?: ReactNode;
    // Extra classes on the InputGroup well (width / animation ride here).
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

// The floating results panel — portaled, positioned below the field, wearing the
// shared recessed dropdown-panel surface. `className` sizes / caps the popup.
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
  return (
    <Autocomplete.Portal>
      <Autocomplete.Positioner side="bottom" align={align} sideOffset={sideOffset} className="z-50">
        <Autocomplete.Popup className={cn(dropdownPanel, className)}>{children}</Autocomplete.Popup>
      </Autocomplete.Positioner>
    </Autocomplete.Portal>
  );
}

// The list container (role=listbox). Structural — spacing lives on the panel and
// on grouped sections, so this is a thin passthrough.
export const List = Autocomplete.List;

// A labelled group of rows. Frames a section within the panel; the label wears the
// faint uppercase micro-caps every dropdown group uses.
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

// A selectable row. Bakes in only the interactive BEHAVIOR — the control radius and
// the highlight treatment Base UI drives via `data-highlighted` — so each consumer
// composes its own row CONTENT/layout on top (a plain suggestion line, or a rich
// icon+label+sub grid card). `onClick` fires on pointer click AND on Enter when the
// row is the highlighted one.
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
