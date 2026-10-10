'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { pillVariants, type PillTone } from './pill';

export function ChipToggleGroup({
  value,
  onValueChange,
  label,
  className,
  children,
}: {
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <ToggleGroup
      multiple
      value={value}
      onValueChange={onValueChange}
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      {children}
    </ToggleGroup>
  );
}

export function ChipToggle({
  tone,
  value,
  children,
  className,
}: {
  tone: PillTone;
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Toggle
      value={value}
      className={(state) =>
        cn(
          pillVariants({ tone }),
          'chip-toggle cursor-pointer',
          !state.pressed && '[--pill-tone:var(--color-faint)] text-muted hover:text-name',
          className,
        )
      }
    >
      {children}
    </Toggle>
  );
}

/** A list-row toggle for a ChipToggleGroup: untinted, with the row fill when pressed. */
export function ToggleRow({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Toggle
      value={value}
      className={(state) =>
        cn(
          'inline-flex items-center rounded-ctl px-2.5 py-1.5 font-ui text-ui text-muted',
          'chip-toggle cursor-pointer hover:bg-row-sites-hover hover:text-text',
          state.pressed && 'bg-row-sites-on text-name',
          className,
        )
      }
    >
      {children}
    </Toggle>
  );
}
