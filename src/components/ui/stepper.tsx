'use client';

import { NumberField } from '@base-ui/react/number-field';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { ChevronDownIcon } from './icons';

export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  ariaLabel,
  variant = 'default',
  trailing,
  reserveTrailing = false,
  className,
  valueClassName,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
  variant?: 'default' | 'inline';
  trailing?: ReactNode;
  reserveTrailing?: boolean;
  className?: string;
  valueClassName?: string;
}) {
  const inline = variant === 'inline';
  const chevron =
    'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full bg-row-on text-muted ' +
    'transition-[background-color,color,scale] duration-fast hover:bg-border-active hover:text-name active:scale-90 ' +
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-row-on disabled:hover:text-muted';
  const btn = inline
    ? `${chevron} relative size-4 after:absolute after:-inset-1 after:content-['']`
    : `${chevron} size-6`;
  return (
    <NumberField.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      onValueCommitted={(next) => onChange(next ?? min)}
      min={min}
      max={max}
      step={step}
      smallStep={step}
      largeStep={step * 10}
      format={{ maximumFractionDigits: 0 }}
      className={cn(
        'inline-flex items-center',
        (trailing != null || reserveTrailing) && 'gap-1',
        className,
      )}
    >
      {stepperField({ ariaLabel, btn, inline, valueClassName })}
      {(trailing != null || reserveTrailing) && (
        <span className="inline-flex w-3.5 shrink-0 items-center justify-center">
          {trailing}
        </span>
      )}
    </NumberField.Root>
  );
}

function stepperField({
  ariaLabel,
  btn,
  inline,
  valueClassName,
}: {
  ariaLabel: string;
  btn: string;
  inline: boolean;
  valueClassName?: string;
}) {
  return (
    <NumberField.Group className={cn('inline-flex items-center', !inline && 'gap-1')}>
      <NumberField.Decrement aria-label={`Decrease ${ariaLabel}`} className={btn}>
        <ChevronDownIcon size={inline ? 11 : 13} />
      </NumberField.Decrement>
      <NumberField.Input
        aria-label={ariaLabel}
        className={cn(
          'bg-transparent text-center font-ui tabular-nums text-name outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          inline
            ? 'w-[22px] text-ui'
            : 'h-7 w-10 rounded-ctl text-nav focus-visible:ring-1 focus-visible:ring-isk-sub',
          valueClassName,
        )}
      />
      <NumberField.Increment aria-label={`Increase ${ariaLabel}`} className={btn}>
        <ChevronDownIcon size={inline ? 11 : 13} className="rotate-180" />
      </NumberField.Increment>
    </NumberField.Group>
  );
}
