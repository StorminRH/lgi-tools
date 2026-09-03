'use client';

import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import type { ReactNode } from 'react';
import { chipVariants } from './chip';
import { cn } from './cn';
import type { ChipTone } from './tones';

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
  appearance = 'tone',
}: {
  tone: ChipTone;
  value: string;
  children: ReactNode;
  className?: string;
  appearance?: 'tone' | 'filter' | 'row';
}) {
  return (
    <Toggle
      value={value}
      className={(state) =>
        cn(
          appearance === 'row'
            ? 'inline-flex items-center rounded-ctl px-2 py-1.5 font-ui text-ui text-muted'
            : chipVariants({ tone }),
          'cursor-pointer transition-colors motion-reduce:transition-none',
          appearance === 'filter' &&
            !state.pressed &&
            'bg-surface-sunk text-muted border-border-idle hover:border-border-active hover:text-name',
          appearance === 'filter' && state.pressed && chipVariants({ tone }),
          appearance === 'tone' && state.pressed && 'bg-chip-pressed-bg text-isk border-isk-dim',
          appearance === 'row' && 'hover:bg-row-sites-hover hover:text-text',
          appearance === 'row' && state.pressed && 'bg-row-sites-on text-name',
          className,
        )
      }
    >
      {children}
    </Toggle>
  );
}
